import type {
  ClassNoncombatRepository,
  NoncombatGateReason,
  NoncombatTargetRecord,
  PriestAidRecord,
  PriestBlessingRecord,
  RoguePickpocketAttemptRecord,
  RogueRetaliationClaimResult,
  VarenykPlanningSnapshot
} from "../db/repositories/classNoncombatRepository";
import type { CharacterRecord } from "../db/repositories/characterRepository";
import type { GuildRepository } from "../db/repositories/guildRepository";
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
import {
  VARENYK_SATED_DURATION_MINUTES,
  VARENYK_SATED_RECIPIENT_WAIT_MINUTES,
  type VarenykSatedPlan,
  type VarenykSatedPayloadV1
} from "../domain/noncombat/varenykSatedSupport";
import { applyPassiveResourceRegeneration } from "../domain/resources/resourceRegeneration";
import { applyPriestBlessingBonusToSummary } from "../domain/noncombat/priestBlessingBonus";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import { systemClock, type Clock } from "../shared/time";
import { getEquippedItemContents } from "./equipmentService";
import { PRESENCE_ACTIVE_MS } from "./presenceService";
import { toKorchmaLocalDate } from "./tavernRaidService";
import type { AchievementService, AchievementUnlock } from "./achievementService";
import { resolveActiveCosmeticTitleLabel } from "../content/cosmeticTitles";

export type ClassNoncombatMode = "priest" | "rogue" | "varenyk";

export interface ClassNoncombatTarget extends NoncombatTargetRecord {
  canPriestAid: boolean;
  canRoguePickpocket: boolean;
  canVarenykFeed: boolean;
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
      varenykSatedSelfAvailableAt: Date | null;
      varenykSatedSelf: VarenykSatedPayloadV1 | null;
      varenykPlan: VarenykSatedPlan | null;
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

export type RogueRetaliationResult = RogueRetaliationClaimResult;

export type VarenykSatedPreviewResult =
  | {
      state: "preview";
      actor: CharacterSummary;
      target: CharacterSummary | ClassNoncombatTarget;
      actorPlanning: VarenykPlanningSnapshot;
      targetPlanning: VarenykPlanningSnapshot;
      targetTelegramUserId: bigint | null;
      actorRemortCount: number;
      targetRemortCount: number;
      statRank: number;
      plan: VarenykSatedPlan;
      previewToken: string;
      page: number;
      durationMinutes: number;
      recipientWaitMinutes: number;
    }
  | { state: "blocked"; reason: NoncombatGateReason; availableAt?: Date };

export type VarenykSatedResult =
  | {
      state: "completed";
      action: import("../db/repositories/classNoncombatRepository").VarenykSatedActionRecord;
      status: VarenykSatedPayloadV1;
      actor: CharacterSummary;
      target: CharacterSummary;
      created: boolean;
      unlocks: AchievementUnlock[];
    }
  | { state: "blocked"; reason: NoncombatGateReason; actor?: CharacterSummary; target?: CharacterSummary; availableAt?: Date };

const ROGUE_RETALIATION_WINDOW_MINUTES = 13;
const ROGUE_RETALIATION_TOKEN_LENGTH = 16;

export class ClassNoncombatService {
  constructor(
    private readonly repository: ClassNoncombatRepository,
    private readonly clock: Clock = systemClock,
    private readonly rng: RandomSource = new CryptoRandomSource(),
    private readonly achievements?: AchievementService,
    private readonly equipment?: Pick<EquipmentRepository, "listByTelegramUserId">,
    private readonly guildIdentity?: Required<Pick<GuildRepository, "getLiveCrestsForCharacterIds">>
  ) {}

  async openForTelegramUser(
    telegramUserId: bigint,
    mode: ClassNoncombatMode,
    page = 0
  ): Promise<ClassNoncombatOpenResult> {
    const now = this.clock();
    return this.openForTelegramUserAt(telegramUserId, mode, page, now);
  }

  private async openForTelegramUserAt(
    telegramUserId: bigint,
    mode: ClassNoncombatMode,
    page: number,
    now: Date
  ): Promise<ClassNoncombatOpenResult> {
    if (mode === "varenyk") {
      await this.repository.settleVarenykSatedForTelegramUser(telegramUserId, now);
    }
    const snapshot = await this.repository.getSnapshotForTelegramUser(telegramUserId, {
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      page,
      pageSize: 5,
      now,
      mode,
      ...(mode === "rogue" ? { rogueAttemptedLocalDate: toKorchmaLocalDate(now) } : {})
    });
    if (!snapshot) {
      return { state: "no-character" };
    }
    await this.attachGuildCrests(
      [snapshot.character, ...snapshot.targets.map((target) => target.character)],
      now
    );

    const character = mode === "rogue"
      ? summarizeCharacterForOpenList(snapshot.character)
      : mode === "varenyk" && snapshot.varenykPlanning
        ? summarizeCanonicalVarenykPlanning(snapshot.varenykPlanning.summary, snapshot.character)
        : (await this.summarizeForPlanning(telegramUserId, snapshot.character, now)).summary;
    const eligible =
      character.level >= CLASS_NONCOMBAT_MIN_LEVEL &&
      ((mode === "priest" && character.classId === "class.priest") ||
        (mode === "rogue" && character.classId === "class.rogue") ||
        (mode === "varenyk" && character.classId === "class.varenyk-mancer"));
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
      targets: mode === "rogue"
        ? snapshot.targets.map((target) => ({
            ...target,
            canPriestAid: false,
            canVarenykFeed: false,
            canRoguePickpocket:
              target.level >= CLASS_NONCOMBAT_MIN_LEVEL &&
              !target.rogueAttemptedToday &&
              !snapshot.roguePickpocketCooldownAvailableAt
          }))
        : await Promise.all(snapshot.targets.map(async (target) => ({
            ...target,
            ...summarizeTargetFields(
              mode === "varenyk" && target.varenykPlanning
                ? summarizeCanonicalVarenykPlanning(target.varenykPlanning.summary, target.character)
                : (await this.summarizeForPlanning(target.telegramUserId, target.character, now)).summary
            ),
            canPriestAid: mode === "priest",
            canRoguePickpocket: false,
            canVarenykFeed:
              mode === "varenyk" &&
              !target.varenykSatedAvailableAt
          }))),
      priestBlessCooldownAvailableAt: snapshot.priestBlessCooldownAvailableAt,
      priestSelfBlessAvailableAt: snapshot.priestSelfBlessAvailableAt,
      roguePickpocketCooldownAvailableAt: snapshot.roguePickpocketCooldownAvailableAt,
      varenykSatedSelfAvailableAt: snapshot.varenykSatedSelfAvailableAt,
      varenykSatedSelf: snapshot.varenykSatedSelf,
      varenykPlan: mode === "varenyk" ? snapshot.varenykPlan : null
    };
  }

  async previewVarenykSatedForTelegramUser(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint | null;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
      page: number;
    }
  ): Promise<VarenykSatedPreviewResult> {
    const now = this.clock();
    const open = await this.openForTelegramUserAt(actorTelegramUserId, "varenyk", input.page, now);
    if (open.state !== "ready") {
      return { state: "blocked", reason: open.state === "no-character" ? "no-character" : "not-varenyk-mancer" };
    }
    if ((open.character.remortCount ?? 0) !== input.expectedActorRemortCount) {
      return { state: "blocked", reason: "actor-remort-mismatch" };
    }
    if (open.actorBlocked || open.character.hpCurrent <= 0) {
      return { state: "blocked", reason: open.character.hpCurrent <= 0 ? "actor-defeated" : "actor-blocked" };
    }
    const target = input.targetTelegramUserId === null
      ? open.character
      : open.targets.find((candidate) => candidate.telegramUserId === input.targetTelegramUserId);
    if (!target) {
      return { state: "blocked", reason: "target-not-found" };
    }
    if ((target.remortCount ?? 0) !== input.expectedTargetRemortCount) {
      return { state: "blocked", reason: "target-remort-mismatch" };
    }
    if (target.hpCurrent <= 0) {
      return { state: "blocked", reason: "target-defeated" };
    }
    const availableAt = input.targetTelegramUserId === null
      ? open.varenykSatedSelfAvailableAt
      : (target as ClassNoncombatTarget).varenykSatedAvailableAt;
    if (availableAt) {
      return { state: "blocked", reason: "target-cooldown", availableAt };
    }
    const previewToken = createPreviewToken(this.rng);
    const saved = await this.repository.saveVarenykSatedPreview(actorTelegramUserId, {
      targetTelegramUserId: input.targetTelegramUserId,
      expectedActorRemortCount: input.expectedActorRemortCount,
      expectedTargetRemortCount: input.expectedTargetRemortCount,
      previewToken,
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      now,
      expiresAt: addMinutes(now, VARENYK_SATED_DURATION_MINUTES)
    });
    if (saved.state === "blocked") {
      return { state: "blocked", reason: saved.reason, ...(saved.availableAt ? { availableAt: saved.availableAt } : {}) };
    }
    return {
      state: "preview",
      actor: summarizePersistedVarenykPreview(saved.actor),
      target: summarizePersistedVarenykPreview(saved.target),
      actorPlanning: saved.actor,
      targetPlanning: saved.target,
      targetTelegramUserId: input.targetTelegramUserId,
      actorRemortCount: saved.actorRemortCount,
      targetRemortCount: saved.targetRemortCount,
      statRank: saved.statRank,
      plan: saved.plan,
      previewToken,
      page: input.page,
      durationMinutes: VARENYK_SATED_DURATION_MINUTES,
      recipientWaitMinutes: VARENYK_SATED_RECIPIENT_WAIT_MINUTES
    };
  }

  async feedVarenykSatedForTelegramUser(
    actorTelegramUserId: bigint,
    input: {
      targetTelegramUserId: bigint | null;
      expectedActorRemortCount: number;
      expectedTargetRemortCount: number;
      previewToken: string;
    }
  ): Promise<VarenykSatedResult> {
    const now = this.clock();
    const result = await this.repository.completeVarenykSated(actorTelegramUserId, {
      ...input,
      activeSince: new Date(now.getTime() - PRESENCE_ACTIVE_MS),
      now
    });
    if (result.state === "blocked") {
      return presentBlocked(result);
    }
    const unlocks = result.created && this.achievements
      ? await this.achievements.trackEventSafely({
          type: result.action.actorCharacterId === result.action.targetCharacterId
            ? "varenyk.sated.self"
            : "varenyk.sated.other",
          characterId: result.action.actorCharacterId,
          occurredAt: result.action.startedAt,
          sourceId: result.action.activationId
        })
      : [];
    return {
      state: "completed",
      action: result.action,
      status: result.status,
      actor: (await this.summarizeForPlanning(result.action.actorTelegramUserId, result.actor, now)).summary,
      target: (await this.summarizeForPlanning(result.action.targetTelegramUserId, result.target, now)).summary,
      created: result.created,
      unlocks
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
      now,
      mode: "priest"
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
      now,
      mode: "priest"
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
      now,
      mode: "rogue"
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
      retaliationToken: plan.outcome === "noticed-success" && plan.stolenGold > 0
        ? createRetaliationToken(this.rng)
        : null,
      retaliationAvailableUntil: plan.outcome === "noticed-success" && plan.stolenGold > 0
        ? addMinutes(now, ROGUE_RETALIATION_WINDOW_MINUTES)
        : null,
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

  claimRogueRetaliationForTelegramUser(
    targetTelegramUserId: bigint,
    retaliationToken: string
  ): Promise<RogueRetaliationResult> {
    return this.repository.claimRogueRetaliation(targetTelegramUserId, {
      retaliationToken,
      now: this.clock()
    });
  }

  recordRogueRetaliationDuel(
    retaliationToken: string,
    duelInviteToken: string
  ): Promise<void> {
    return this.repository.recordRogueRetaliationDuel(retaliationToken, {
      duelInviteToken,
      now: this.clock()
    });
  }

  private async summarizeForPlanning(
    telegramUserId: bigint,
    character: CharacterRecord,
    now: Date
  ): Promise<EffectiveClassNoncombatCharacter> {
    await this.attachGuildCrests([character], now);
    const [equipmentSnapshot, activeBlessing] = await Promise.all([
      this.equipment?.listByTelegramUserId(telegramUserId) ?? Promise.resolve(null),
      this.repository.getActivePriestBlessingForTelegramUser(telegramUserId, now)
    ]);
    const equippedItems = equipmentSnapshot ? getEquippedItemContents(equipmentSnapshot.equipment) : [];
    const baseSummary = summarizeCharacter(character, { equippedItems });
    const activeCosmeticTitle = resolveActiveCosmeticTitleLabel(character.activeCosmeticTitleGrantId);
    const titledSummary = activeCosmeticTitle
      ? { ...baseSummary, activeCosmeticTitle }
      : baseSummary;
    const regeneration = applyPassiveResourceRegeneration({
      resources: {
        hpCurrent: titledSummary.hpCurrent,
        hpMax: titledSummary.hpMax,
        manaCurrent: titledSummary.manaCurrent,
        manaMax: titledSummary.manaMax,
        ...(character.hpRegenAt === undefined ? {} : { hpRegenAt: character.hpRegenAt }),
        ...(character.manaRegenAt === undefined ? {} : { manaRegenAt: character.manaRegenAt })
      },
      profile: {
        raceId: titledSummary.raceId,
        classId: titledSummary.classId,
        title: titledSummary.title,
        stats: titledSummary.stats
      },
      now
    });
    const regeneratedSummary = {
      ...titledSummary,
      hpCurrent: regeneration.resources.hpCurrent,
      manaCurrent: regeneration.resources.manaCurrent
    };

    return {
      summary: applyPriestBlessingBonusToSummary(regeneratedSummary, activeBlessing, now),
      equippedItemIds: equippedItems.map((item) => item.id),
      activePriestBlessing: activeBlessing
    };
  }

  private async attachGuildCrests(characters: CharacterRecord[], now: Date): Promise<void> {
    if (!this.guildIdentity || characters.length === 0) return;
    const crests = await this.guildIdentity.getLiveCrestsForCharacterIds(
      characters.map((character) => character.id),
      now
    );
    for (const character of characters) {
      const crest = crests.get(character.id);
      if (crest) character.guildCrest = crest;
    }
  }
}

function summarizeCanonicalVarenykPlanning(
  summary: CharacterSummary,
  character: CharacterRecord
): CharacterSummary {
  const activeCosmeticTitle = resolveActiveCosmeticTitleLabel(character.activeCosmeticTitleGrantId);
  return activeCosmeticTitle ? { ...summary, activeCosmeticTitle } : summary;
}

function summarizePersistedVarenykPreview(
  planning: VarenykPlanningSnapshot
): CharacterSummary {
  const activeCosmeticTitle = resolveActiveCosmeticTitleLabel(planning.activeCosmeticTitleGrantId);
  return activeCosmeticTitle
    ? { ...planning.summary, activeCosmeticTitle }
    : planning.summary;
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

function summarizeCharacterForOpenList(character: CharacterRecord): CharacterSummary {
  const baseSummary = summarizeCharacter(character);
  const activeCosmeticTitle = resolveActiveCosmeticTitleLabel(character.activeCosmeticTitleGrantId);
  return activeCosmeticTitle
    ? { ...baseSummary, activeCosmeticTitle }
    : baseSummary;
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

function createRetaliationToken(rng: RandomSource): string {
  let token = "";
  for (let index = 0; index < ROGUE_RETALIATION_TOKEN_LENGTH; index += 1) {
    token += rng.nextInt(0, 35).toString(36);
  }
  return token;
}

function createPreviewToken(rng: RandomSource): string {
  let token = "";
  for (let index = 0; index < 10; index += 1) {
    token += rng.nextInt(0, 35).toString(36);
  }
  return token;
}
