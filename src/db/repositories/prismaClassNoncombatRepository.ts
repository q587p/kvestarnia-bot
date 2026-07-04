import { Prisma, type Character, type PrismaClient } from "@prisma/client";
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
  RoguePickpocketRepositoryResult
} from "./classNoncombatRepository";

type TxClient = Prisma.TransactionClient;

const PRIEST_CLASS_ID = "class.priest";
const ROGUE_CLASS_ID = "class.rogue";
const ROGUE_PICKPOCKET_COOLDOWN_KEY = "noncombat.rogue.pickpocket";

export class PrismaClassNoncombatRepository implements ClassNoncombatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getSnapshotForTelegramUser(
    telegramUserId: bigint,
    input: Parameters<ClassNoncombatRepository["getSnapshotForTelegramUser"]>[1]
  ): Promise<NoncombatActionSnapshot | null> {
    const actor = await findCharacter(this.prisma, telegramUserId);
    if (!actor) {
      return null;
    }

    const actorRecord = toCharacterRecord(actor);
    const locationId = normalizePresenceLocationId(actor.user.lastSeenLocationId);
    const [rawTargets, attemptedRogueTargetIds, pickpocketCooldown] = await Promise.all([
      listActiveTargets(this.prisma, actor.id, locationId, input.activeSince),
      input.rogueAttemptedLocalDate
        ? listRogueAttemptedTargetIds(this.prisma, actor.id, input.rogueAttemptedLocalDate)
        : Promise.resolve([]),
      findCooldown(this.prisma, actor.id, ROGUE_PICKPOCKET_COOLDOWN_KEY)
    ]);
    const attemptedRogueTargetIdSet = new Set(attemptedRogueTargetIds);
    const blessAvailableAtByTargetId = await listPriestBlessAvailableAtByTargetId(
      this.prisma,
      actor.id,
      [actor.id, ...rawTargets.map((target) => target.characterId)],
      input.now
    );
    const targets = rawTargets.map((target) => ({
      ...target,
      priestBlessAvailableAt: blessAvailableAtByTargetId.get(target.characterId) ?? null,
      rogueAttemptedToday: attemptedRogueTargetIdSet.has(target.characterId)
    }));
    const safePageSize = Math.max(1, Math.min(50, Math.trunc(input.pageSize)));
    const totalPages = Math.max(1, Math.ceil(targets.length / safePageSize));
    const safePage = clampPage(input.page, totalPages);
    const start = safePage * safePageSize;

    return {
      character: actorRecord,
      actorBlocked: isBlocked(actor),
      targets: targets.slice(start, start + safePageSize),
      targetPage: safePage,
      targetTotalPages: totalPages,
      locationId,
      locationName: getLocationName(locationId),
      priestBlessCooldownAvailableAt: null,
      priestSelfBlessAvailableAt: blessAvailableAtByTargetId.get(actor.id) ?? null,
      roguePickpocketCooldownAvailableAt: pickpocketCooldown?.availableAt && pickpocketCooldown.availableAt > input.now
        ? pickpocketCooldown.availableAt
        : null
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

  async isActorBlockedForTelegramUser(telegramUserId: bigint): Promise<boolean> {
    const actor = await findCharacter(this.prisma, telegramUserId);
    return actor ? isBlocked(actor) : false;
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
            statSnapshotJson: toJson(input.statSnapshot),
            resultJson: toJson({
              outcome,
              stolenGold,
              actorHpAfter,
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
  options: { allowSelf: boolean }
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
  if (isBlocked(actor)) {
    return { state: "blocked", reason: "actor-blocked", actor: actorRecord, target: targetRecord };
  }
  if (isBlocked(target)) {
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
          name: user.character.name,
          classId: user.character.classId,
          level: user.character.level,
          hpCurrent: user.character.hpCurrent,
          hpMax: getEffectiveHpMax(user.character),
          gold: user.character.gold,
          remortCount: getIncludedRemortCount(user.character),
          priestBlessAvailableAt: null,
          rogueAttemptedToday: false
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
  return Boolean(character.activeCombatLease || character.user.currentRaidId || character.user.currentAdventureId);
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

async function findCharacterByIdOrThrow(client: TxClient, characterId: string): Promise<IncludedCharacter> {
  return client.character.findUniqueOrThrow({
    where: { id: characterId },
    include: characterInclude
  });
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
