import type {
  ClassNoncombatRepository,
  NoncombatGateReason,
  NoncombatTargetRecord,
  PriestAidRecord,
  PriestBlessingRecord,
  RoguePickpocketAttemptRecord
} from "../db/repositories/classNoncombatRepository";
import type { CharacterRecord } from "../db/repositories/characterRepository";
import type { EquipmentRepository } from "../db/repositories/equipmentRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  buildPriestBlessingPlan,
  buildPriestHealPlan,
  buildRoguePickpocketPlan,
  CLASS_NONCOMBAT_MIN_LEVEL,
  PRIEST_BLESSING_DURATION_MINUTES,
  PRIEST_DIRECT_AID_COOLDOWN_MINUTES,
  ROGUE_PICKPOCKET_COOLDOWN_MINUTES
} from "../domain/noncombat/classNoncombatTechniques";
import { applyPriestBlessingBonusToSummary } from "../domain/noncombat/priestBlessingBonus";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";
import { getEquippedItemContents } from "./equipmentService";
import { PRESENCE_ACTIVE_MS } from "./presenceService";
import { toKorchmaLocalDate } from "./tavernRaidService";
import type { AchievementService, AchievementUnlock } from "./achievementService";

export type ClassNoncombatMode = "priest" | "rogue";

export interface ClassNoncombatTarget extends NoncombatTargetRecord {
  canPriestAid: boolean;
  canRoguePickpocket: boolean;
}

export type ClassNoncombatOpenResult =
  | { state: "no-character" }
  | {
      state: "ready";
      mode: ClassNoncombatMode;
      character: CharacterSummary;
      actorBlocked: boolean;
      locationName: string;
      targets: ClassNoncombatTarget[];
      targetPage: number;
      targetTotalPages: number;
      priestBlessCooldownAvailableAt: Date | null;
      priestSelfBlessAvailableAt: Date | null;
      roguePickpocketCooldownAvailableAt: Date | null;
    }
  | { state: "not-eligible"; character: CharacterSummary; requiredLevel: number };

export type PriestHealResult =
  | { state: "completed"; action: PriestAidRecord; actor: CharacterSummary; target: CharacterSummary; unlocks: AchievementUnlock[] }
  | { state: "blocked"; reason: NoncombatGateReason; actor?: CharacterSummary; target?: CharacterSummary; availableAt?: Date; blessing?: PriestBlessingRecord };

export type PriestBlessResult =
  | {
      state: "completed";
      action: PriestAidRecord;
      blessing: PriestBlessingRecord;
      actor: CharacterSummary;
      target: CharacterSummary;
      unlocks: AchievementUnlock[];
    }
  | { state: "blocked"; reason: NoncombatGateReason; actor?: CharacterSummary; target?: CharacterSummary; availableAt?: Date; blessing?: PriestBlessingRecord };

export type RoguePickpocketResult =
  | {
      state: "completed";
      attempt: RoguePickpocketAttemptRecord;
      actor: CharacterSummary;
      target: CharacterSummary;
      created: boolean;
      unlocks: AchievementUnlock[];
    }
  | { state: "blocked"; reason: NoncombatGateReason; actor?: CharacterSummary; target?: CharacterSummary; availableAt?: Date };

export class ClassNoncombatService {
  constructor(
    private readonly repository: ClassNoncombatRepository,
    private readonly clock: Clock = systemClock,
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly achievements?: AchievementService,
    private readonly equipment?: Pick<EquipmentRepository, "listByTelegramUserId">
  ) {}

  async openForTelegramUser(
    telegramUserId: bigint,
    mode: ClassNoncombatMode,
    page = 0
  ): Promise<ClassNoncombatOpenResult> {
    const now = this.clock();
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, {
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      page,
      pageSize: 5,
      now,
      ...(mode === "rogue" ? { rogueAttemptedLocalDate: toKorchmaLocalDate(now) } : {})
    });
    if (!snapshot) {
      return { state: "no-character" };
    }

    const effectiveActor = await this.summarizeForPlanning(telegramUserId, snapshot.character, now);
    const character = effectiveActor.summary;
    const eligible =
      character.level >= CLASS_NONCOMBAT_MIN_LEVEL &&
      ((mode === "priest" && character.classId === "class.priest") ||
        (mode === "rogue" && character.classId === "class.rogue"));
    if (!eligible) {
      return { state: "not-eligible", character, requiredLevel: CLASS_NONCOMBAT_MIN_LEVEL };
    }

    return {
      state: "ready",
      mode,
      character,
      actorBlocked: snapshot.actorBlocked,
      locationName: snapshot.locationName,
      targetPage: snapshot.targetPage,
      targetTotalPages: snapshot.targetTotalPages,
      targets: await Promise.all(snapshot.targets.map(async (target) => ({
        ...target,
        ...summarizeTargetFields((await this.summarizeForPlanning(target.telegramUserId, target.character, now)).summary),
        canPriestAid: mode === "priest",
        canRoguePickpocket:
          mode === "rogue" &&
          target.level >= CLASS_NONCOMBAT_MIN_LEVEL &&
          !target.rogueAttemptedToday &&
          !snapshot.roguePickpocketCooldownAvailableAt
      }))),
      priestBlessCooldownAvailableAt: snapshot.priestBlessCooldownAvailableAt,
      priestSelfBlessAvailableAt: snapshot.priestSelfBlessAvailableAt,
      roguePickpocketCooldownAvailableAt: snapshot.roguePickpocketCooldownAvailableAt
    };
  }

  async healForTelegramUser(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint | null;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
    }
  ): Promise<PriestHealResult> {
    const now = this.clock();
    const preflight = await this.repository.getSnapshotForTelegramUser(actorTelegramUserId, {
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      page: 0,
      pageSize: 50,
      now
    });
    const actor = preflight
      ? await this.summarizeForPlanning(actorTelegramUserId, preflight.character, now)
      : null;
    const targetRecord = input.targetTelegramUserId === null
      ? null
      : preflight?.targets.find((candidate) => candidate.telegramUserId === input.targetTelegramUserId) ?? null;
    const target = input.targetTelegramUserId === null
      ? actor
      : targetRecord
        ? await this.summarizeForPlanning(targetRecord.telegramUserId, targetRecord.character, now)
        : null;
    const plan = actor && target
      ? buildPriestHealPlan({
          missingHp: target.summary.hpMax - target.summary.hpCurrent,
          charisma: actor.summary.stats.charisma,
          intelligence: actor.summary.stats.intelligence,
          level: actor.summary.level
        })
      : buildPriestHealPlan({ missingHp: 1, charisma: 0, intelligence: 0, level: 1 });
    const result = await this.repository.completePriestHeal(actorTelegramUserId, {
      ...input,
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      now,
      healAmount: plan.heal,
      targetEffectiveHpMax: target?.summary.hpMax ?? 1,
      manaCost: plan.manaCost,
      statSnapshot: actor
        ? buildPriestStatSnapshot(actor, {
            targetLevel: target?.summary.level,
            healAmount: plan.heal,
            targetEffectiveHpMax: target?.summary.hpMax
          })
        : {}
    });

    if (result.state === "blocked") {
      return presentBlocked(result);
    }

    const unlocks = await this.achievements?.trackEventSafely({
      type: "priest.heal.completed",
      characterId: result.action.actorCharacterId,
      occurredAt: result.action.completedAt,
      sourceId: result.action.id
    }) ?? [];

    return {
      state: "completed",
      action: result.action,
      actor: (await this.summarizeForPlanning(result.action.actorTelegramUserId, result.actor, now)).summary,
      target: (await this.summarizeForPlanning(result.action.targetTelegramUserId, result.target, now)).summary,
      unlocks
    };
  }

  async blessForTelegramUser(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint | null;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
    }
  ): Promise<PriestBlessResult> {
    const now = this.clock();
    const snapshot = await this.repository.getSnapshotForTelegramUser(actorTelegramUserId, {
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      page: 0,
      pageSize: 50,
      now
    });
    const actor = snapshot
      ? await this.summarizeForPlanning(actorTelegramUserId, snapshot.character, now)
      : null;
    const targetRecord = input.targetTelegramUserId === null
      ? null
      : snapshot?.targets.find((candidate) => candidate.telegramUserId === input.targetTelegramUserId) ?? null;
    const target = input.targetTelegramUserId === null
      ? actor
      : targetRecord
        ? await this.summarizeForPlanning(targetRecord.telegramUserId, targetRecord.character, now)
        : null;
    const plan = actor && target
      ? buildPriestBlessingPlan({
          priestLevel: actor.summary.level,
          priestIntelligence: actor.summary.stats.intelligence,
          targetLevel: target.summary.level
        })
      : buildPriestBlessingPlan({ priestLevel: 1, priestIntelligence: 0, targetLevel: 1 });
    const result = await this.repository.completePriestBlessing(actorTelegramUserId, {
      ...input,
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      now,
      expiresAt: addMinutes(now, PRIEST_BLESSING_DURATION_MINUTES),
      cooldownAvailableAt: addMinutes(now, PRIEST_DIRECT_AID_COOLDOWN_MINUTES),
      manaCost: plan.manaCost,
      bonusAmount: plan.bonusAmount,
      statSnapshot: actor
        ? {
            ...buildPriestStatSnapshot(actor, { targetLevel: target?.summary.level ?? 1 }),
            levelDiff: plan.levelDiff,
            blessingBonus: plan.bonusAmount
          }
        : {}
    });

    if (result.state === "blocked") {
      return presentBlocked(result);
    }

    const unlocks = await this.achievements?.trackEventSafely({
      type: "priest.blessing.completed",
      characterId: result.action.actorCharacterId,
      occurredAt: result.action.completedAt,
      sourceId: result.action.id
    }) ?? [];

    return {
      state: "completed",
      action: result.action,
      blessing: result.blessing,
      actor: (await this.summarizeForPlanning(result.action.actorTelegramUserId, result.actor, now)).summary,
      target: (await this.summarizeForPlanning(result.action.targetTelegramUserId, result.target, now)).summary,
      unlocks
    };
  }

  async pickpocketForTelegramUser(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
    }
  ): Promise<RoguePickpocketResult> {
    const now = this.clock();
    const snapshot = await this.repository.getSnapshotForTelegramUser(actorTelegramUserId, {
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      page: 0,
      pageSize: 50,
      now
    });
    const actor = snapshot
      ? await this.summarizeForPlanning(actorTelegramUserId, snapshot.character, now)
      : null;
    const targetRecord = snapshot?.targets.find((candidate) => candidate.telegramUserId === input.targetTelegramUserId) ?? null;
    const target = targetRecord
      ? await this.summarizeForPlanning(targetRecord.telegramUserId, targetRecord.character, now)
      : null;
    const plan = buildRoguePickpocketPlan({
      rogueDexterity: actor?.summary.stats.dexterity ?? 0,
      rogueLuck: actor?.summary.stats.luck ?? 0,
      rogueLevel: actor?.summary.level ?? 1,
      targetLevel: target?.summary.level ?? 1,
      targetGold: target?.summary.gold ?? 0,
      baseRoll: this.rng.nextInt(0, 4),
      outcomeRoll: this.rng.nextInt(-13, 13)
    });
    const result = await this.repository.completeRoguePickpocket(actorTelegramUserId, {
      ...input,
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      now,
      localDate: toKorchmaLocalDate(now),
      cooldownAvailableAt: addMinutes(now, ROGUE_PICKPOCKET_COOLDOWN_MINUTES),
      outcome: plan.outcome,
      stolenGold: plan.stolenGold,
      statSnapshot: {
        ...buildRogueStatSnapshot(actor),
        targetLevel: target?.summary.level ?? 1,
        baseGold: plan.baseGold,
        bonusGold: plan.bonusGold,
        levelDiff: plan.levelDiff,
        power: plan.power
      }
    });

    if (result.state === "blocked") {
      return presentBlocked(result);
    }

    const unlocks = result.created && this.achievements
      ? [
          ...(await this.achievements.trackEventSafely({
            type: "rogue.pickpocket.attempted",
            characterId: result.attempt.actorCharacterId,
            occurredAt: result.attempt.completedAt,
            sourceId: result.attempt.id
          })),
          ...(result.attempt.stolenGold > 0
            ? await this.achievements.trackEventSafely({
                type: "rogue.pickpocket.success",
                characterId: result.attempt.actorCharacterId,
                occurredAt: result.attempt.completedAt,
                sourceId: result.attempt.id
              })
            : []),
          ...(result.attempt.outcome === "caught-badly"
            ? await this.achievements.trackEventSafely({
                type: "rogue.pickpocket.caught",
                characterId: result.attempt.actorCharacterId,
                occurredAt: result.attempt.completedAt,
                sourceId: result.attempt.id
              })
            : [])
        ]
      : [];

    return {
      state: "completed",
      attempt: result.attempt,
      actor: (await this.summarizeForPlanning(result.attempt.actorTelegramUserId, result.actor, now)).summary,
      target: (await this.summarizeForPlanning(result.attempt.targetTelegramUserId, result.target, now)).summary,
      created: result.created,
      unlocks
    };
  }

  private async summarizeForPlanning(
    telegramUserId: bigint,
    character: CharacterRecord,
    now: Date
  ): Promise<EffectiveClassNoncombatCharacter> {
    const [equipmentSnapshot, activeBlessing] = await Promise.all([
      this.equipment?.listByTelegramUserId(telegramUserId) ?? Promise.resolve(null),
      this.repository.getActivePriestBlessingForTelegramUser(telegramUserId, now)
    ]);
    const equippedItems = equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : [];
    const baseSummary = summarizeCharacter(character, { equippedItems });

    return {
      summary: applyPriestBlessingBonusToSummary(baseSummary, activeBlessing, now),
      equippedItemIds: equippedItems.map((item) => item.id),
      activePriestBlessing: activeBlessing
    };
  }
}

function presentBlocked<T extends { state: "blocked"; reason: NoncombatGateReason; actor?: unknown; target?: unknown; availableAt?: Date; blessing?: PriestBlessingRecord }>(
  result: T
): T & { actor?: CharacterSummary; target?: CharacterSummary } {
  const mapped = { ...result } as T & { actor?: CharacterSummary; target?: CharacterSummary };
  if (result.actor) {
    mapped.actor = summarizeCharacter(result.actor as CharacterRecord);
  }
  if (result.target) {
    mapped.target = summarizeCharacter(result.target as CharacterRecord);
  }
  return mapped;
}

interface EffectiveClassNoncombatCharacter {
  summary: CharacterSummary;
  equippedItemIds: string[];
  activePriestBlessing: {
    id: string;
    bonusStat: string | null;
    bonusAmount: number;
    expiresAt: Date;
  } | null;
}

function summarizeTargetFields(summary: CharacterSummary): Pick<NoncombatTargetRecord, "level" | "hpCurrent" | "hpMax" | "gold"> {
  return {
    level: summary.level,
    hpCurrent: summary.hpCurrent,
    hpMax: summary.hpMax,
    gold: summary.gold
  };
}

function buildPriestStatSnapshot(
  actor: EffectiveClassNoncombatCharacter,
  extra: {
    targetLevel?: number | undefined;
    healAmount?: number | undefined;
    targetEffectiveHpMax?: number | undefined;
  } = {}
) {
  return {
    level: actor.summary.level,
    charisma: actor.summary.stats.charisma,
    intelligence: actor.summary.stats.intelligence,
    stats: actor.summary.stats,
    equipmentItemIds: actor.equippedItemIds,
    equipmentEffects: actor.summary.equipmentEffects,
    ...(actor.activePriestBlessing
      ? {
          activePriestBlessing: {
            id: actor.activePriestBlessing.id,
            bonusStat: actor.activePriestBlessing.bonusStat,
            bonusAmount: actor.activePriestBlessing.bonusAmount,
            expiresAt: actor.activePriestBlessing.expiresAt.toISOString()
          }
        }
      : {}),
    ...extra
  };
}

function buildRogueStatSnapshot(actor: EffectiveClassNoncombatCharacter | null) {
  return {
    level: actor?.summary.level ?? 1,
    dexterity: actor?.summary.stats.dexterity ?? 0,
    luck: actor?.summary.stats.luck ?? 0,
    stats: actor?.summary.stats ?? {},
    equipmentItemIds: actor?.equippedItemIds ?? [],
    equipmentEffects: actor?.summary.equipmentEffects,
    ...(actor?.activePriestBlessing
      ? {
          activePriestBlessing: {
            id: actor.activePriestBlessing.id,
            bonusStat: actor.activePriestBlessing.bonusStat,
            bonusAmount: actor.activePriestBlessing.bonusAmount,
            expiresAt: actor.activePriestBlessing.expiresAt.toISOString()
          }
        }
      : {})
  };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
