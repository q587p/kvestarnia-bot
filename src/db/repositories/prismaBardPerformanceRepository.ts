import { Prisma, type Character, type PrismaClient } from "@prisma/client";
import {
  applyBardPerformanceDailyHouseCap,
  type BardPerformanceGrade
} from "../../domain/noncombat/bardPerformance";
import {
  getPresenceLocationQueryIds,
  normalizePresenceLocationId,
  PRESENCE_ACTIVE_MS
} from "../../services/presenceService";
import type { CharacterRecord } from "./characterRepository";
import { getIncludedRemortCount } from "./prismaRemortCount";
import {
  findBardMusicAvailableAt,
  grantBardInspiration,
  writeBardMusicAvailability
} from "./prismaBardSupport";
import {
  BARD_INSPIRATION_STATUS_KEY,
  BARD_MUSIC_AVAILABILITY_KEY_PREFIX,
  buildBardInspirationPayload,
  isBardInspirationActive,
  parseBardInspirationCombatState,
  parseBardInspirationPayload
} from "../../domain/noncombat/bardSupport";
import type {
  BardPerformanceAudienceNotice,
  BardPerformanceReactionRecord,
  BardPerformanceRecord,
  BardPerformanceRepository,
  BardPerformanceRespondResult,
  BardPerformanceStartResult,
  BardPerformanceStartSnapshot
} from "./bardPerformanceRepository";

type TxClient = Prisma.TransactionClient;

const BARD_CLASS_ID = "class.bard";

class BardReactionRaceRollback extends Error {
  constructor(readonly reactionId: string) {
    super("Bard performance reaction changed during mutation.");
  }
}

export class PrismaBardPerformanceRepository implements BardPerformanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getStartSnapshotForTelegramUser(telegramUserId: bigint): Promise<BardPerformanceStartSnapshot | null> {
    const character = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      include: {
        ...characterRecordInclude,
        activeCombatLease: {
          select: { kind: true, referenceId: true }
        },
        equipment: {
          select: { itemId: true }
        }
      }
    });

    if (!character) {
      return null;
    }

    return {
      character: toCharacterRecord(character),
      equippedItemIds: character.equipment.map((item) => item.itemId),
      currentRaidId: character.user.currentRaidId,
      activeCombatLease: character.activeCombatLease
    };
  }

  async startPerformanceForTelegramUser(
    telegramUserId: bigint,
    input: Parameters<BardPerformanceRepository["startPerformanceForTelegramUser"]>[1]
  ): Promise<BardPerformanceStartResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const character = await findCharacter(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }
        const record = toCharacterRecord(character);
        const remortCount = getIncludedRemortCount(character);

        if (
          normalizePresenceLocationId(character.user.lastSeenLocationId) !==
          normalizePresenceLocationId(input.locationId)
        ) {
          return { state: "wrong-place", character: record };
        }
        if (character.activeCombatLease) {
          return { state: "active-combat", character: record };
        }
        if (character.user.currentRaidId) {
          return { state: "pending-raid", character: record };
        }
        if (character.classId !== BARD_CLASS_ID) {
          return { state: "not-bard", character: record };
        }
        if (Math.max(character.level, record.level) < input.requiredLevel) {
          return { state: "level-locked", character: record, requiredLevel: input.requiredLevel };
        }

        await expireLivePerformanceGuards(tx, character.id, input.locationId, input.now);

        const live = mapPerformance(await tx.bardPerformance.findFirst({
          where: {
            characterId: character.id,
            locationId: input.locationId,
            remortCount,
            status: "active",
            expiresAt: { gt: input.now }
          },
          orderBy: { startedAt: "desc" }
        }));
        if (live) {
          return { state: "live", character: record, performance: live };
        }

        const musicAvailableAt = await findBardMusicAvailableAt({
          tx,
          characterId: character.id,
          locationId: input.locationId,
          remortCount
        });
        if (musicAvailableAt && musicAvailableAt > input.now) {
          return {
            state: "cooldown",
            character: record,
            availableAt: musicAvailableAt
          };
        }

        const audience = await listAudience(tx, character.id, input.locationId, input.activeAudienceSince);
        if (audience.length === 0 && !input.allowNoAudience) {
          return { state: "no-audience", character: record };
        }

        const paidToday = input.rawHousePayoutGold > 0
          ? await tx.bardPerformance.aggregate({
              where: {
                characterId: character.id,
                locationId: input.locationId,
                localDate: input.localDate
              },
              _sum: {
                housePayoutGold: true
              }
            })
          : null;
        const housePayoutGold = applyBardPerformanceDailyHouseCap(
          input.rawHousePayoutGold,
          paidToday?._sum.housePayoutGold ?? 0
        );
        const liveGuard = buildLiveGuard(character.id, remortCount, input.locationId);
        const performance = mapPerformance(await tx.bardPerformance.create({
          data: {
            token: input.token,
            characterId: character.id,
            telegramUserId,
            performerName: character.name,
            remortCount,
            techniqueId: input.techniqueId,
            rulesVersion: input.rulesVersion,
            locationId: input.locationId,
            localDate: input.localDate,
            status: "active",
            liveGuard,
            grade: input.grade,
            power: input.power,
            housePayoutGold,
            roleActionXp: input.roleActionXp,
            audienceCount: audience.length,
            statSnapshotJson: input.statSnapshot as Prisma.InputJsonValue,
            resultJson: {
              ...(isRecord(input.result) ? input.result : { value: input.result }),
              housePayoutGold,
              audienceCount: audience.length
            },
            startedAt: input.now,
            expiresAt: input.expiresAt,
            cooldownAvailableAt: input.cooldownAvailableAt,
            completedAt: input.now
          }
        }));
        if (!performance) {
          throw new Error("Bard performance mapping failed after create.");
        }
        await writeBardMusicAvailability({
          tx,
          characterId: character.id,
          locationId: input.locationId,
          now: input.now,
          source: "performance",
          sourceId: performance.id
        });

        if (housePayoutGold > 0) {
          await tx.character.update({
            where: { id: character.id },
            data: { gold: { increment: housePayoutGold } }
          });
        }

        const notices: BardPerformanceAudienceNotice[] = [];
        for (const member of audience) {
          const reaction = mapReaction(await tx.bardPerformanceReaction.create({
            data: {
              performanceId: performance.id,
              characterId: member.characterId,
              telegramUserId: member.telegramUserId,
              audienceName: member.name,
              remortCount: member.remortCount,
              status: "offered",
              tipGold: 0,
              resultJson: Prisma.JsonNull,
              offeredAt: input.now,
              expiresAt: input.expiresAt
            }
          }));
          if (reaction) {
            const inspiration = await grantBardInspiration({
              tx,
              activationId: `${performance.id}:${member.characterId}`,
              sourcePerformanceId: performance.id,
              sourceCharacterId: character.id,
              sourceLocationId: input.locationId,
              recipientCharacterId: member.characterId,
              recipientRemortCount: member.remortCount,
              grade: performance.grade as BardPerformanceGrade,
              now: input.now
            });
            notices.push({
              telegramUserId: member.telegramUserId,
              name: member.name,
              reaction,
              ...(inspiration
                ? {
                    inspiration: {
                      mutation: inspiration.mutation,
                      accuracyBonusPp: inspiration.inspiration.accuracyBonusPp,
                      expiresAt: new Date(inspiration.inspiration.expiresAt),
                      now: input.now
                    }
                  }
                : {})
            });
          }
        }

        const updated = await tx.character.findUniqueOrThrow({
          where: { id: character.id },
          include: characterRecordInclude
        });

        return {
          state: "started",
          character: toCharacterRecord(updated),
          performance,
          audience: notices
        };
      });
    } catch (error) {
      if (isLiveGuardUniqueError(error)) {
        return this.replayStartAfterLiveGuardRace(telegramUserId, input);
      }

      throw error;
    }
  }

  private async replayStartAfterLiveGuardRace(
    telegramUserId: bigint,
    input: Parameters<BardPerformanceRepository["startPerformanceForTelegramUser"]>[1]
  ): Promise<BardPerformanceStartResult> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return { state: "no-character" };
      }
      const record = toCharacterRecord(character);
      const remortCount = getIncludedRemortCount(character);
      const liveGuard = buildLiveGuard(character.id, remortCount, input.locationId);

      const live = mapPerformance(await tx.bardPerformance.findFirst({
        where: {
          liveGuard,
          characterId: character.id,
          locationId: input.locationId,
          remortCount,
          status: "active",
          expiresAt: { gt: input.now }
        },
        orderBy: { startedAt: "desc" }
      }));
      if (live) {
        return { state: "live", character: record, performance: live };
      }

      const musicAvailableAt = await findBardMusicAvailableAt({
        tx,
        characterId: character.id,
        locationId: input.locationId,
        remortCount
      });
      if (musicAvailableAt && musicAvailableAt > input.now) {
        return {
          state: "cooldown",
          character: record,
          availableAt: musicAvailableAt
        };
      }

      throw new Error("Bard performance live guard conflict did not resolve to live or cooldown state.");
    });
  }

  async respondToPerformanceForTelegramUser(
    telegramUserId: bigint,
    input: Parameters<BardPerformanceRepository["respondToPerformanceForTelegramUser"]>[1]
  ): Promise<BardPerformanceRespondResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const character = await findCharacter(tx, telegramUserId);
        if (!character) {
          return { state: "no-character" };
        }

        const row = await tx.bardPerformanceReaction.findFirst({
          where: {
            id: input.reactionId,
            characterId: character.id
          },
          include: { performance: true }
        });
        const reaction = mapReaction(row);
        const performance = mapPerformance(row?.performance ?? null);
        if (!row || !reaction || !performance) {
          return { state: "invalid-reaction" };
        }

        const replay = replayReaction(reaction, performance);
        if (replay) {
          return replay;
        }

        if (reaction.expiresAt <= input.now || performance.expiresAt <= input.now) {
          const expired = await setReactionStatus(tx, reaction.id, "expired", 0, input.now, input.result);
          return {
            state: "expired",
            reaction: expired ?? reaction,
            performance
          };
        }

        const remortCount = getIncludedRemortCount(character);
        if (reaction.remortCount !== remortCount) {
          return { state: "remort-mismatch", reaction, performance };
        }
        if (
          normalizePresenceLocationId(character.user.lastSeenLocationId) !==
          normalizePresenceLocationId(performance.locationId)
        ) {
          return { state: "wrong-place", reaction, performance };
        }
        if (character.activeCombatLease) {
          return { state: "active-combat", reaction, performance };
        }
        if (character.user.currentRaidId) {
          return { state: "pending-raid", reaction, performance };
        }

        const performer = await findCharacterById(tx, performance.characterId);
        if (!performer) {
          return { state: "performer-missing", reaction, performance };
        }
        if (getIncludedRemortCount(performer) !== performance.remortCount) {
          return { state: "performer-remorted", reaction, performance };
        }
        if (
          normalizePresenceLocationId(performer.user.lastSeenLocationId) !==
          normalizePresenceLocationId(performance.locationId)
        ) {
          return { state: "performer-wrong-place", reaction, performance };
        }
        if (performer.activeCombatLease) {
          return { state: "performer-active-combat", reaction, performance };
        }
        if (performer.user.currentRaidId) {
          return { state: "performer-pending-raid", reaction, performance };
        }

        if (input.action === "decline") {
          const declined = await setReactionStatus(tx, reaction.id, "declined", 0, input.now, input.result);
          return { state: "declined", reaction: declined ?? reaction, performance };
        }

        const tipGold = input.action === "tip" ? Math.max(0, Math.floor(input.tipGold ?? 0)) : 0;
        if (tipGold > 0) {
          const debited = await tx.character.updateMany({
            where: {
              id: character.id,
              gold: { gte: tipGold }
            },
            data: {
              gold: { decrement: tipGold }
            }
          });
          if (debited.count !== 1) {
            return {
              state: "insufficient-gold",
              reaction,
              performance,
              character: toCharacterRecord(character),
              attemptedTipGold: tipGold
            };
          }

          await tx.character.update({
            where: { id: performance.characterId },
            data: { gold: { increment: tipGold } }
          });
        }

        const completed = await setReactionStatus(
          tx,
          reaction.id,
          tipGold > 0 ? "tipped" : "applauded",
          tipGold,
          input.now,
          input.result
        );
        if (!completed) {
          throw new BardReactionRaceRollback(reaction.id);
        }

        const updated = await tx.character.findUniqueOrThrow({
          where: { id: character.id },
          include: characterRecordInclude
        });

        return {
          state: tipGold > 0 ? "tipped" : "applauded",
          reaction: completed,
          performance,
          character: toCharacterRecord(updated),
          performerTelegramUserId: performance.telegramUserId
        };
      });
    } catch (error) {
      if (error instanceof BardReactionRaceRollback) {
        const row = await this.prisma.bardPerformanceReaction.findUnique({
          where: { id: error.reactionId },
          include: { performance: true }
        });
        const reaction = mapReaction(row);
        const performance = mapPerformance(row?.performance ?? null);

        return reaction && performance
          ? replayReaction(reaction, performance) ?? { state: "invalid-reaction" }
          : { state: "invalid-reaction" };
      }

      throw error;
    }
  }

  async resetForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<{ character: CharacterRecord; deleted: number } | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }
      const [deleted, deletedSupport] = await Promise.all([
        tx.bardPerformance.deleteMany({ where: { characterId: character.id } }),
        tx.characterCooldown.deleteMany({
          where: {
            characterId: character.id,
            OR: [
              { key: BARD_INSPIRATION_STATUS_KEY },
              { key: { startsWith: BARD_MUSIC_AVAILABILITY_KEY_PREFIX } }
            ]
          }
        })
      ]);
      const updated = await tx.character.findUniqueOrThrow({
        where: { id: character.id },
        include: characterRecordInclude
      });
      void now;

      return {
        character: toCharacterRecord(updated),
        deleted: deleted.count + deletedSupport.count
      };
    });
  }

  async getInspirationForTelegramUser(
    telegramUserId: bigint,
    now: Date
  ): Promise<{
    character: CharacterRecord;
    inspiration: import("../../domain/noncombat/bardSupport").BardInspirationPayloadV1 | null;
  } | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }
      const inspiration = parseBardInspirationPayload((await tx.characterCooldown.findUnique({
        where: {
          characterId_key: {
            characterId: character.id,
            key: BARD_INSPIRATION_STATUS_KEY
          }
        },
        select: { resultJson: true }
      }))?.resultJson);
      const remortCount = getIncludedRemortCount(character);
      const frozen = character.activeCombatLease
        ? await findFrozenBardInspiration(
            tx,
            character.activeCombatLease,
            character.id,
            remortCount
          )
        : null;
      const leaseStartedAt = character.activeCombatLease?.createdAt.getTime();
      const leaseOwnsInspiration = Boolean(
        inspiration &&
        typeof leaseStartedAt === "number" &&
        Date.parse(inspiration.startedAt) <= leaseStartedAt &&
        Date.parse(inspiration.cursorAt) <= leaseStartedAt &&
        Date.parse(inspiration.expiresAt) > leaseStartedAt
      );
      const frozenMatches = Boolean(
        inspiration && frozen?.activationId === inspiration.activationId
      );
      const frozenRemainingMs = frozenMatches && frozen
        ? Math.max(0, Date.parse(frozen.expiresAt) - Date.parse(frozen.cursorAt))
        : 0;
      const wallClockActive = inspiration
        ? isBardInspirationActive(inspiration, character.id, remortCount, now)
        : false;
      const activeInspiration = inspiration && leaseOwnsInspiration
        ? frozenMatches && frozenRemainingMs > 0
          ? {
              ...inspiration,
              expiresAt: new Date(
                now.getTime() + frozenRemainingMs
              ).toISOString(),
              cursorAt: now.toISOString()
            }
          : null
        : inspiration && wallClockActive
          ? inspiration
          : null;

      return {
        character: toCharacterRecord(character),
        inspiration: activeInspiration
      };
    });
  }

  async setInspirationForDev(
    telegramUserId: bigint,
    grade: BardPerformanceGrade | null,
    now: Date
  ): Promise<{
    character: CharacterRecord;
    inspiration: import("../../domain/noncombat/bardSupport").BardInspirationPayloadV1 | null;
  } | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacter(tx, telegramUserId);
      if (!character) {
        return null;
      }
      if (!grade) {
        await tx.characterCooldown.deleteMany({
          where: { characterId: character.id, key: BARD_INSPIRATION_STATUS_KEY }
        });
        return { character: toCharacterRecord(character), inspiration: null };
      }
      const inspiration = buildBardInspirationPayload({
        activationId: `dev:${character.id}:${now.getTime()}`,
        sourcePerformanceId: "dev-bard-support",
        sourceCharacterId: character.id,
        sourceLocationId: normalizePresenceLocationId(character.user.lastSeenLocationId),
        recipientCharacterId: character.id,
        recipientRemortCount: getIncludedRemortCount(character),
        grade,
        now
      });
      await tx.characterCooldown.upsert({
        where: {
          characterId_key: {
            characterId: character.id,
            key: BARD_INSPIRATION_STATUS_KEY
          }
        },
        create: {
          characterId: character.id,
          key: BARD_INSPIRATION_STATUS_KEY,
          availableAt: new Date(inspiration.expiresAt),
          resultJson: inspiration as unknown as Prisma.InputJsonValue
        },
        update: {
          availableAt: new Date(inspiration.expiresAt),
          resultJson: inspiration as unknown as Prisma.InputJsonValue
        }
      });

      return { character: toCharacterRecord(character), inspiration };
    });
  }
}

async function findFrozenBardInspiration(
  tx: TxClient,
  lease: { kind: string; referenceId: string },
  characterId: string,
  remortCount: number
) {
  if (lease.kind === "solo-combat") {
    const stateJson = (await tx.soloCombatSession.findFirst({
      where: { id: lease.referenceId, status: "active" },
      select: { stateJson: true }
    }))?.stateJson;
    return findMatchingFrozenBardInspiration(
      toUnknownRecord(stateJson)?.bardInspiration,
      characterId,
      remortCount
    );
  }

  if (lease.kind === "turn-based-duel") {
    const stateJson = (await tx.duelCombatSession.findFirst({
      where: { id: lease.referenceId, status: "active" },
      select: { stateJson: true }
    }))?.stateJson;
    const participants = toUnknownRecord(toUnknownRecord(stateJson)?.participants);
    return findMatchingFrozenBardInspiration(
      Object.values(participants ?? {}).map(
        (participant) => toUnknownRecord(participant)?.bardInspiration
      ),
      characterId,
      remortCount
    );
  }

  if (lease.kind === "party-boss") {
    const stateJson = (await tx.partyBossSession.findFirst({
      where: { partySessionId: lease.referenceId, status: "active" },
      select: { stateJson: true }
    }))?.stateJson;
    const participants = toUnknownRecord(stateJson)?.participants;
    return findMatchingFrozenBardInspiration(
      Array.isArray(participants)
        ? participants.map((participant) => toUnknownRecord(participant)?.bardInspiration)
        : null,
      characterId,
      remortCount
    );
  }

  return null;
}

function findMatchingFrozenBardInspiration(
  value: unknown,
  characterId: string,
  remortCount: number
): ReturnType<typeof parseBardInspirationCombatState> {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    const inspiration = parseBardInspirationCombatState(candidate);
    if (
      inspiration?.recipientCharacterId === characterId &&
      inspiration.recipientRemortCount === remortCount
    ) {
      return inspiration;
    }
  }

  return null;
}

function toUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function listAudience(
  tx: TxClient,
  performerCharacterId: string,
  locationId: string,
  activeAudienceSince: Date
): Promise<Array<{ characterId: string; telegramUserId: bigint; name: string; remortCount: number }>> {
  const users = await tx.user.findMany({
    where: {
      lastSeenLocationId: { in: getPresenceLocationQueryIds(locationId) },
      currentRaidId: null,
      lastActionAt: { gte: activeAudienceSince },
      character: {
        is: {
          id: { not: performerCharacterId },
          activeCombatLease: null
        }
      }
    },
    include: {
      character: {
        include: {
          _count: {
            select: { remorts: true }
          }
        }
      }
    },
    orderBy: { lastActionAt: "desc" }
  });

  return users.flatMap((user) => {
    if (!user.character) {
      return [];
    }

    return [{
      characterId: user.character.id,
      telegramUserId: user.telegramUserId,
      name: user.character.name,
      remortCount: getIncludedRemortCount(user.character)
    }];
  });
}

async function findCharacter(tx: TxClient, telegramUserId: bigint) {
  return tx.character.findFirst({
    where: { user: { telegramUserId } },
    include: {
      ...characterRecordInclude,
      activeCombatLease: {
        select: { kind: true, referenceId: true, createdAt: true }
      }
    }
  });
}

async function findCharacterById(tx: TxClient, characterId: string) {
  return tx.character.findUnique({
    where: { id: characterId },
    include: {
      ...characterRecordInclude,
      activeCombatLease: {
        select: { kind: true, referenceId: true, createdAt: true }
      }
    }
  });
}

async function setReactionStatus(
  tx: TxClient,
  reactionId: string,
  status: "applauded" | "tipped" | "declined" | "expired",
  tipGold: number,
  now: Date,
  result: unknown
): Promise<BardPerformanceReactionRecord | null> {
  const updated = await tx.bardPerformanceReaction.updateMany({
    where: {
      id: reactionId,
      status: "offered"
    },
      data: {
        status,
        tipGold,
        resultJson: {
          ...(isRecord(result) ? result : { value: result }),
          tipGold
        },
      respondedAt: now,
      updatedAt: now
    }
  });

  if (updated.count !== 1) {
    return null;
  }

  return mapReaction(await tx.bardPerformanceReaction.findUnique({ where: { id: reactionId } }));
}

async function expireLivePerformanceGuards(
  tx: TxClient,
  characterId: string,
  locationId: string,
  now: Date
): Promise<void> {
  await tx.bardPerformance.updateMany({
    where: {
      characterId,
      locationId,
      status: "active",
      expiresAt: { lte: now }
    },
    data: {
      status: "expired",
      liveGuard: null
    }
  });
}

function buildLiveGuard(characterId: string, remortCount: number, locationId: string): string {
  return `${characterId}:${remortCount}:${locationId}`;
}

function isLiveGuardUniqueError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const meta = error.meta as { target?: unknown } | undefined;
  const targetValue = meta?.target;
  const target = Array.isArray(targetValue)
    ? targetValue.filter((entry): entry is string => typeof entry === "string")
    : typeof targetValue === "string"
      ? [targetValue]
      : [];

  return target.some((entry) =>
    entry.includes("live_guard") ||
    entry.includes("liveGuard") ||
    entry.includes("bard_performances_live_guard")
  );
}

function replayReaction(
  reaction: BardPerformanceReactionRecord,
  performance: BardPerformanceRecord
): BardPerformanceRespondResult | null {
  if (reaction.status === "applauded" || reaction.status === "tipped") {
    return { state: "replayed", reaction, performance };
  }
  if (reaction.status === "declined") {
    return { state: "declined", reaction, performance };
  }
  if (reaction.status === "expired") {
    return { state: "expired", reaction, performance };
  }

  return null;
}

const characterRecordInclude = {
  user: {
    select: {
      telegramUserId: true,
      lastSeenLocationId: true,
      currentRaidId: true
    }
  },
  _count: {
    select: {
      remorts: true
    }
  }
} satisfies Prisma.CharacterInclude;

function toCharacterRecord(
  character: Character & {
    user: { telegramUserId: bigint; lastSeenLocationId: string | null; currentRaidId?: string | null };
    _count?: { remorts?: number };
  }
): CharacterRecord {
  const { user, ...record } = character;
  delete (record as { _count?: unknown })._count;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId,
    remortCount: getIncludedRemortCount(character)
  };
}

function mapPerformance(record: {
  id: string;
  token: string;
  characterId: string;
  telegramUserId: bigint;
  performerName: string;
  remortCount: number;
  techniqueId: string;
  rulesVersion: string;
  locationId: string;
  localDate: string;
  status: string;
  grade: string;
  power: number;
  housePayoutGold: number;
  roleActionXp: number;
  audienceCount: number;
  statSnapshotJson: unknown;
  resultJson: unknown;
  startedAt: Date;
  expiresAt: Date;
  cooldownAvailableAt: Date;
  completedAt: Date | null;
} | null): BardPerformanceRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    token: record.token,
    characterId: record.characterId,
    telegramUserId: record.telegramUserId,
    performerName: record.performerName,
    remortCount: record.remortCount,
    techniqueId: record.techniqueId,
    rulesVersion: record.rulesVersion,
    locationId: record.locationId,
    localDate: record.localDate,
    status: record.status === "expired" ? "expired" : "active",
    grade: record.grade,
    power: record.power,
    housePayoutGold: record.housePayoutGold,
    roleActionXp: record.roleActionXp,
    audienceCount: record.audienceCount,
    statSnapshot: record.statSnapshotJson,
    result: record.resultJson,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    cooldownAvailableAt: record.cooldownAvailableAt,
    completedAt: record.completedAt
  };
}

function mapReaction(record: {
  id: string;
  performanceId: string;
  characterId: string;
  telegramUserId: bigint;
  audienceName: string;
  remortCount: number;
  status: string;
  tipGold: number;
  resultJson: unknown;
  expiresAt: Date;
  respondedAt: Date | null;
} | null): BardPerformanceReactionRecord | null {
  if (!record) {
    return null;
  }
  const status =
    record.status === "applauded" ||
    record.status === "tipped" ||
    record.status === "declined" ||
    record.status === "expired"
      ? record.status
      : "offered";

  return {
    id: record.id,
    performanceId: record.performanceId,
    characterId: record.characterId,
    telegramUserId: record.telegramUserId,
    audienceName: record.audienceName,
    remortCount: record.remortCount,
    status,
    tipGold: record.tipGold,
    result: record.resultJson,
    expiresAt: record.expiresAt,
    respondedAt: record.respondedAt
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getBardPerformanceAudienceCutoff(now: Date): Date {
  return new Date(now.getTime() - PRESENCE_ACTIVE_MS);
}
