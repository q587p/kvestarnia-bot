import { items } from "../content";
import type {
  ClassNoncombatRepository,
  NoncombatGateReason,
  NoncombatTargetRecord,
  PriestAidRecord,
  PriestBlessingRecord,
  RoguePickpocketAttemptRecord
} from "../db/repositories/classNoncombatRepository";
import { summarizeCharacter, type CharacterSummary } from "../domain/characters/characterSummary";
import {
  buildPriestHealPlan,
  buildRoguePickpocketPlan,
  CLASS_NONCOMBAT_MIN_LEVEL,
  PRIEST_BLESSING_DURATION_MINUTES,
  PRIEST_DIRECT_AID_COOLDOWN_MINUTES,
  ROGUE_PICKPOCKET_COOLDOWN_MINUTES
} from "../domain/noncombat/classNoncombatTechniques";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";
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
      locationName: string;
      targets: ClassNoncombatTarget[];
      targetPage: number;
      targetTotalPages: number;
      priestHealCooldownAvailableAt: Date | null;
      priestBlessCooldownAvailableAt: Date | null;
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
    private readonly achievements?: AchievementService
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
      now
    });
    if (!snapshot) {
      return { state: "no-character" };
    }

    const character = summarizeWithKnownItems(snapshot.character);
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
      locationName: snapshot.locationName,
      targetPage: snapshot.targetPage,
      targetTotalPages: snapshot.targetTotalPages,
      targets: snapshot.targets.map((target) => ({
        ...target,
        canPriestAid: mode === "priest",
        canRoguePickpocket: mode === "rogue" && target.level >= CLASS_NONCOMBAT_MIN_LEVEL
      })),
      priestHealCooldownAvailableAt: snapshot.priestHealCooldownAvailableAt,
      priestBlessCooldownAvailableAt: snapshot.priestBlessCooldownAvailableAt,
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
    const actor = preflight ? summarizeWithKnownItems(preflight.character) : null;
    const target = input.targetTelegramUserId === null
      ? actor
      : preflight?.targets.find((candidate) => candidate.telegramUserId === input.targetTelegramUserId) ?? null;
    const plan = actor && target
      ? buildPriestHealPlan({
          missingHp: target.hpMax - target.hpCurrent,
          charisma: actor.stats.charisma,
          intelligence: actor.stats.intelligence,
          level: actor.level
        })
      : buildPriestHealPlan({ missingHp: 1, charisma: 0, intelligence: 0, level: 1 });
    const result = await this.repository.completePriestHeal(actorTelegramUserId, {
      ...input,
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      now,
      cooldownAvailableAt: addMinutes(now, PRIEST_DIRECT_AID_COOLDOWN_MINUTES),
      healAmount: plan.heal,
      targetEffectiveHpMax: target?.hpMax ?? 1,
      manaCost: plan.manaCost,
      statSnapshot: actor ? { level: actor.level, charisma: actor.stats.charisma, intelligence: actor.stats.intelligence } : {}
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
      actor: summarizeWithKnownItems(result.actor),
      target: summarizeWithKnownItems(result.target),
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
    const actor = snapshot ? summarizeWithKnownItems(snapshot.character) : null;
    const result = await this.repository.completePriestBlessing(actorTelegramUserId, {
      ...input,
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      now,
      expiresAt: addMinutes(now, PRIEST_BLESSING_DURATION_MINUTES),
      cooldownAvailableAt: addMinutes(now, PRIEST_DIRECT_AID_COOLDOWN_MINUTES),
      manaCost: 7,
      statSnapshot: actor ? { level: actor.level, charisma: actor.stats.charisma, intelligence: actor.stats.intelligence } : {}
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
      actor: summarizeWithKnownItems(result.actor),
      target: summarizeWithKnownItems(result.target),
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
    const actor = snapshot ? summarizeWithKnownItems(snapshot.character) : null;
    const target = snapshot?.targets.find((candidate) => candidate.telegramUserId === input.targetTelegramUserId) ?? null;
    const plan = buildRoguePickpocketPlan({
      rogueDexterity: actor?.stats.dexterity ?? 0,
      rogueLuck: actor?.stats.luck ?? 0,
      rogueLevel: actor?.level ?? 1,
      targetLevel: target?.level ?? 1,
      targetGold: target?.gold ?? 0,
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
        level: actor?.level ?? 1,
        dexterity: actor?.stats.dexterity ?? 0,
        luck: actor?.stats.luck ?? 0,
        targetLevel: target?.level ?? 1,
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
      actor: summarizeWithKnownItems(result.actor),
      target: summarizeWithKnownItems(result.target),
      created: result.created,
      unlocks
    };
  }
}

function presentBlocked<T extends { state: "blocked"; reason: NoncombatGateReason; actor?: unknown; target?: unknown; availableAt?: Date; blessing?: PriestBlessingRecord }>(
  result: T
): T & { actor?: CharacterSummary; target?: CharacterSummary } {
  const mapped = { ...result } as T & { actor?: CharacterSummary; target?: CharacterSummary };
  if (result.actor) {
    mapped.actor = summarizeWithKnownItems(result.actor as Parameters<typeof summarizeWithKnownItems>[0]);
  }
  if (result.target) {
    mapped.target = summarizeWithKnownItems(result.target as Parameters<typeof summarizeWithKnownItems>[0]);
  }
  return mapped;
}

function summarizeWithKnownItems(character: Parameters<typeof summarizeCharacter>[0]): CharacterSummary {
  return summarizeCharacter(character, {
    equippedItems: items.filter(() => false)
  });
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}
