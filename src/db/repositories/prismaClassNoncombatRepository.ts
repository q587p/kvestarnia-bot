import { randomUUID } from "node:crypto";
import { Prisma, type Character, type PrismaClient } from "@prisma/client";
import { items } from "../../content";
import {
  CLASS_NONCOMBAT_MIN_LEVEL,
  CLASS_NONCOMBAT_RULES_VERSION,
  PRIEST_DIRECT_BLESSING_TECHNIQUE_ID,
  PRIEST_DIRECT_HEAL_TECHNIQUE_ID,
  ROGUE_PICKPOCKET_TECHNIQUE_ID
} from "../../domain/noncombat/classNoncombatTechniques";
import {
  getLocationName,
  normalizePresenceLocationId,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_SHAWARMA,
  PRESENCE_LOCATION_TAVERN,
  PRESENCE_LOCATION_TAVERN_CELLAR
} from "../../services/presenceService";
import type { CharacterRecord } from "./characterRepository";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import { getIncludedRemortCount } from "./prismaRemortCount";
import type {
  ClassNoncombatRepository,
  NoncombatActionSnapshot,
  NoncombatGateReason,
  PriestAidRecord,
  PriestBlessRepositoryResult,
  PriestBlessingRecord,
  PriestHealRepositoryResult,
  RoguePickpocketAttemptRecord,
  RoguePickpocketRepositoryResult,
  RogueRetaliationClaimResult,
  VarenykPlanningSnapshot
} from "./classNoncombatRepository";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";
import {
  applyVarenykSatedImmediateRecovery,
  buildVarenykSatedPlan,
  getAffordableVarenykSatedPlan,
  isVarenykSatedActive,
  parseVarenykSatedPayload,
  settleVarenykSatedOutsideCombat,
  VARENYK_SATED_DURATION_MINUTES,
  VARENYK_SATED_MANA_COSTS,
  VARENYK_SATED_RECIPIENT_WAIT_MINUTES,
  VARENYK_SATED_PREVIEW_KEY,
  VARENYK_SATED_RULES_VERSION,
  VARENYK_SATED_STATUS_KEY,
  type VarenykSatedPayloadV1
} from "../../domain/noncombat/varenykSatedSupport";
import { applyPassiveResourceRegeneration } from "../../domain/resources/resourceRegeneration";
import { EQUIPMENT_ATTUNEMENT_ACTION_KEY, isEquipmentAttunementPendingForRow } from "../../domain/equipment/equipmentAttunement";
import { buildShynokRecoveryWindows, isShynokDrinkKey } from "../../domain/shynokDrinks";
import { applyPriestBlessingBonusToSummary } from "../../domain/noncombat/priestBlessingBonus";

type TxClient = Prisma.TransactionClient;

const PRIEST_CLASS_ID = "class.priest";
const ROGUE_CLASS_ID = "class.rogue";
const VARENYK_MANCER_CLASS_ID = "class.varenyk-mancer";
const ROGUE_PICKPOCKET_COOLDOWN_KEY = "noncombat.rogue.pickpocket";
const PUBLIC_SATED_SETTLEMENT_MAX_ATTEMPTS = 3;

export class PrismaClassNoncombatRepository implements ClassNoncombatRepository {
  async isRogueRetaliationDuelInviteToken(inviteToken: string): Promise<boolean> {
    const row = await this.prisma.noncombatRoguePickpocketAttempt.findFirst({
      where: { retaliationDuelInviteToken: inviteToken },
      select: { id: true }
    });

    return row !== null;
  }

  constructor(
    private readonly prisma: PrismaClient,
    private readonly hpRecoveryProducer = new HpRecoveryNotificationProducer(false)
  ) {}

  async getSnapshotForTelegramUser(
    telegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["getSnapshotForTelegramUser"]>[1]
  ): Promise<NoncombatActionSnapshot | null> {
    const actor = input.mode === "varenyk"
      ? await findSatedCharacter(this.prisma, telegramUserId)
      : await findCharacter(this.prisma, telegramUserId);
    if (!actor) {
      return null;
    }

    const actorRecord = toCharacterRecord(actor);
    const locationId = normalizePresenceLocationId(actor.user.lastSeenLocationId);
    const [rawTargets, attemptedRogueTargetIds, pickpocketCooldown] = await Promise.all([
      listActiveTargets(this.prisma, actor.id, locationId, input.activeSince),
      input.mode === "rogue" && input.rogueAttemptedLocalDate
        ? listRogueAttemptedTargetIds(this.prisma, actor.id, input.rogueAttemptedLocalDate)
        : Promise.resolve([]),
      input.mode === "rogue"
        ? findCooldown(this.prisma, actor.id, ROGUE_PICKPOCKET_COOLDOWN_KEY)
        : Promise.resolve(null)
    ]);
    const attemptedRogueTargetIdSet = new Set(attemptedRogueTargetIds);
    const targetIds = [actor.id, ...rawTargets.map((target) => target.characterId)];
    const [blessAvailableAtByTargetId, satedByTargetId] = await Promise.all([
      input.mode === "priest"
        ? listPriestBlessAvailableAtByTargetId(this.prisma, actor.id, targetIds, input.now)
        : Promise.resolve(new Map<string, Date>()),
      input.mode === "varenyk"
        ? listVarenykSatedByTargetId(this.prisma, targetIds, input.now)
        : Promise.resolve(new Map<string, { availableAt: Date | null; payload: VarenykSatedPayloadV1 | null }>())
    ]);
    const targets = rawTargets.map((target) => ({
      ...target,
      priestBlessAvailableAt: blessAvailableAtByTargetId.get(target.characterId) ?? null,
      rogueAttemptedToday: attemptedRogueTargetIdSet.has(target.characterId),
      varenykSatedAvailableAt: satedByTargetId.get(target.characterId)?.availableAt ?? null,
      varenykSated: satedByTargetId.get(target.characterId)?.payload ?? null
    }));
    const safePageSize = Math.max(1, Math.min(50, Math.trunc(input.pageSize)));
    const totalPages = Math.max(1, Math.ceil(targets.length / safePageSize));
    const safePage = clampPage(input.page, totalPages);
    const start = safePage * safePageSize;
    const pagedTargets = targets.slice(start, start + safePageSize);
    const varenykPlanning = input.mode === "varenyk"
      ? await getSatedCanonicalResources(this.prisma, actor as SatedCharacter, input.now, true)
      : null;
    const varenykTargetPlanning = input.mode === "varenyk"
      ? new Map(await Promise.all(pagedTargets.map(async (target) => {
          const character = await findSatedCharacterById(this.prisma, target.characterId);
          if (!character) {
            return [target.characterId, null] as const;
          }
          return [
            target.characterId,
            toVarenykPlanningSnapshot(await getSatedCanonicalResources(this.prisma, character, input.now, true))
          ] as const;
        })))
      : null;
    const varenykStatPlan = varenykPlanning
      ? buildVarenykSatedPlan({
          effectiveIntelligence: varenykPlanning.summary.stats.intelligence,
          effectiveCharisma: varenykPlanning.summary.stats.charisma,
          level: varenykPlanning.summary.level
        })
      : null;

    return {
      character: varenykPlanning
        ? {
            ...actorRecord,
            hpCurrent: varenykPlanning.regeneration.resources.hpCurrent,
            manaCurrent: varenykPlanning.regeneration.resources.manaCurrent
          }
        : actorRecord,
      actorBlocked: input.mode === "varenyk" ? isVarenykBlocked(actor) : isBlocked(actor),
      targets: pagedTargets.map((target) => ({
        ...target,
        ...(varenykTargetPlanning?.get(target.characterId)
          ? { varenykPlanning: varenykTargetPlanning.get(target.characterId)! }
          : {})
      })),
      targetPage: safePage,
      targetTotalPages: totalPages,
      locationId,
      locationName: getLocationName(locationId),
      priestBlessCooldownAvailableAt: null,
      priestSelfBlessAvailableAt: blessAvailableAtByTargetId.get(actor.id) ?? null,
      roguePickpocketCooldownAvailableAt: pickpocketCooldown?.availableAt && pickpocketCooldown.availableAt > input.now
        ? pickpocketCooldown.availableAt
        : null,
      varenykSatedSelfAvailableAt: satedByTargetId.get(actor.id)?.availableAt ?? null,
      varenykSatedSelf: satedByTargetId.get(actor.id)?.payload ?? null,
      varenykStatRank: varenykStatPlan?.rank ?? null,
      varenykPlan: varenykStatPlan && varenykPlanning
        ? getAffordableVarenykSatedPlan(
            varenykStatPlan.rank,
            varenykPlanning.regeneration.resources.manaCurrent
          )
        : null,
      ...(varenykPlanning ? { varenykPlanning: toVarenykPlanningSnapshot(varenykPlanning) } : {})
    };
  }

  async getActivePriestBlessingForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<PriestBlessingRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }

      await expireBlessings(tx, character.id, now);

      return mapBlessing(await tx.noncombatPriestBlessing.findFirst({
        where: { targetCharacterId: character.id, status: "active", expiresAt: { gt: now } },
        orderBy: { startedAt: "desc" }
      }));
    });
  }

  async getPriestSelfBlessAvailableAtForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<Date | null> {
    const actor = await findCharacter(this.prisma, telegramUserId);
    if (!actor) {
      return null;
    }

    const availableAtByTargetId = await listPriestBlessAvailableAtByTargetId(
      this.prisma,
      actor.id,
      [actor.id],
      now
    );

    return availableAtByTargetId.get(actor.id) ?? null;
  }

  async settleVarenykSatedForTelegramUser(
    telegramUserId: bigint,
    now: Date,
    knownCharacterId?: string,
    expectedCharacter?: Parameters<ClassNoncombatRepository["settleVarenykSatedForTelegramUser"]>[3]
  ) {
    for (let attempt = 1; attempt <= PUBLIC_SATED_SETTLEMENT_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.settleVarenykSatedForTelegramUserOnce(
          telegramUserId,
          now,
          knownCharacterId,
          expectedCharacter,
          attempt > 1
        );
      } catch (error) {
        const expectedRace = error instanceof ResourceRaceError || error instanceof SatedClaimRaceError;
        if (!expectedRace) {
          throw error;
        }
      }
    }
    return this.reloadVarenykSatedPublicRead(telegramUserId, knownCharacterId);
  }

  private async settleVarenykSatedForTelegramUserOnce(
    telegramUserId: bigint,
    now: Date,
    knownCharacterId?: string,
    expectedCharacter?: Parameters<ClassNoncombatRepository["settleVarenykSatedForTelegramUser"]>[3],
    bypassHistoricalFastPath = false
  ) {
    if (knownCharacterId && !bypassHistoricalFastPath) {
      const activeRow = await findCooldown(this.prisma, knownCharacterId, VARENYK_SATED_STATUS_KEY);
      if (!activeRow) {
        return null;
      }
      const activePayload = parseVarenykSatedPayload(activeRow.resultJson);
      if (isSettledHistoricalSatedRow(activeRow, activePayload, knownCharacterId, now)) {
        if (expectedCharacter) {
          const current = await findCharacterById(this.prisma, knownCharacterId);
          if (current && !matchesExpectedPublicCharacter(current, expectedCharacter)) {
            return toPublicSatedReadRecord(current, activePayload);
          }
        }
        return null;
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const character = knownCharacterId
        ? await findSatedCharacterById(tx, knownCharacterId)
        : await findSatedCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }
      const statusRow = await findCooldown(tx, character.id, VARENYK_SATED_STATUS_KEY);
      const payload = parseVarenykSatedPayload(statusRow?.resultJson);
      const remortCount = getIncludedRemortCount(character);
      if (!payload || payload.recipientRemortCount !== remortCount || payload.recipientCharacterId !== character.id) {
        return toPublicSatedReadRecord(character, payload);
      }

      const canonical = await getSatedCanonicalResources(tx, character, now);
      const passiveRecoveryNotice =
        character.hpCurrent < canonical.regeneration.resources.hpMax &&
        canonical.regeneration.resources.hpCurrent >= canonical.regeneration.resources.hpMax
          ? {
              type: "hp-full" as const,
              hpCurrent: canonical.regeneration.resources.hpCurrent,
              hpMax: canonical.regeneration.resources.hpMax
            }
          : null;
      const settlement = settleVarenykSatedOutsideCombat({
        payload,
        resources: {
          hp: canonical.regeneration.resources.hpCurrent,
          hpMax: canonical.regeneration.resources.hpMax,
          mana: canonical.regeneration.resources.manaCurrent,
          manaMax: canonical.regeneration.resources.manaMax
        },
        now,
        combatBlocked: Boolean(character.activeCombatLease)
      });
      const safeSettlement = canonical.regeneration.resources.hpCurrent <= 0 && settlement.hpRestored > 0
        ? {
            ...settlement,
            resources: { ...settlement.resources, hp: 0 },
            hpRestored: 0
          }
        : settlement;
      const changed =
        safeSettlement.resources.hp !== character.hpCurrent ||
        safeSettlement.resources.mana !== character.manaCurrent ||
        canonical.regeneration.resources.hpRegenAt?.getTime() !== character.hpRegenAt?.getTime() ||
        canonical.regeneration.resources.manaRegenAt?.getTime() !== character.manaRegenAt?.getTime();
      if (changed) {
        const updated = await tx.character.updateMany({
          where: {
            id: character.id,
            hpCurrent: character.hpCurrent,
            manaCurrent: character.manaCurrent,
            hpRegenAt: character.hpRegenAt,
            manaRegenAt: character.manaRegenAt
          },
          data: {
            hpCurrent: safeSettlement.resources.hp,
            manaCurrent: safeSettlement.resources.mana,
            hpRegenAt: safeSettlement.resources.hp >= safeSettlement.resources.hpMax
              ? now
              : canonical.regeneration.resources.hpRegenAt,
            manaRegenAt: safeSettlement.resources.mana >= safeSettlement.resources.manaMax
              ? now
              : canonical.regeneration.resources.manaRegenAt
          }
        });
        if (updated.count !== 1) {
          throw new ResourceRaceError();
        }
      }
      if (safeSettlement.payload.cursorAt !== payload.cursorAt) {
        const updated = await tx.characterCooldown.updateMany({
          where: {
            id: statusRow!.id,
            availableAt: statusRow!.availableAt,
            resultJson: { equals: statusRow!.resultJson ?? Prisma.JsonNull }
          },
          data: { resultJson: toJson(safeSettlement.payload) }
        });
        if (updated.count !== 1) {
          throw new SatedClaimRaceError();
        }
      }
      if (safeSettlement.hpRestored > 0) {
        await this.hpRecoveryProducer.record(
          tx,
          character.id,
          now,
          safeSettlement.resources.hp >= safeSettlement.resources.hpMax ? "suppress" : "recovering"
        );
      }

      const refreshed = changed
        ? await findSatedCharacterById(tx, character.id)
        : character;
      if (!refreshed) {
        throw new ResourceRaceError();
      }
      return {
        payload: safeSettlement.payload,
        hpRestored: safeSettlement.hpRestored,
        manaRestored: safeSettlement.manaRestored,
        character: toCharacterRecord(refreshed),
        passiveRecoveryNotice
      };
    });
  }

  private async reloadVarenykSatedPublicRead(
    telegramUserId: bigint,
    knownCharacterId?: string
  ) {
    const character = knownCharacterId
      ? await findCharacterById(this.prisma, knownCharacterId) ?? await findCharacter(this.prisma, telegramUserId)
      : await findCharacter(this.prisma, telegramUserId);
    if (!character) {
      return null;
    }
    const statusRow = await findCooldown(this.prisma, character.id, VARENYK_SATED_STATUS_KEY);
    return toPublicSatedReadRecord(character, parseVarenykSatedPayload(statusRow?.resultJson));
  }

  async saveVarenykSatedPreview(
    actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["saveVarenykSatedPreview"]>[1]
  ) {
    return this.prisma.$transaction(async (tx) => {
      const actor = await findSatedCharacter(tx, actorTelegramUserId);
      const target = !actor
        ? null
        : input.targetTelegramUserId === null
          ? actor
          : await findSatedCharacter(tx, input.targetTelegramUserId);
      if (!actor || validateSharedTarget(actor, target, input, { allowSelf: true, blockAdventure: true })) {
        return { state: "blocked" as const, reason: "stale" as const };
      }
      if (
        actor.classId !== VARENYK_MANCER_CLASS_ID ||
        actor.level < CLASS_NONCOMBAT_MIN_LEVEL ||
        actor.hpCurrent <= 0 ||
        target!.hpCurrent <= 0
      ) {
        return { state: "blocked" as const, reason: "stale" as const };
      }
      const existing = await findCooldown(tx, target!.id, VARENYK_SATED_STATUS_KEY);
      const existingPayload = parseVarenykSatedPayload(existing?.resultJson);
      if (isVarenykSatedActive(
        existingPayload,
        target!.id,
        getIncludedRemortCount(target!),
        input.now
      )) {
        return {
          state: "blocked" as const,
          reason: "already-sated" as const,
          availableAt: new Date(existingPayload.expiresAt)
        };
      }
      const authoritativeAvailableAt = getAuthoritativeSatedAvailableAt(
        existing,
        existingPayload,
        target!.id,
        getIncludedRemortCount(target!)
      );
      if (authoritativeAvailableAt && authoritativeAvailableAt > input.now) {
        return {
          state: "blocked" as const,
          reason: "target-cooldown" as const,
          availableAt: authoritativeAvailableAt
        };
      }
      const actorContext = await settleSatedForCommit(tx, actor, input.now);
      const targetContext = actor.id === target!.id
        ? actorContext
        : await settleSatedForCommit(tx, target!, input.now);
      const canonical = actorContext.canonical;
      const statPlan = buildVarenykSatedPlan({
        effectiveIntelligence: canonical.summary.stats.intelligence,
        effectiveCharisma: canonical.summary.stats.charisma,
        level: canonical.summary.level
      });
      const plan = getAffordableVarenykSatedPlan(
        statPlan.rank,
        canonical.regeneration.resources.manaCurrent
      );
      if (!plan) {
        return { state: "blocked" as const, reason: "insufficient-mana" as const };
      }
      const actorPlanning = toVarenykPlanningSnapshot(actorContext.canonical);
      const targetPlanning = toVarenykPlanningSnapshot(targetContext.canonical);
      const payload: SatedPreviewPayload = {
        kind: "varenyk-sated-preview-v2",
        version: 2,
        previewToken: input.previewToken,
        actorCharacterId: actor.id,
        actorRemortCount: getIncludedRemortCount(actor),
        recipientCharacterId: target!.id,
        recipientRemortCount: getIncludedRemortCount(target!),
        targetTelegramUserId: input.targetTelegramUserId?.toString() ?? null,
        statRank: statPlan.rank,
        plan,
        effectiveStats: {
          intelligence: canonical.summary.stats.intelligence,
          charisma: canonical.summary.stats.charisma,
          level: canonical.summary.level,
          equipmentItemIds: canonical.equipmentItemIds,
          attunedEquipmentRows: canonical.attunedEquipmentRows
        },
        actorPlanning: toPersistedSatedPreviewPlanningSnapshot(actorPlanning),
        targetPlanning: toPersistedSatedPreviewPlanningSnapshot(targetPlanning),
        recoveryWindows: canonical.recoveryWindows,
        expiresAt: input.expiresAt.toISOString()
      };
      await tx.characterCooldown.upsert({
        where: { characterId_key: { characterId: actor.id, key: VARENYK_SATED_PREVIEW_KEY } },
        create: {
          characterId: actor.id,
          key: VARENYK_SATED_PREVIEW_KEY,
          availableAt: input.expiresAt,
          resultJson: toJson(payload)
        },
        update: { availableAt: input.expiresAt, resultJson: toJson(payload) }
      });
      return {
        state: "saved" as const,
        statRank: statPlan.rank,
        plan,
        actor: actorPlanning,
        target: targetPlanning,
        actorRemortCount: getIncludedRemortCount(actorContext.character),
        targetRemortCount: getIncludedRemortCount(targetContext.character)
      };
    });
  }

  async isActorBlockedForTelegramUser(telegramUserId: bigint): Promise<boolean> {
    const actor = await findCharacter(this.prisma, telegramUserId);
    return actor
      ? actor.classId === VARENYK_MANCER_CLASS_ID
        ? isVarenykBlocked(actor)
        : isBlocked(actor)
      : false;
  }

  async completePriestHeal(
    actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["completePriestHeal"]>[1]
  ): Promise<PriestHealRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const gate = await loadAndValidatePriestTarget(tx, actorTelegramUserId, {
          targetTelegramUserId: input.targetTelegramUserId,
          expectedActorRemortCount: input.expectedActorRemortCount,
          expectedTargetRemortCount: input.expectedTargetRemortCount,
          activeSince: input.activeSince,
          now: input.now
        });
        if (gate.state === "blocked") {
          return gate;
        }

        const { actor, target, actorRecord, targetRecord, locationId } = gate;
        const targetEffectiveHpMax = Math.max(target.hpMax, safePositiveInteger(input.targetEffectiveHpMax, target.hpMax));
        if (target.hpCurrent >= targetEffectiveHpMax) {
          return { state: "blocked", reason: "full-hp", actor: actorRecord, target: targetRecord };
        }
        if (actor.manaCurrent < input.manaCost) {
          return { state: "blocked", reason: "insufficient-mana", actor: actorRecord, target: targetRecord };
        }

        const hpAfter = Math.min(targetEffectiveHpMax, target.hpCurrent + input.healAmount);
        const spent = input.manaCost;
        const mutated = actor.id === target.id
          ? await tx.character.updateMany({
              where: {
                id: actor.id,
                hpCurrent: actor.hpCurrent,
                manaCurrent: actor.manaCurrent
              },
              data: {
                hpCurrent: hpAfter,
                manaCurrent: actor.manaCurrent - spent,
                hpRegenAt: hpAfter >= targetEffectiveHpMax ? input.now : target.hpRegenAt,
                manaRegenAt: input.now
              }
            })
          : await mutatePriestHealPair(tx, actor, target, hpAfter, targetEffectiveHpMax, spent, input.now);
        if (mutated.count !== 1) {
          throw new ResourceRaceError();
        }
        await this.hpRecoveryProducer.record(
          tx,
          target.id,
          input.now,
          hpAfter >= targetEffectiveHpMax ? "suppress" : "recovering"
        );

        const action = await tx.noncombatPriestAidAction.create({
          data: {
            actorCharacterId: actor.id,
            targetCharacterId: target.id,
            actorTelegramUserId,
            targetTelegramUserId: target.user.telegramUserId,
            actorName: actor.name,
            targetName: target.name,
            actorRemortCount: actorRecord.remortCount ?? 0,
            targetRemortCount: targetRecord.remortCount ?? 0,
            actionKind: "heal",
            techniqueId: PRIEST_DIRECT_HEAL_TECHNIQUE_ID,
            rulesVersion: CLASS_NONCOMBAT_RULES_VERSION,
            locationId,
            status: "completed",
            healAmount: hpAfter - target.hpCurrent,
            manaCost: spent,
            resultJson: toJson({
              statSnapshot: input.statSnapshot,
              targetEffectiveHpMax,
              hpBefore: target.hpCurrent,
              hpAfter,
              manaBefore: actor.manaCurrent,
              manaAfter: actor.manaCurrent - spent
            }),
            cooldownAvailableAt: input.now,
            completedAt: input.now
          }
        });

        return {
          state: "completed",
          action: mapPriestAid(action),
          actor: toCharacterRecord(await findCharacterByIdOrThrow(tx, actor.id)),
          target: toCharacterRecord(await findCharacterByIdOrThrow(tx, target.id)),
          created: true
        };
      });
    } catch (error) {
      if (error instanceof ResourceRaceError || isUniqueConstraintError(error)) {
        return { state: "blocked", reason: "stale" };
      }
      throw error;
    }
  }

  async completePriestBlessing(
    actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["completePriestBlessing"]>[1]
  ): Promise<PriestBlessRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const gate = await loadAndValidatePriestTarget(tx, actorTelegramUserId, {
          targetTelegramUserId: input.targetTelegramUserId,
          expectedActorRemortCount: input.expectedActorRemortCount,
          expectedTargetRemortCount: input.expectedTargetRemortCount,
          activeSince: input.activeSince,
          now: input.now
        });
        if (gate.state === "blocked") {
          return gate;
        }

        const { actor, target, actorRecord, targetRecord, locationId } = gate;
        if (actor.manaCurrent < input.manaCost) {
          return { state: "blocked", reason: "insufficient-mana", actor: actorRecord, target: targetRecord };
        }

        await expireBlessings(tx, target.id, input.now);
        const existingBlessing = mapBlessing(await tx.noncombatPriestBlessing.findFirst({
          where: { targetCharacterId: target.id, status: "active", expiresAt: { gt: input.now } },
          orderBy: { startedAt: "desc" }
        }));
        if (existingBlessing) {
          return {
            state: "blocked",
            reason: "already-blessed",
            actor: actorRecord,
            target: targetRecord,
            blessing: existingBlessing
          };
        }

        const pairCooldownAvailableAt = await findPriestBlessPairCooldownAvailableAt(
          tx,
          actor.id,
          target.id,
          input.now
        );
        if (pairCooldownAvailableAt) {
          return {
            state: "blocked",
            reason: "target-cooldown",
            actor: actorRecord,
            target: targetRecord,
            availableAt: pairCooldownAvailableAt
          };
        }

        const actorUpdate = await tx.character.updateMany({
          where: { id: actor.id, manaCurrent: actor.manaCurrent },
          data: {
            manaCurrent: actor.manaCurrent - input.manaCost,
            manaRegenAt: input.now
          }
        });
        if (actorUpdate.count !== 1) {
          throw new ResourceRaceError();
        }

        const blessing = await tx.noncombatPriestBlessing.create({
          data: {
            actorCharacterId: actor.id,
            targetCharacterId: target.id,
            actorTelegramUserId,
            targetTelegramUserId: target.user.telegramUserId,
            actorName: actor.name,
            targetName: target.name,
            actorRemortCount: actorRecord.remortCount ?? 0,
            targetRemortCount: targetRecord.remortCount ?? 0,
            techniqueId: PRIEST_DIRECT_BLESSING_TECHNIQUE_ID,
            rulesVersion: CLASS_NONCOMBAT_RULES_VERSION,
            locationId,
            status: "active",
            activeGuard: target.id,
            bonusStat: "luck",
            bonusAmount: input.bonusAmount,
            resultJson: toJson({
              statSnapshot: input.statSnapshot,
              manaBefore: actor.manaCurrent,
              manaAfter: actor.manaCurrent - input.manaCost,
              activeStatBonus: { stat: "luck", amount: input.bonusAmount }
            }),
            startedAt: input.now,
            expiresAt: input.expiresAt
          }
        });
        const action = await tx.noncombatPriestAidAction.create({
          data: {
            actorCharacterId: actor.id,
            targetCharacterId: target.id,
            actorTelegramUserId,
            targetTelegramUserId: target.user.telegramUserId,
            actorName: actor.name,
            targetName: target.name,
            actorRemortCount: actorRecord.remortCount ?? 0,
            targetRemortCount: targetRecord.remortCount ?? 0,
            actionKind: "blessing",
            techniqueId: PRIEST_DIRECT_BLESSING_TECHNIQUE_ID,
            rulesVersion: CLASS_NONCOMBAT_RULES_VERSION,
            locationId,
            status: "completed",
            healAmount: 0,
            manaCost: input.manaCost,
            blessingId: blessing.id,
            resultJson: toJson({
              blessingId: blessing.id,
              statSnapshot: input.statSnapshot,
              activeStatBonus: { stat: "luck", amount: input.bonusAmount }
            }),
            cooldownAvailableAt: input.cooldownAvailableAt,
            completedAt: input.now
          }
        });

        return {
          state: "completed",
          action: mapPriestAid(action),
          blessing: mapBlessing(blessing)!,
          actor: toCharacterRecord(await findCharacterByIdOrThrow(tx, actor.id)),
          target: toCharacterRecord(await findCharacterByIdOrThrow(tx, target.id)),
          created: true
        };
      });
    } catch (error) {
      if (error instanceof ResourceRaceError || isUniqueConstraintError(error)) {
        return { state: "blocked", reason: "stale" };
      }
      throw error;
    }
  }

  async completeVarenykSated(
    actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["completeVarenykSated"]>[1]
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await findSatedCharacter(tx, actorTelegramUserId);
        if (!actor) {
          return { state: "blocked" as const, reason: "no-character" as const };
        }
        const target = input.targetTelegramUserId === null
          ? actor
          : await findSatedCharacter(tx, input.targetTelegramUserId);
        if (target) {
          const existing = await findCooldown(tx, target.id, VARENYK_SATED_STATUS_KEY);
          const existingPayload = parseVarenykSatedPayload(existing?.resultJson);
          if (existingPayload && matchesSatedReplay(existingPayload, input.previewToken, actor, target)) {
            return mapSatedReplay(
              existingPayload,
              toCharacterRecord(actor),
              toCharacterRecord(target)
            );
          }
        }
        const gate = validateSharedTarget(actor, target, input, { allowSelf: true, blockAdventure: true });
        if (gate) {
          return gate;
        }
        const actorRecord = toCharacterRecord(actor);
        const targetRecord = toCharacterRecord(target!);
        if (actor.classId !== VARENYK_MANCER_CLASS_ID) {
          return { state: "blocked" as const, reason: "not-varenyk-mancer" as const, actor: actorRecord, target: targetRecord };
        }
        if (Math.max(actor.level, actorRecord.level) < CLASS_NONCOMBAT_MIN_LEVEL) {
          return { state: "blocked" as const, reason: "level-locked" as const, actor: actorRecord, target: targetRecord };
        }
        if (actor.hpCurrent <= 0) {
          return { state: "blocked" as const, reason: "actor-defeated" as const, actor: actorRecord, target: targetRecord };
        }
        if (target!.hpCurrent <= 0) {
          return { state: "blocked" as const, reason: "target-defeated" as const, actor: actorRecord, target: targetRecord };
        }

        const previewRow = await findCooldown(tx, actor.id, VARENYK_SATED_PREVIEW_KEY);
        const preview = parseSatedPreviewPayload(previewRow?.resultJson);
        if (!preview || !matchesSatedPreview(preview, input, actor, target!)) {
          return { state: "blocked" as const, reason: "stale" as const, actor: actorRecord, target: targetRecord };
        }
        const actorContext = await settleSatedForCommit(tx, actor, input.now);
        const targetContext = actor.id === target!.id
          ? actorContext
          : await settleSatedForCommit(tx, target!, input.now);
        const currentExisting = targetContext.cooldown;
        const currentPayload = targetContext.payload;
        if (isVarenykSatedActive(
          currentPayload,
          target!.id,
          targetRecord.remortCount ?? 0,
          input.now
        )) {
          return {
            state: "blocked" as const,
            reason: "already-sated" as const,
            actor: toCharacterRecord(actorContext.character),
            target: toCharacterRecord(targetContext.character),
            availableAt: new Date(currentPayload.expiresAt)
          };
        }
        const authoritativeAvailableAt = getAuthoritativeSatedAvailableAt(
          currentExisting,
          currentPayload,
          target!.id,
          targetRecord.remortCount ?? 0
        );
        if (authoritativeAvailableAt && authoritativeAvailableAt > input.now) {
          return {
            state: "blocked" as const,
            reason: "target-cooldown" as const,
            actor: toCharacterRecord(actorContext.character),
            target: toCharacterRecord(targetContext.character),
            availableAt: authoritativeAvailableAt
          };
        }
        const actorCanonical = actorContext.canonical;
        const targetCanonical = targetContext.canonical;
        if (!matchesSatedPreviewPlan(preview, actorCanonical)) {
          return { state: "blocked" as const, reason: "stale" as const, actor: actorRecord, target: targetRecord };
        }
        const exactPlan = preview.plan;
        if (actorCanonical.regeneration.resources.manaCurrent < exactPlan.manaCost) {
          return { state: "blocked" as const, reason: "insufficient-mana" as const, actor: actorRecord, target: targetRecord };
        }

        const expiresAt = addMinutes(input.now, VARENYK_SATED_DURATION_MINUTES);
        const availableAt = addMinutes(input.now, VARENYK_SATED_RECIPIENT_WAIT_MINUTES);
        const claimJson = toJson({
          kind: VARENYK_SATED_RULES_VERSION,
          version: 1,
          claim: input.previewToken,
          actorCharacterId: actor.id,
          recipientCharacterId: target!.id
        });
        if (currentExisting) {
          const claimed = await tx.characterCooldown.updateMany({
            where: {
              id: currentExisting.id,
              availableAt: currentExisting.availableAt,
              resultJson: { equals: currentExisting.resultJson ?? Prisma.JsonNull }
            },
            data: { availableAt, resultJson: claimJson }
          });
          if (claimed.count !== 1) {
            throw new SatedClaimRaceError();
          }
        } else {
          await tx.characterCooldown.create({
            data: { characterId: target!.id, key: VARENYK_SATED_STATUS_KEY, availableAt, resultJson: claimJson }
          });
        }

        const targetBase = {
          hp: targetCanonical.regeneration.resources.hpCurrent,
          hpMax: targetCanonical.regeneration.resources.hpMax,
          mana: targetCanonical.regeneration.resources.manaCurrent,
          manaMax: targetCanonical.regeneration.resources.manaMax
        };
        const actorManaAfterSpend = actorCanonical.regeneration.resources.manaCurrent - exactPlan.manaCost;
        const immediateBase = actor.id === target!.id
          ? { ...targetBase, mana: actorManaAfterSpend }
          : targetBase;
        const immediate = applyVarenykSatedImmediateRecovery(immediateBase, exactPlan);
        if (actor.id === target!.id) {
          const updated = await tx.character.updateMany({
            where: {
              id: actorContext.character.id,
              hpCurrent: actorContext.character.hpCurrent,
              manaCurrent: actorContext.character.manaCurrent,
              hpRegenAt: actorContext.character.hpRegenAt,
              manaRegenAt: actorContext.character.manaRegenAt
            },
            data: {
              hpCurrent: immediate.resources.hp,
              manaCurrent: immediate.resources.mana,
              hpRegenAt: immediate.resources.hp >= immediate.resources.hpMax
                ? input.now
                : actorCanonical.regeneration.resources.hpRegenAt,
              manaRegenAt: input.now
            }
          });
          if (updated.count !== 1) throw new ResourceRaceError();
        } else {
          const spent = await tx.character.updateMany({
            where: {
              id: actorContext.character.id,
              hpCurrent: actorContext.character.hpCurrent,
              manaCurrent: actorContext.character.manaCurrent,
              hpRegenAt: actorContext.character.hpRegenAt,
              manaRegenAt: actorContext.character.manaRegenAt
            },
            data: {
              hpCurrent: actorCanonical.regeneration.resources.hpCurrent,
              manaCurrent: actorManaAfterSpend,
              hpRegenAt: actorCanonical.regeneration.resources.hpRegenAt,
              manaRegenAt: input.now
            }
          });
          if (spent.count !== 1) throw new ResourceRaceError();
          const recovered = await tx.character.updateMany({
            where: {
              id: targetContext.character.id,
              hpCurrent: targetContext.character.hpCurrent,
              manaCurrent: targetContext.character.manaCurrent,
              hpRegenAt: targetContext.character.hpRegenAt,
              manaRegenAt: targetContext.character.manaRegenAt
            },
            data: {
              hpCurrent: immediate.resources.hp,
              manaCurrent: immediate.resources.mana,
              hpRegenAt: immediate.resources.hp >= immediate.resources.hpMax
                ? input.now
                : targetCanonical.regeneration.resources.hpRegenAt,
              manaRegenAt: immediate.resources.mana >= immediate.resources.manaMax
                ? input.now
                : targetCanonical.regeneration.resources.manaRegenAt
            }
          });
          if (recovered.count !== 1) throw new ResourceRaceError();
        }

        const activationId = randomUUID();
        const payload: VarenykSatedPayloadV1 = {
          kind: VARENYK_SATED_RULES_VERSION,
          version: 1,
          activationId,
          actorCharacterId: actor.id,
          actorRemortCount: actorRecord.remortCount ?? 0,
          recipientCharacterId: target!.id,
          recipientRemortCount: targetRecord.remortCount ?? 0,
          rank: exactPlan.rank,
          manaCost: exactPlan.manaCost,
          effectiveStats: {
            intelligence: preview.effectiveStats.intelligence,
            charisma: preview.effectiveStats.charisma,
            level: preview.effectiveStats.level,
            equipmentItemIds: [...preview.effectiveStats.equipmentItemIds]
          },
          startedAt: input.now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          availableAt: availableAt.toISOString(),
          cursorAt: input.now.toISOString(),
          receipt: {
            version: 1,
            previewToken: input.previewToken,
            actorTelegramUserId: actorTelegramUserId.toString(),
            targetTelegramUserId: target!.user.telegramUserId.toString(),
            actorName: actor.name,
            targetName: target!.name,
            immediateHpRestored: immediate.hpRestored,
            immediateManaRestored: immediate.manaRestored,
            actorManaAfter: actor.id === target!.id ? immediate.resources.mana : actorManaAfterSpend,
            targetHpAfter: immediate.resources.hp,
            targetManaAfter: immediate.resources.mana
          }
        };
        const persisted = await tx.characterCooldown.updateMany({
          where: {
            characterId: target!.id,
            key: VARENYK_SATED_STATUS_KEY,
            availableAt,
            resultJson: { equals: claimJson }
          },
          data: { resultJson: toJson(payload) }
        });
        if (persisted.count !== 1) {
          throw new SatedClaimRaceError();
        }
        const previewDeleted = await tx.characterCooldown.deleteMany({
          where: { id: previewRow!.id, resultJson: { equals: previewRow!.resultJson ?? Prisma.JsonNull } }
        });
        if (previewDeleted.count !== 1) {
          throw new SatedClaimRaceError();
        }
        await this.hpRecoveryProducer.record(
          tx,
          target!.id,
          input.now,
          immediate.resources.hp >= immediate.resources.hpMax ? "suppress" : "recovering"
        );

        const finalActor = toCharacterRecord(await findCharacterByIdOrThrow(tx, actor.id));
        const finalTarget = actor.id === target!.id
          ? finalActor
          : toCharacterRecord(await findCharacterByIdOrThrow(tx, target!.id));
        return {
          state: "completed" as const,
          action: mapSatedAction(payload, actorTelegramUserId, target!.user.telegramUserId, true),
          actor: finalActor,
          target: finalTarget,
          status: payload,
          created: true
        };
      });
    } catch (error) {
      if (error instanceof ResourceRaceError || error instanceof SatedClaimRaceError || isUniqueConstraintError(error)) {
        const replay = await resolveSatedReplayAfterRace(this.prisma, actorTelegramUserId, input);
        return replay ?? { state: "blocked" as const, reason: "stale" as const };
      }
      throw error;
    }
  }

  async completeRoguePickpocket(
    actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["completeRoguePickpocket"]>[1]
  ): Promise<RoguePickpocketRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await findCharacter(tx, actorTelegramUserId);
        if (!actor) {
          return { state: "blocked", reason: "no-character" };
        }
        const target = await findCharacter(tx, input.targetTelegramUserId);
        const existing = target
          ? await tx.noncombatRoguePickpocketAttempt.findUnique({
              where: {
                actorCharacterId_targetCharacterId_localDate: {
                  actorCharacterId: actor.id,
                  targetCharacterId: target.id,
                  localDate: input.localDate
                }
              }
            })
          : null;
        if (existing) {
          return {
            state: "completed",
            attempt: mapRogueAttempt(existing),
            actor: toCharacterRecord(actor),
            target: toCharacterRecord(target!),
            created: false
          };
        }

        const gate = validateRogueTarget(actor, target, input);
        if (gate.state === "blocked") {
          return gate;
        }

        const {
          target: validatedTarget,
          actorRecord,
          targetRecord,
          locationId
        } = gate;
        const cooldown = await claimCooldown(tx, actor.id, ROGUE_PICKPOCKET_COOLDOWN_KEY, input.now, input.cooldownAvailableAt);
        if (cooldown.state === "cooldown") {
          return {
            state: "blocked",
            reason: "cooldown",
            actor: actorRecord,
            target: targetRecord,
            availableAt: cooldown.availableAt
          };
        }

        let outcome = input.outcome;
        let stolenGold = Math.max(0, Math.min(13, validatedTarget.gold, input.stolenGold));
        let actorHpAfter: number | null = null;
        if (input.stolenGold > 0 && stolenGold <= 0) {
          outcome = "empty";
        }
        const retaliationToken = outcome === "noticed-success" && stolenGold > 0
          ? input.retaliationToken
          : null;
        const retaliationAvailableUntil = retaliationToken
          ? input.retaliationAvailableUntil
          : null;

        if (stolenGold > 0) {
          const debit = await tx.character.updateMany({
            where: { id: validatedTarget.id, gold: { gte: stolenGold } },
            data: { gold: { decrement: stolenGold } }
          });
          if (debit.count === 1) {
            await tx.character.update({
              where: { id: actor.id },
              data: { gold: { increment: stolenGold } }
            });
          } else {
            outcome = "empty";
            stolenGold = 0;
          }
        }

        if (outcome === "caught-badly") {
          await tx.character.update({
            where: { id: actor.id },
            data: { hpCurrent: 0, hpRegenAt: input.now }
          });
          actorHpAfter = 0;
          await this.hpRecoveryProducer.record(tx, actor.id, input.now, "recovering");
        }

        const attempt = await tx.noncombatRoguePickpocketAttempt.create({
          data: {
            actorCharacterId: actor.id,
            targetCharacterId: validatedTarget.id,
            actorTelegramUserId,
            targetTelegramUserId: validatedTarget.user.telegramUserId,
            actorName: actor.name,
            targetName: validatedTarget.name,
            actorRemortCount: actorRecord.remortCount ?? 0,
            targetRemortCount: targetRecord.remortCount ?? 0,
            techniqueId: ROGUE_PICKPOCKET_TECHNIQUE_ID,
            rulesVersion: CLASS_NONCOMBAT_RULES_VERSION,
            locationId,
            localDate: input.localDate,
            status: "completed",
            outcome,
            stolenGold,
            actorHpAfter,
            retaliationToken: outcome === "noticed-success" && stolenGold > 0 ? retaliationToken : null,
            retaliationAvailableUntil: outcome === "noticed-success" && stolenGold > 0 ? retaliationAvailableUntil : null,
            statSnapshotJson: toJson(input.statSnapshot),
            resultJson: toJson({
              outcome,
              stolenGold,
              actorHpAfter,
              retaliationAvailableUntil: outcome === "noticed-success" && stolenGold > 0
                ? retaliationAvailableUntil?.toISOString()
                : null,
              statSnapshot: input.statSnapshot
            }),
            cooldownAvailableAt: input.cooldownAvailableAt,
            completedAt: input.now
          }
        });
        await setCooldownResult(tx, cooldown.id, {
          attemptId: attempt.id,
          techniqueId: ROGUE_PICKPOCKET_TECHNIQUE_ID,
          cooldownAvailableAt: input.cooldownAvailableAt.toISOString()
        });

        return {
          state: "completed",
          attempt: mapRogueAttempt(attempt),
          actor: toCharacterRecord(await findCharacterByIdOrThrow(tx, actor.id)),
          target: toCharacterRecord(await findCharacterByIdOrThrow(tx, validatedTarget.id)),
          created: true
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = await this.replayRogueAttempt(actorTelegramUserId, input);
        return replay ?? { state: "blocked", reason: "stale" };
      }
      throw error;
    }
  }

  private async replayRogueAttempt(
    actorTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["completeRoguePickpocket"]>[1]
  ): Promise<RoguePickpocketRepositoryResult | null> {
    const actor = await findCharacter(this.prisma, actorTelegramUserId);
    const target = await findCharacter(this.prisma, input.targetTelegramUserId);
    if (!actor || !target) {
      return null;
    }
    const attempt = await this.prisma.noncombatRoguePickpocketAttempt.findUnique({
      where: {
        actorCharacterId_targetCharacterId_localDate: {
          actorCharacterId: actor.id,
          targetCharacterId: target.id,
          localDate: input.localDate
        }
      }
    });

    return attempt
      ? {
          state: "completed",
          attempt: mapRogueAttempt(attempt),
          actor: toCharacterRecord(actor),
          target: toCharacterRecord(target),
          created: false
        }
      : null;
  }

  async claimRogueRetaliation(
    targetTelegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["claimRogueRetaliation"]>[1]
  ): Promise<RogueRetaliationClaimResult> {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.noncombatRoguePickpocketAttempt.findUnique({
        where: { retaliationToken: input.retaliationToken },
        include: {
          actor: { include: characterInclude },
          target: { include: characterInclude }
        }
      });

      if (!attempt) {
        return { state: "blocked", reason: "not-found" };
      }

      const mappedAttempt = mapRogueAttempt(attempt);
      if (attempt.targetTelegramUserId !== targetTelegramUserId) {
        return { state: "blocked", reason: "not-target", attempt: mappedAttempt };
      }
      if (attempt.retaliationUsedAt) {
        return { state: "blocked", reason: "used", attempt: mappedAttempt };
      }
      if (!attempt.retaliationAvailableUntil || attempt.retaliationAvailableUntil <= input.now) {
        return { state: "blocked", reason: "expired", attempt: mappedAttempt };
      }
      if (attempt.outcome !== "noticed-success" || attempt.stolenGold <= 0) {
        return { state: "blocked", reason: "invalid-attempt", attempt: mappedAttempt };
      }
      if (attempt.actor.classId !== ROGUE_CLASS_ID) {
        return { state: "blocked", reason: "actor-not-rogue", attempt: mappedAttempt };
      }

      const claimed = await tx.noncombatRoguePickpocketAttempt.updateMany({
        where: {
          id: attempt.id,
          retaliationUsedAt: null,
          retaliationAvailableUntil: { gt: input.now },
          outcome: "noticed-success",
          stolenGold: { gt: 0 }
        },
        data: {
          retaliationUsedAt: input.now
        }
      });
      if (claimed.count !== 1) {
        const refreshed = await tx.noncombatRoguePickpocketAttempt.findUnique({
          where: { id: attempt.id }
        });
        return {
          state: "blocked",
          reason: refreshed?.retaliationUsedAt ? "used" : "expired",
          attempt: refreshed ? mapRogueAttempt(refreshed) : mappedAttempt
        };
      }

      return {
        state: "ready",
        attempt: {
          ...mappedAttempt,
          retaliationUsedAt: input.now
        },
        actor: toCharacterRecord(attempt.actor),
        target: toCharacterRecord(attempt.target)
      };
    });
  }

  async recordRogueRetaliationDuel(
    retaliationToken: string,
    input: Parameters<ClassNoncombatRepository["recordRogueRetaliationDuel"]>[1]
  ): Promise<void> {
    await this.prisma.noncombatRoguePickpocketAttempt.updateMany({
      where: {
        retaliationToken,
        retaliationUsedAt: { not: null }
      },
      data: {
        retaliationDuelInviteToken: input.duelInviteToken,
        updatedAt: input.now
      }
    });
  }
}

async function loadAndValidatePriestTarget(
  tx: TxClient,
  actorTelegramUserId: bigint,
  input: {
    targetTelegramUserId: bigint | null;
    expectedActorRemortCount: number;
    expectedTargetRemortCount: number;
    activeSince: Date;
    now: Date;
  }
) {
  const actor = await findCharacter(tx, actorTelegramUserId);
  if (!actor) {
    return { state: "blocked" as const, reason: "no-character" as const };
  }
  const target = input.targetTelegramUserId === null
    ? actor
    : await findCharacter(tx, input.targetTelegramUserId);
  const gate = validateSharedTarget(actor, target, input, { allowSelf: true });
  if (gate) {
    return gate;
  }
  const actorRecord = toCharacterRecord(actor);
  const targetRecord = toCharacterRecord(target!);
  if (actor.classId !== PRIEST_CLASS_ID) {
    return { state: "blocked" as const, reason: "not-priest" as const, actor: actorRecord, target: targetRecord };
  }
  if (Math.max(actor.level, actorRecord.level) < CLASS_NONCOMBAT_MIN_LEVEL) {
    return { state: "blocked" as const, reason: "level-locked" as const, actor: actorRecord, target: targetRecord };
  }

  return {
    state: "ready" as const,
    actor,
    target: target!,
    actorRecord,
    targetRecord,
    locationId: normalizePresenceLocationId(actor.user.lastSeenLocationId)
  };
}

function validateRogueTarget(
  actor: IncludedCharacter,
  target: IncludedCharacter | null,
  input: {
    targetTelegramUserId: bigint;
    expectedActorRemortCount: number;
    expectedTargetRemortCount: number;
    activeSince: Date;
  }
) {
  const gate = validateSharedTarget(actor, target, input, { allowSelf: false });
  if (gate) {
    return gate;
  }
  const actorRecord = toCharacterRecord(actor);
  const targetRecord = toCharacterRecord(target!);
  if (actor.classId !== ROGUE_CLASS_ID) {
    return { state: "blocked" as const, reason: "not-rogue" as const, actor: actorRecord, target: targetRecord };
  }
  if (Math.max(actor.level, actorRecord.level) < CLASS_NONCOMBAT_MIN_LEVEL) {
    return { state: "blocked" as const, reason: "level-locked" as const, actor: actorRecord, target: targetRecord };
  }
  if (Math.max(target!.level, targetRecord.level) < CLASS_NONCOMBAT_MIN_LEVEL) {
    return { state: "blocked" as const, reason: "target-level-locked" as const, actor: actorRecord, target: targetRecord };
  }
  if (actor.hpCurrent <= 0) {
    return { state: "blocked" as const, reason: "actor-defeated" as const, actor: actorRecord, target: targetRecord };
  }

  return {
    state: "ready" as const,
    actor,
    target: target!,
    actorRecord,
    targetRecord,
    locationId: normalizePresenceLocationId(actor.user.lastSeenLocationId)
  };
}

function validateSharedTarget(
  actor: IncludedCharacter,
  target: IncludedCharacter | null,
  input: {
    expectedActorRemortCount: number;
    expectedTargetRemortCount: number;
    activeSince: Date;
  },
  options: { allowSelf: boolean; blockAdventure?: boolean }
): { state: "blocked"; reason: NoncombatGateReason; actor?: CharacterRecord; target?: CharacterRecord } | null {
  const actorRecord = toCharacterRecord(actor);
  if (!target) {
    return { state: "blocked", reason: "target-not-found", actor: actorRecord };
  }
  const targetRecord = toCharacterRecord(target);
  if (!options.allowSelf && actor.id === target.id) {
    return { state: "blocked", reason: "self-target", actor: actorRecord, target: targetRecord };
  }
  if ((actorRecord.remortCount ?? 0) !== input.expectedActorRemortCount) {
    return { state: "blocked", reason: "actor-remort-mismatch", actor: actorRecord, target: targetRecord };
  }
  if ((targetRecord.remortCount ?? 0) !== input.expectedTargetRemortCount) {
    return { state: "blocked", reason: "target-remort-mismatch", actor: actorRecord, target: targetRecord };
  }
  const actorLocation = normalizePresenceLocationId(actor.user.lastSeenLocationId);
  const targetLocation = normalizePresenceLocationId(target.user.lastSeenLocationId);
  if (actorLocation !== targetLocation) {
    return { state: "blocked", reason: "wrong-location", actor: actorRecord, target: targetRecord };
  }
  if (actor.id !== target.id && (!target.user.lastActionAt || target.user.lastActionAt < input.activeSince)) {
    return { state: "blocked", reason: "target-inactive", actor: actorRecord, target: targetRecord };
  }
  const blocked = options.blockAdventure ? isVarenykBlocked : isBlocked;
  if (blocked(actor)) {
    return { state: "blocked", reason: "actor-blocked", actor: actorRecord, target: targetRecord };
  }
  if (blocked(target)) {
    return { state: "blocked", reason: "target-blocked", actor: actorRecord, target: targetRecord };
  }

  return null;
}

async function mutatePriestHealPair(
  tx: TxClient,
  actor: IncludedCharacter,
  target: IncludedCharacter,
  hpAfter: number,
  targetEffectiveHpMax: number,
  manaCost: number,
  now: Date
): Promise<{ count: number }> {
  const actorUpdate = await tx.character.updateMany({
    where: { id: actor.id, manaCurrent: actor.manaCurrent },
    data: {
      manaCurrent: actor.manaCurrent - manaCost,
      manaRegenAt: now
    }
  });
  if (actorUpdate.count !== 1) {
    return { count: 0 };
  }
  return tx.character.updateMany({
    where: { id: target.id, hpCurrent: target.hpCurrent },
    data: {
      hpCurrent: hpAfter,
      hpRegenAt: hpAfter >= targetEffectiveHpMax ? now : target.hpRegenAt
    }
  });
}

async function claimCooldown(
  tx: TxClient,
  characterId: string,
  key: string,
  now: Date,
  availableAt: Date
): Promise<{ state: "claimed"; id: string } | { state: "cooldown"; availableAt: Date }> {
  const existing = await tx.characterCooldown.findUnique({
    where: { characterId_key: { characterId, key } }
  });
  if (existing && existing.availableAt > now) {
    return { state: "cooldown", availableAt: existing.availableAt };
  }
  if (existing) {
    const updated = await tx.characterCooldown.updateMany({
      where: { id: existing.id, availableAt: { lte: now } },
      data: { availableAt }
    });
    if (updated.count !== 1) {
      return { state: "cooldown", availableAt: existing.availableAt };
    }
    return { state: "claimed", id: existing.id };
  }

  const created = await tx.characterCooldown.create({
    data: { characterId, key, availableAt }
  });
  return { state: "claimed", id: created.id };
}

async function setCooldownResult(tx: TxClient, id: string, resultJson: unknown): Promise<void> {
  await tx.characterCooldown.update({
    where: { id },
    data: { resultJson: toJson(resultJson) }
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function expireBlessings(tx: TxClient, targetCharacterId: string, now: Date): Promise<void> {
  await tx.noncombatPriestBlessing.updateMany({
    where: {
      targetCharacterId,
      status: "active",
      expiresAt: { lte: now }
    },
    data: {
      status: "expired",
      activeGuard: null,
      endedAt: now
    }
  });
}

async function findCooldown(client: TxClient | PrismaClient, characterId: string, key: string) {
  return client.characterCooldown.findUnique({
    where: { characterId_key: { characterId, key } }
  });
}

async function listVarenykSatedByTargetId(
  client: PrismaClient,
  characterIds: string[],
  now: Date
): Promise<Map<string, { availableAt: Date | null; payload: VarenykSatedPayloadV1 | null }>> {
  const rows = await client.characterCooldown.findMany({
    where: { characterId: { in: [...new Set(characterIds)] }, key: VARENYK_SATED_STATUS_KEY }
  });
  return new Map(rows.map((row) => {
    const payload = parseVarenykSatedPayload(row.resultJson);
    const authoritativeAvailableAt = getAuthoritativeSatedAvailableAt(
      row,
      payload,
      row.characterId,
      payload?.recipientRemortCount ?? -1
    );
    return [row.characterId, {
      availableAt: authoritativeAvailableAt && authoritativeAvailableAt > now ? authoritativeAvailableAt : null,
      payload: payload && Date.parse(payload.expiresAt) > now.getTime() ? payload : null
    }];
  }));
}

function getAuthoritativeSatedAvailableAt(
  row: Awaited<ReturnType<typeof findCooldown>>,
  payload: VarenykSatedPayloadV1 | null,
  recipientCharacterId: string,
  recipientRemortCount: number
): Date | null {
  if (!row) {
    return null;
  }
  const payloadAvailableAt = payload &&
    payload.recipientCharacterId === recipientCharacterId &&
    payload.recipientRemortCount === recipientRemortCount
    ? new Date(payload.availableAt)
    : null;
  return payloadAvailableAt && payloadAvailableAt > row.availableAt
    ? payloadAvailableAt
    : row.availableAt;
}

function isSettledHistoricalSatedRow(
  row: NonNullable<Awaited<ReturnType<typeof findCooldown>>>,
  payload: VarenykSatedPayloadV1 | null,
  characterId: string,
  now: Date
): boolean {
  if (!payload || payload.recipientCharacterId !== characterId) {
    return false;
  }
  const expiresAt = Date.parse(payload.expiresAt);
  const cursorAt = Date.parse(payload.cursorAt);
  const payloadAvailableAt = Date.parse(payload.availableAt);
  return Number.isFinite(expiresAt) &&
    Number.isFinite(cursorAt) &&
    Number.isFinite(payloadAvailableAt) &&
    expiresAt <= now.getTime() &&
    cursorAt >= expiresAt &&
    row.availableAt <= now &&
    payloadAvailableAt <= now.getTime();
}

const satedCharacterInclude = {
  user: {
    select: {
      telegramUserId: true,
      lastSeenLocationId: true,
      lastActionAt: true,
      currentRaidId: true,
      currentAdventureId: true
    }
  },
  activeCombatLease: { select: { kind: true, referenceId: true } },
  equipment: { select: { id: true, slot: true, itemId: true, updatedAt: true } },
  drinkState: {
    select: {
      drinkKey: true,
      phase: true,
      startedAt: true,
      expiresAt: true,
      metadataJson: true
    }
  },
  _count: { select: { remorts: true } }
} satisfies Prisma.CharacterInclude;

type SatedCharacter = Prisma.CharacterGetPayload<{ include: typeof satedCharacterInclude }>;

async function findSatedCharacter(
  client: TxClient | PrismaClient,
  telegramUserId: bigint
): Promise<SatedCharacter | null> {
  return client.character.findFirst({
    where: { user: { telegramUserId } },
    include: satedCharacterInclude
  });
}

async function findSatedCharacterById(
  client: TxClient | PrismaClient,
  characterId: string
): Promise<SatedCharacter | null> {
  return client.character.findUnique({
    where: { id: characterId },
    include: satedCharacterInclude
  });
}

async function getSatedCanonicalResources(
  tx: TxClient | PrismaClient,
  character: SatedCharacter,
  now: Date,
  includeActiveBlessing = false
) {
  const localDates = character.equipment.map((row) => `${row.slot}:${row.id}:${row.updatedAt.getTime()}`);
  const attunementActions = localDates.length > 0
    ? await tx.dailyAction.findMany({
        where: {
          characterId: character.id,
          key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
          localDate: { in: localDates }
        },
        select: { resultJson: true }
      })
    : [];
  const actionPayloads = attunementActions.map((row) => row.resultJson);
  const attunedEquipment = character.equipment.flatMap((row) => {
    if (isEquipmentAttunementPendingForRow({ row, actionPayloads, now })) {
      return [];
    }
    const item = items.find((candidate) => candidate.id === row.itemId);
    return item ? [{ row, item }] : [];
  });
  const equippedItems = attunedEquipment.map(({ item }) => item);
  const baseSummary = summarizeCharacter(toCharacterRecord(character), {
    equippedItems,
    remortCount: getIncludedRemortCount(character)
  });
  const activeBlessing = includeActiveBlessing
    ? await tx.noncombatPriestBlessing.findFirst({
        where: {
          targetCharacterId: character.id,
          status: "active",
          expiresAt: { gt: now }
        },
        select: {
          id: true,
          bonusStat: true,
          bonusAmount: true,
          expiresAt: true
        },
        orderBy: { startedAt: "desc" }
      })
    : null;
  const summary = applyPriestBlessingBonusToSummary(baseSummary, activeBlessing, now);
  const drink = character.drinkState && isShynokDrinkKey(character.drinkState.drinkKey)
    ? {
        drinkKey: character.drinkState.drinkKey,
        phase: character.drinkState.phase === "queued" ? "queued" as const : "timed" as const,
        startedAt: character.drinkState.startedAt,
        expiresAt: character.drinkState.expiresAt,
        metadata: character.drinkState.metadataJson
      }
    : null;
  const recoveryWindows = buildShynokRecoveryWindows(drink).map((window) => ({
    startsAt: window.startsAt.toISOString(),
    expiresAt: window.expiresAt.toISOString(),
    multiplierBp: window.multiplierBp
  }));
  const regeneration = applyPassiveResourceRegeneration({
    resources: {
      hpCurrent: baseSummary.hpCurrent,
      hpMax: baseSummary.hpMax,
      manaCurrent: baseSummary.manaCurrent,
      manaMax: baseSummary.manaMax,
      hpRegenAt: character.hpRegenAt,
      manaRegenAt: character.manaRegenAt
    },
    profile: {
      raceId: summary.raceId,
      classId: summary.classId,
      title: summary.title,
      stats: baseSummary.stats
    },
    now,
    multiplierWindows: recoveryWindows.map((window) => ({
      startsAt: new Date(window.startsAt),
      expiresAt: new Date(window.expiresAt),
      multiplierBp: window.multiplierBp
    }))
  });
  return {
    summary,
    baseSummary,
    activeCosmeticTitleGrantId: character.activeCosmeticTitleGrantId,
    regeneration,
    equipmentItemIds: equippedItems.map((item) => item.id).sort(),
    attunedEquipmentRows: attunedEquipment
      .map(({ row }) => ({
        rowId: row.id,
        slot: row.slot,
        itemId: row.itemId,
        updatedAt: row.updatedAt.toISOString()
      }))
      .sort((left, right) =>
        left.slot.localeCompare(right.slot) ||
        left.rowId.localeCompare(right.rowId) ||
        left.itemId.localeCompare(right.itemId) ||
        left.updatedAt.localeCompare(right.updatedAt)
      ),
    recoveryWindows,
    activePriestBlessing: activeBlessing
      ? {
          id: activeBlessing.id,
          bonusStat: activeBlessing.bonusStat,
          bonusAmount: activeBlessing.bonusAmount,
          expiresAt: activeBlessing.expiresAt.toISOString()
        }
      : null
  };
}

function toVarenykPlanningSnapshot(
  canonical: Awaited<ReturnType<typeof getSatedCanonicalResources>>
) {
  return {
    summary: {
      ...canonical.summary,
      hpCurrent: canonical.regeneration.resources.hpCurrent,
      manaCurrent: canonical.regeneration.resources.manaCurrent
    },
    activeCosmeticTitleGrantId: canonical.activeCosmeticTitleGrantId,
    naturalHpMax: canonical.baseSummary.hpMax,
    naturalManaMax: canonical.baseSummary.manaMax,
    equipmentItemIds: canonical.equipmentItemIds,
    attunedEquipmentRows: canonical.attunedEquipmentRows,
    activePriestBlessing: canonical.activePriestBlessing
  };
}

async function settleSatedForCommit(
  tx: TxClient,
  character: SatedCharacter,
  now: Date
): Promise<{
  character: SatedCharacter;
  canonical: Awaited<ReturnType<typeof getSatedCanonicalResources>>;
  cooldown: Awaited<ReturnType<typeof findCooldown>>;
  payload: VarenykSatedPayloadV1 | null;
}> {
  const cooldown = await findCooldown(tx, character.id, VARENYK_SATED_STATUS_KEY);
  const payload = parseVarenykSatedPayload(cooldown?.resultJson);
  const canonical = await getSatedCanonicalResources(tx, character, now, true);
  if (!cooldown || !payload || payload.recipientCharacterId !== character.id ||
      payload.recipientRemortCount !== getIncludedRemortCount(character)) {
    return { character, canonical, cooldown, payload: null };
  }

  const settlement = settleVarenykSatedOutsideCombat({
    payload,
    resources: {
      hp: canonical.regeneration.resources.hpCurrent,
      hpMax: canonical.regeneration.resources.hpMax,
      mana: canonical.regeneration.resources.manaCurrent,
      manaMax: canonical.regeneration.resources.manaMax
    },
    now,
    combatBlocked: false
  });
  const safeSettlement = canonical.regeneration.resources.hpCurrent <= 0 && settlement.hpRestored > 0
    ? { ...settlement, resources: { ...settlement.resources, hp: 0 }, hpRestored: 0 }
    : settlement;
  const hpRegenAt = safeSettlement.resources.hp >= safeSettlement.resources.hpMax
    ? now
    : canonical.regeneration.resources.hpRegenAt;
  const manaRegenAt = safeSettlement.resources.mana >= safeSettlement.resources.manaMax
    ? now
    : canonical.regeneration.resources.manaRegenAt;
  const resourceChanged = safeSettlement.resources.hp !== character.hpCurrent ||
    safeSettlement.resources.mana !== character.manaCurrent ||
    hpRegenAt?.getTime() !== character.hpRegenAt?.getTime() ||
    manaRegenAt?.getTime() !== character.manaRegenAt?.getTime();
  if (resourceChanged) {
    const updated = await tx.character.updateMany({
      where: {
        id: character.id,
        hpCurrent: character.hpCurrent,
        manaCurrent: character.manaCurrent,
        hpRegenAt: character.hpRegenAt,
        manaRegenAt: character.manaRegenAt
      },
      data: {
        hpCurrent: safeSettlement.resources.hp,
        manaCurrent: safeSettlement.resources.mana,
        hpRegenAt,
        manaRegenAt
      }
    });
    if (updated.count !== 1) {
      throw new ResourceRaceError();
    }
  }
  let nextCooldown = cooldown;
  if (safeSettlement.payload.cursorAt !== payload.cursorAt) {
    const nextJson = toJson(safeSettlement.payload);
    const updated = await tx.characterCooldown.updateMany({
      where: {
        id: cooldown.id,
        availableAt: cooldown.availableAt,
        resultJson: { equals: cooldown.resultJson ?? Prisma.JsonNull }
      },
      data: { resultJson: nextJson }
    });
    if (updated.count !== 1) {
      throw new SatedClaimRaceError();
    }
    nextCooldown = { ...cooldown, resultJson: safeSettlement.payload as unknown as Prisma.JsonValue };
  }
  const refreshed = resourceChanged
    ? await findSatedCharacterById(tx, character.id)
    : character;
  if (!refreshed) {
    throw new ResourceRaceError();
  }
  const refreshedCanonical = await getSatedCanonicalResources(tx, refreshed, now, true);
  return {
    character: refreshed,
    canonical: refreshedCanonical,
    cooldown: nextCooldown,
    payload: safeSettlement.payload
  };
}

interface SatedPreviewPayload {
  kind: "varenyk-sated-preview-v2";
  version: 2;
  previewToken: string;
  actorCharacterId: string;
  actorRemortCount: number;
  recipientCharacterId: string;
  recipientRemortCount: number;
  targetTelegramUserId: string | null;
  statRank: number;
  plan: import("../../domain/noncombat/varenykSatedSupport").VarenykSatedPlan;
  effectiveStats: {
    intelligence: number;
    charisma: number;
    level: number;
    equipmentItemIds: string[];
    attunedEquipmentRows: Array<{
      rowId: string;
      slot: string;
      itemId: string;
      updatedAt: string;
    }>;
  };
  actorPlanning: PersistedSatedPreviewPlanningSnapshot;
  targetPlanning: PersistedSatedPreviewPlanningSnapshot;
  recoveryWindows: Array<{ startsAt: string; expiresAt: string; multiplierBp: number }>;
  expiresAt: string;
}

interface PersistedSatedPreviewPlanningSnapshot {
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  naturalHpMax: number;
  naturalManaMax: number;
  stats: VarenykPlanningSnapshot["summary"]["stats"];
  equipmentItemIds: string[];
  attunedEquipmentRows: VarenykPlanningSnapshot["attunedEquipmentRows"];
  activePriestBlessing: VarenykPlanningSnapshot["activePriestBlessing"];
}

function isSatedPreviewRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPersistedSatedPreviewPlanningSnapshot(
  value: unknown
): value is PersistedSatedPreviewPlanningSnapshot {
  const stats = isSatedPreviewRecord(value) && isSatedPreviewRecord(value.stats)
    ? value.stats
    : null;
  if (!isSatedPreviewRecord(value) ||
      !Number.isInteger(value.hpCurrent) ||
      !Number.isInteger(value.hpMax) ||
      !Number.isInteger(value.manaCurrent) ||
      !Number.isInteger(value.manaMax) ||
      !Number.isInteger(value.naturalHpMax) ||
      !Number.isInteger(value.naturalManaMax) ||
      !stats ||
      !["strength", "dexterity", "intelligence", "charisma", "luck"]
        .every((key) => Number.isInteger(stats[key])) ||
      !Array.isArray(value.equipmentItemIds) ||
      !value.equipmentItemIds.every((entry) => typeof entry === "string") ||
      !isSatedAttunedEquipmentRows(value.attunedEquipmentRows)) {
    return false;
  }
  const blessing = value.activePriestBlessing;
  return blessing === null || (
    isSatedPreviewRecord(blessing) &&
    typeof blessing.id === "string" &&
    (blessing.bonusStat === null || typeof blessing.bonusStat === "string") &&
    Number.isInteger(blessing.bonusAmount) &&
    typeof blessing.expiresAt === "string" &&
    Number.isFinite(Date.parse(blessing.expiresAt))
  );
}

function isSatedAttunedEquipmentRows(value: unknown): value is VarenykPlanningSnapshot["attunedEquipmentRows"] {
  return Array.isArray(value) && value.every((entry) =>
    isSatedPreviewRecord(entry) &&
    typeof entry.rowId === "string" &&
    typeof entry.slot === "string" &&
    typeof entry.itemId === "string" &&
    typeof entry.updatedAt === "string" &&
    Number.isFinite(Date.parse(entry.updatedAt))
  );
}

function parseSatedPreviewPayload(value: unknown): SatedPreviewPayload | null {
  if (
    !isSatedPreviewRecord(value) ||
    value.kind !== "varenyk-sated-preview-v2" ||
    value.version !== 2 ||
    typeof value.previewToken !== "string" ||
    typeof value.actorCharacterId !== "string" ||
    typeof value.actorRemortCount !== "number" ||
    typeof value.recipientCharacterId !== "string" ||
    typeof value.recipientRemortCount !== "number" ||
    (value.targetTelegramUserId !== null && typeof value.targetTelegramUserId !== "string") ||
    !Number.isInteger(value.statRank) ||
    !isSatedPreviewRecord(value.plan) ||
    !Number.isInteger(value.plan.rank) ||
    !Number.isInteger(value.plan.manaCost) ||
    !Number.isInteger(value.plan.immediateHp) ||
    !Number.isInteger(value.plan.immediateMana) ||
    !isSatedPreviewRecord(value.effectiveStats) ||
    !Number.isInteger(value.effectiveStats.intelligence) ||
    !Number.isInteger(value.effectiveStats.charisma) ||
    !Number.isInteger(value.effectiveStats.level) ||
    !Array.isArray(value.effectiveStats.equipmentItemIds) ||
    !value.effectiveStats.equipmentItemIds.every((entry) => typeof entry === "string") ||
    !isSatedAttunedEquipmentRows(value.effectiveStats.attunedEquipmentRows) ||
    !isPersistedSatedPreviewPlanningSnapshot(value.actorPlanning) ||
    !isPersistedSatedPreviewPlanningSnapshot(value.targetPlanning) ||
    !Array.isArray(value.recoveryWindows) ||
    !value.recoveryWindows.every((entry) =>
      isSatedPreviewRecord(entry) &&
      typeof entry.startsAt === "string" && Number.isFinite(Date.parse(entry.startsAt)) &&
      typeof entry.expiresAt === "string" && Number.isFinite(Date.parse(entry.expiresAt)) &&
      Number.isInteger(entry.multiplierBp)
    ) ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt))
  ) {
    return null;
  }
  return value as unknown as SatedPreviewPayload;
}

function toPersistedSatedPreviewPlanningSnapshot(
  planning: VarenykPlanningSnapshot
): PersistedSatedPreviewPlanningSnapshot {
  return {
    hpCurrent: planning.summary.hpCurrent,
    hpMax: planning.summary.hpMax,
    manaCurrent: planning.summary.manaCurrent,
    manaMax: planning.summary.manaMax,
    naturalHpMax: planning.naturalHpMax,
    naturalManaMax: planning.naturalManaMax,
    stats: planning.summary.stats,
    equipmentItemIds: planning.equipmentItemIds,
    attunedEquipmentRows: planning.attunedEquipmentRows,
    activePriestBlessing: planning.activePriestBlessing
  };
}

function matchesSatedPreviewPlan(
  preview: SatedPreviewPayload,
  canonical: Awaited<ReturnType<typeof getSatedCanonicalResources>>
): boolean {
  const statPlan = buildVarenykSatedPlan({
    effectiveIntelligence: canonical.summary.stats.intelligence,
    effectiveCharisma: canonical.summary.stats.charisma,
    level: canonical.summary.level
  });
  const currentPlanning = toPersistedSatedPreviewPlanningSnapshot(
    toVarenykPlanningSnapshot(canonical)
  );
  return preview.statRank === statPlan.rank &&
    preview.effectiveStats.intelligence === canonical.summary.stats.intelligence &&
    preview.effectiveStats.charisma === canonical.summary.stats.charisma &&
    preview.effectiveStats.level === canonical.summary.level &&
    preview.effectiveStats.equipmentItemIds.length === canonical.equipmentItemIds.length &&
    preview.effectiveStats.equipmentItemIds.every((id, index) => id === canonical.equipmentItemIds[index]) &&
    JSON.stringify(preview.effectiveStats.attunedEquipmentRows) === JSON.stringify(canonical.attunedEquipmentRows) &&
    preview.actorPlanning.hpMax === currentPlanning.hpMax &&
    preview.actorPlanning.manaMax === currentPlanning.manaMax &&
    preview.actorPlanning.naturalHpMax === currentPlanning.naturalHpMax &&
    preview.actorPlanning.naturalManaMax === currentPlanning.naturalManaMax &&
    JSON.stringify(preview.actorPlanning.stats) === JSON.stringify(currentPlanning.stats) &&
    JSON.stringify(preview.actorPlanning.equipmentItemIds) === JSON.stringify(currentPlanning.equipmentItemIds) &&
    JSON.stringify(preview.actorPlanning.attunedEquipmentRows) ===
      JSON.stringify(currentPlanning.attunedEquipmentRows) &&
    JSON.stringify(preview.actorPlanning.activePriestBlessing) ===
      JSON.stringify(currentPlanning.activePriestBlessing) &&
    JSON.stringify(preview.recoveryWindows) === JSON.stringify(canonical.recoveryWindows) &&
    preview.plan.rank >= 1 &&
    preview.plan.rank <= preview.statRank &&
    preview.plan.manaCost === VARENYK_SATED_MANA_COSTS[preview.plan.rank - 1] &&
    preview.plan.immediateHp === 2 + preview.plan.rank &&
    preview.plan.immediateMana === 1;
}

function matchesSatedPreview(
  preview: SatedPreviewPayload,
  input: Parameters<ClassNoncombatRepository["completeVarenykSated"]>[1],
  actor: SatedCharacter,
  target: SatedCharacter
): boolean {
  return Date.parse(preview.expiresAt) > input.now.getTime() &&
    preview.previewToken === input.previewToken &&
    preview.actorCharacterId === actor.id &&
    preview.actorRemortCount === input.expectedActorRemortCount &&
    preview.actorRemortCount === getIncludedRemortCount(actor) &&
    preview.recipientCharacterId === target.id &&
    preview.recipientRemortCount === input.expectedTargetRemortCount &&
    preview.recipientRemortCount === getIncludedRemortCount(target) &&
    preview.targetTelegramUserId === (input.targetTelegramUserId?.toString() ?? null);
}

function matchesSatedReplay(
  payload: VarenykSatedPayloadV1,
  previewToken: string,
  actor: IncludedCharacter,
  target: IncludedCharacter
): boolean {
  return payload.receipt.previewToken === previewToken &&
    payload.actorCharacterId === actor.id &&
    payload.actorRemortCount === getIncludedRemortCount(actor) &&
    payload.receipt.actorTelegramUserId === actor.user.telegramUserId.toString() &&
    payload.recipientCharacterId === target.id &&
    payload.recipientRemortCount === getIncludedRemortCount(target) &&
    payload.receipt.targetTelegramUserId === target.user.telegramUserId.toString();
}

function mapSatedReplay(
  payload: VarenykSatedPayloadV1,
  actor: CharacterRecord,
  target: CharacterRecord
) {
  return {
    state: "completed" as const,
    action: mapSatedAction(
      payload,
      BigInt(payload.receipt.actorTelegramUserId),
      BigInt(payload.receipt.targetTelegramUserId),
      false
    ),
    actor,
    target,
    status: payload,
    created: false
  };
}

function mapSatedAction(
  payload: VarenykSatedPayloadV1,
  actorTelegramUserId: bigint,
  targetTelegramUserId: bigint,
  created: boolean
) {
  return {
    activationId: payload.activationId,
    actorCharacterId: payload.actorCharacterId,
    targetCharacterId: payload.recipientCharacterId,
    actorTelegramUserId,
    targetTelegramUserId,
    actorName: payload.receipt.actorName,
    targetName: payload.receipt.targetName,
    actorRemortCount: payload.actorRemortCount,
    targetRemortCount: payload.recipientRemortCount,
    rank: payload.rank,
    manaCost: payload.manaCost,
    immediateHpRestored: payload.receipt.immediateHpRestored,
    immediateManaRestored: payload.receipt.immediateManaRestored,
    startedAt: new Date(payload.startedAt),
    expiresAt: new Date(payload.expiresAt),
    availableAt: new Date(payload.availableAt),
    created
  };
}

async function resolveSatedReplayAfterRace(
  prisma: PrismaClient,
  actorTelegramUserId: bigint,
  input: Parameters<ClassNoncombatRepository["completeVarenykSated"]>[1]
) {
  const actor = await findSatedCharacter(prisma, actorTelegramUserId);
  if (!actor) return null;
  const target = input.targetTelegramUserId === null
    ? actor
    : await findSatedCharacter(prisma, input.targetTelegramUserId);
  if (!target) return null;
  const row = await findCooldown(prisma, target.id, VARENYK_SATED_STATUS_KEY);
  const payload = parseVarenykSatedPayload(row?.resultJson);
  return payload && matchesSatedReplay(payload, input.previewToken, actor, target)
    ? mapSatedReplay(payload, toCharacterRecord(actor), toCharacterRecord(target))
    : null;
}

async function listActiveTargets(
  client: PrismaClient,
  actorCharacterId: string,
  locationId: string,
  activeSince: Date
) {
  const locationIds = getPresenceLocationQueryIds(locationId);
  const users = await client.user.findMany({
    where: {
      lastSeenLocationId: { in: locationIds },
      lastActionAt: { gte: activeSince },
      character: { is: { id: { not: actorCharacterId } } }
    },
    include: {
      character: { include: remortCountInclude }
    },
    orderBy: { lastActionAt: "desc" }
  });

  return users.flatMap((user) =>
    user.character
      ? [{
          telegramUserId: user.telegramUserId,
          characterId: user.character.id,
          character: toActiveTargetCharacterRecord(user.character, user.character.userId, user.lastSeenLocationId),
          name: user.character.name,
          classId: user.character.classId,
          level: user.character.level,
          hpCurrent: user.character.hpCurrent,
          hpMax: getEffectiveHpMax(user.character),
          gold: user.character.gold,
          remortCount: getIncludedRemortCount(user.character),
          priestBlessAvailableAt: null,
          rogueAttemptedToday: false,
          varenykSatedAvailableAt: null,
          varenykSated: null
        }]
      : []
  );
}

async function listRogueAttemptedTargetIds(
  client: PrismaClient,
  actorCharacterId: string,
  localDate: string
): Promise<string[]> {
  const attempts = await client.noncombatRoguePickpocketAttempt.findMany({
    where: { actorCharacterId, localDate },
    select: { targetCharacterId: true }
  });

  return attempts.map((attempt) => attempt.targetCharacterId);
}

async function listPriestBlessAvailableAtByTargetId(
  client: PrismaClient,
  actorCharacterId: string,
  targetCharacterIds: string[],
  now: Date
): Promise<Map<string, Date>> {
  const uniqueTargetIds = [...new Set(targetCharacterIds)];
  if (uniqueTargetIds.length === 0) {
    return new Map();
  }

  const [pairCooldowns, activeBlessings] = await Promise.all([
    client.noncombatPriestAidAction.findMany({
      where: {
        actorCharacterId,
        targetCharacterId: { in: uniqueTargetIds },
        actionKind: "blessing",
        status: "completed",
        cooldownAvailableAt: { gt: now }
      },
      select: { targetCharacterId: true, cooldownAvailableAt: true },
      orderBy: { cooldownAvailableAt: "desc" }
    }),
    client.noncombatPriestBlessing.findMany({
      where: {
        targetCharacterId: { in: uniqueTargetIds },
        status: "active",
        expiresAt: { gt: now }
      },
      select: { targetCharacterId: true, expiresAt: true },
      orderBy: { expiresAt: "desc" }
    })
  ]);
  const availableAtByTargetId = new Map<string, Date>();

  for (const row of activeBlessings) {
    setMaxDate(availableAtByTargetId, row.targetCharacterId, row.expiresAt);
  }
  for (const row of pairCooldowns) {
    setMaxDate(availableAtByTargetId, row.targetCharacterId, row.cooldownAvailableAt);
  }

  return availableAtByTargetId;
}

async function findPriestBlessPairCooldownAvailableAt(
  client: TxClient,
  actorCharacterId: string,
  targetCharacterId: string,
  now: Date
): Promise<Date | null> {
  const action = await client.noncombatPriestAidAction.findFirst({
    where: {
      actorCharacterId,
      targetCharacterId,
      actionKind: "blessing",
      status: "completed",
      cooldownAvailableAt: { gt: now }
    },
    select: { cooldownAvailableAt: true },
    orderBy: { cooldownAvailableAt: "desc" }
  });

  return action?.cooldownAvailableAt ?? null;
}

function setMaxDate(map: Map<string, Date>, key: string, value: Date): void {
  const current = map.get(key);
  if (!current || value > current) {
    map.set(key, value);
  }
}

function getPresenceLocationQueryIds(locationId: string): string[] {
  const normalized = normalizePresenceLocationId(locationId);

  if (normalized === PRESENCE_LOCATION_KORCHMA_HALL) {
    return [PRESENCE_LOCATION_KORCHMA_HALL, PRESENCE_LOCATION_TAVERN];
  }
  if (normalized === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE) {
    return [PRESENCE_LOCATION_KORCHMA_QUEST_TABLE, PRESENCE_LOCATION_SHAWARMA];
  }
  if (normalized === PRESENCE_LOCATION_KORCHMA_CELLAR) {
    return [PRESENCE_LOCATION_KORCHMA_CELLAR, PRESENCE_LOCATION_TAVERN_CELLAR];
  }

  return [normalized];
}

function isBlocked(character: IncludedCharacter): boolean {
  return Boolean(character.activeCombatLease || character.user.currentRaidId);
}

function isVarenykBlocked(character: IncludedCharacter): boolean {
  return Boolean(isBlocked(character) || character.user.currentAdventureId);
}

type IncludedCharacter = Character & {
  user: {
    telegramUserId: bigint;
    lastSeenLocationId: string | null;
    lastActionAt: Date | null;
    currentRaidId: string | null;
    currentAdventureId: string | null;
  };
  activeCombatLease: { kind: string; referenceId: string } | null;
  _count?: { remorts?: number };
};

const remortCountInclude = {
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

const characterInclude = {
  user: {
    select: {
      telegramUserId: true,
      lastSeenLocationId: true,
      lastActionAt: true,
      currentRaidId: true,
      currentAdventureId: true
    }
  },
  activeCombatLease: {
    select: {
      kind: true,
      referenceId: true
    }
  },
  ...remortCountInclude
} satisfies Prisma.CharacterInclude;

async function findCharacter(client: TxClient | PrismaClient, telegramUserId: bigint): Promise<IncludedCharacter | null> {
  return client.character.findFirst({
    where: { user: { telegramUserId } },
    include: characterInclude
  });
}

async function findCharacterById(
  client: TxClient | PrismaClient,
  characterId: string
): Promise<IncludedCharacter | null> {
  return client.character.findUnique({
    where: { id: characterId },
    include: characterInclude
  });
}

async function findCharacterByIdOrThrow(client: TxClient, characterId: string): Promise<IncludedCharacter> {
  return client.character.findUniqueOrThrow({
    where: { id: characterId },
    include: characterInclude
  });
}

function toActiveTargetCharacterRecord(
  character: Character & { _count?: { remorts?: number } },
  userId: string,
  currentLocationId: string | null
): CharacterRecord {
  const { _count, ...record } = character;
  void _count;

  return {
    ...record,
    userId,
    currentLocationId,
    remortCount: getIncludedRemortCount(character)
  };
}

function toCharacterRecord(character: IncludedCharacter): CharacterRecord {
  const { user, activeCombatLease, ...record } = character;
  void activeCombatLease;
  delete (record as { _count?: unknown })._count;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId,
    remortCount: getIncludedRemortCount(character)
  };
}

function getEffectiveHpMax(character: Character & { _count?: { remorts: number } }): number {
  return summarizeCharacter({
    name: character.name,
    pronoun: character.pronoun,
    path: character.path,
    currentLocationId: null,
    raceId: character.raceId,
    classId: character.classId,
    level: character.level,
    xp: character.xp,
    gold: character.gold,
    hpCurrent: character.hpCurrent,
    hpMax: character.hpMax,
    manaCurrent: character.manaCurrent,
    manaMax: character.manaMax,
    statsJson: character.statsJson,
    remortCount: getIncludedRemortCount(character)
  }).hpMax;
}

function mapPriestAid(row: {
  id: string;
  actorCharacterId: string;
  targetCharacterId: string;
  actorTelegramUserId: bigint;
  targetTelegramUserId: bigint;
  actorName: string;
  targetName: string;
  actionKind: string;
  healAmount: number;
  manaCost: number;
  cooldownAvailableAt: Date;
  completedAt: Date;
}): PriestAidRecord {
  return {
    id: row.id,
    actorCharacterId: row.actorCharacterId,
    targetCharacterId: row.targetCharacterId,
    actorTelegramUserId: row.actorTelegramUserId,
    targetTelegramUserId: row.targetTelegramUserId,
    actorName: row.actorName,
    targetName: row.targetName,
    actionKind: row.actionKind === "blessing" ? "blessing" : "heal",
    healAmount: row.healAmount,
    manaCost: row.manaCost,
    cooldownAvailableAt: row.cooldownAvailableAt,
    completedAt: row.completedAt
  };
}

function mapBlessing(row: {
  id: string;
  actorName: string;
  targetName: string;
  expiresAt: Date;
  bonusStat: string | null;
  bonusAmount: number;
} | null): PriestBlessingRecord | null {
  return row
    ? {
        id: row.id,
        actorName: row.actorName,
        targetName: row.targetName,
        expiresAt: row.expiresAt,
        bonusStat: row.bonusStat,
        bonusAmount: row.bonusAmount
      }
    : null;
}

function mapRogueAttempt(row: {
  id: string;
  actorCharacterId: string;
  targetCharacterId: string;
  actorTelegramUserId: bigint;
  targetTelegramUserId: bigint;
  actorName: string;
  targetName: string;
  outcome: string;
  stolenGold: number;
  actorHpAfter: number | null;
  retaliationToken: string | null;
  retaliationAvailableUntil: Date | null;
  retaliationUsedAt: Date | null;
  retaliationDuelInviteToken: string | null;
  cooldownAvailableAt: Date;
  completedAt: Date;
}): RoguePickpocketAttemptRecord {
  return {
    id: row.id,
    actorCharacterId: row.actorCharacterId,
    targetCharacterId: row.targetCharacterId,
    actorTelegramUserId: row.actorTelegramUserId,
    targetTelegramUserId: row.targetTelegramUserId,
    actorName: row.actorName,
    targetName: row.targetName,
    outcome: row.outcome === "clean-success" ||
      row.outcome === "noticed-success" ||
      row.outcome === "noticed-failure" ||
      row.outcome === "caught-badly"
      ? row.outcome
      : "empty",
    stolenGold: row.stolenGold,
    actorHpAfter: row.actorHpAfter,
    retaliationToken: row.retaliationToken,
    retaliationAvailableUntil: row.retaliationAvailableUntil,
    retaliationUsedAt: row.retaliationUsedAt,
    retaliationDuelInviteToken: row.retaliationDuelInviteToken,
    cooldownAvailableAt: row.cooldownAvailableAt,
    completedAt: row.completedAt
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function safePositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) {
    return 0;
  }

  return Math.min(Math.max(0, Math.floor(page)), Math.max(0, totalPages - 1));
}

class ResourceRaceError extends Error {
  constructor() {
    super("Class noncombat resource mutation lost an optimistic race.");
  }
}

function matchesExpectedPublicCharacter(
  character: IncludedCharacter,
  expected: NonNullable<Parameters<ClassNoncombatRepository["settleVarenykSatedForTelegramUser"]>[3]>
): boolean {
  return character.hpCurrent === expected.hpCurrent &&
    character.manaCurrent === expected.manaCurrent &&
    character.hpRegenAt?.getTime() === expected.hpRegenAt?.getTime() &&
    character.manaRegenAt?.getTime() === expected.manaRegenAt?.getTime() &&
    getIncludedRemortCount(character) === (expected.remortCount ?? 0);
}

function toPublicSatedReadRecord(
  character: IncludedCharacter,
  payload: VarenykSatedPayloadV1 | null
) {
  const currentLifePayload = payload &&
    payload.recipientCharacterId === character.id &&
    payload.recipientRemortCount === getIncludedRemortCount(character)
    ? payload
    : null;
  return {
    payload: currentLifePayload,
    hpRestored: 0,
    manaRestored: 0,
    character: toCharacterRecord(character),
    passiveRecoveryNotice: null
  };
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + Math.max(0, Math.floor(minutes)) * 60_000);
}

class SatedClaimRaceError extends Error {
  constructor() {
    super("Varenyk Sated recipient claim lost an optimistic race.");
  }
}
