import type { Character, Prisma, PrismaClient } from "@prisma/client";
import type {
  CharacterRecord,
  CharacterRepository,
  CreateCharacterInput,
  CreateCharacterResult,
  UpdateCharacterResourcesInput
} from "./characterRepository";
import { PendingReferralConsentError } from "./characterRepository";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";
import type { TelegramUserProfile } from "./userRepository";
import { countCharacterRemorts, getIncludedRemortCount } from "./prismaRemortCount";
import { getQuestMarkerReadSnapshot } from "./questMarkerReadContext";
import type { RestartCharacterResult, RestartRepository } from "./restartRepository";
import { isAuthoritativeLivePartySession } from "./partySessionRepository";
import { readLiveGuildCrest } from "./guildIdentityRead";
import { sanitizeReferralName } from "../../domain/referral/referralIdentity";
import { findClass, findRace, getComboTitle, isPronoun } from "../../content/characterOptions";

export type SpendGoldForTelegramUserResult =
  | { state: "spent"; character: CharacterRecord }
  | { state: "insufficient"; character: CharacterRecord };

export class PrismaCharacterRepository implements CharacterRepository, RestartRepository {
  private readonly characterRecordInclude: ReturnType<typeof buildCharacterRecordInclude>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly hpRecoveryProducer = new HpRecoveryNotificationProducer(false),
    guildIdentityEnabled = false
  ) {
    this.characterRecordInclude = buildCharacterRecordInclude(guildIdentityEnabled);
  }

  async findByUserId(userId: string): Promise<CharacterRecord | null> {
    const character = await this.prisma.character.findUnique({
      where: {
        userId
      },
      include: {
        ...this.characterRecordInclude
      }
    });

    return character ? toCharacterRecord(character) : null;
  }

  async findByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null> {
    const markerSnapshot = getQuestMarkerReadSnapshot(telegramUserId);
    if (markerSnapshot) {
      return markerSnapshot.character;
    }

    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      include: {
        ...this.characterRecordInclude
      }
    });

    return character ? toCharacterRecord(character) : null;
  }

  async findGuardSnapshotByTelegramUserId(telegramUserId: bigint): Promise<CharacterRecord | null> {
    const markerSnapshot = getQuestMarkerReadSnapshot(telegramUserId);
    if (markerSnapshot) {
      return markerSnapshot.character;
    }

    const character = await this.prisma.character.findFirst({
      where: { user: { telegramUserId } },
      include: {
        _count: {
          select: { remorts: true }
        }
      }
    });

    return character
      ? {
          ...character,
          currentLocationId: null,
          remortCount: getIncludedRemortCount(character)
        }
      : null;
  }

  async deleteByTelegramUserId(telegramUserId: bigint): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        select: { id: true }
      });

      if (!character) {
        return false;
      }

      await tx.character.delete({
        where: {
          id: character.id
        }
      });

      return true;
    });
  }

  async restartByTelegramUserId(telegramUserId: bigint): Promise<RestartCharacterResult> {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        select: {
          id: true,
          activeCombatLease: { select: { id: true } }
        }
      });

      if (!character) {
        return "no-character";
      }

      if (character.activeCombatLease) {
        return "active-combat";
      }

      const activeGroupCombat = await countActiveGroupCombats(tx, character.id);
      if (activeGroupCombat > 0) {
        return "active-combat";
      }

      if (await hasAuthoritativePartyParticipation(tx, character.id, now)) {
        return "active-party";
      }

      await reanchorTerminalPartyBossHistory(tx, character.id);

      const deleted = await tx.character.deleteMany({
        where: {
          id: character.id,
          activeCombatLease: {
            is: null
          }
        }
      });

      return deleted.count === 1 ? "deleted" : "active-combat";
    });
  }

  async updateResourcesForTelegramUser(
    telegramUserId: bigint,
    input: UpdateCharacterResourcesInput
  ): Promise<CharacterRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      include: {
        ...this.characterRecordInclude
      }
    });

    if (!character) {
      return null;
    }

    const current = toCharacterRecord(character);
    const data = normalizeCharacterResourceUpdate(current, input);
    const shouldRecordFullRecovery =
      this.hpRecoveryProducer.isEnabled() &&
      input.hpMax !== undefined &&
      data.hpCurrent >= input.hpMax;

    if (input.expectedLife) {
      const expectedLife = input.expectedLife;
      return this.prisma.$transaction(async (tx) => {
        const remortCount = await countCharacterRemorts(tx, character.id);
        if (remortCount !== expectedLife.remortCount) {
          return null;
        }

        const updated = await tx.character.updateMany({
          where: {
            id: character.id,
            ...(input.expected
              ? {
                  hpCurrent: input.expected.hpCurrent,
                  manaCurrent: input.expected.manaCurrent,
                  ...(input.expected.hpRegenAt === undefined
                    ? {}
                    : { hpRegenAt: input.expected.hpRegenAt }),
                  ...(input.expected.manaRegenAt === undefined
                    ? {}
                    : { manaRegenAt: input.expected.manaRegenAt })
                }
              : {})
          },
          data: {
            hpCurrent: data.hpCurrent,
            manaCurrent: data.manaCurrent,
            hpRegenAt: input.hpRegenAt,
            manaRegenAt: input.manaRegenAt
          }
        });

        if (updated.count !== 1) {
          return null;
        }

        await this.recordResourceRecovery(tx, character.id, input, data.hpCurrent);

        const record = await tx.character.findUnique({
          where: {
            id: character.id
          },
          include: {
            ...this.characterRecordInclude
          }
        });

        return record ? toCharacterRecord(record) : null;
      });
    }

    if (input.expected) {
      if (!shouldRecordFullRecovery) {
        const updated = await this.prisma.character.updateMany({
          where: {
            user: { telegramUserId },
            hpCurrent: input.expected.hpCurrent,
            manaCurrent: input.expected.manaCurrent,
            ...(input.expected.hpRegenAt === undefined ? {} : { hpRegenAt: input.expected.hpRegenAt }),
            ...(input.expected.manaRegenAt === undefined
              ? {}
              : { manaRegenAt: input.expected.manaRegenAt })
          },
          data: {
            hpCurrent: data.hpCurrent,
            manaCurrent: data.manaCurrent,
            hpRegenAt: input.hpRegenAt,
            manaRegenAt: input.manaRegenAt
          }
        });
        return updated.count > 0 ? this.findByTelegramUserId(telegramUserId) : null;
      }

      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.character.updateMany({
          where: {
            id: character.id,
            hpCurrent: input.expected!.hpCurrent,
            manaCurrent: input.expected!.manaCurrent,
            ...(input.expected!.hpRegenAt === undefined ? {} : { hpRegenAt: input.expected!.hpRegenAt }),
            ...(input.expected!.manaRegenAt === undefined
              ? {}
              : { manaRegenAt: input.expected!.manaRegenAt })
          },
          data: {
            hpCurrent: data.hpCurrent,
            manaCurrent: data.manaCurrent,
            hpRegenAt: input.hpRegenAt,
            manaRegenAt: input.manaRegenAt
          }
        });
        if (updated.count !== 1) {
          return null;
        }
        await this.recordResourceRecovery(tx, character.id, input, data.hpCurrent);
        const record = await tx.character.findUnique({
          where: { id: character.id },
          include: { ...this.characterRecordInclude }
        });
        return record ? toCharacterRecord(record) : null;
      });
    }

    if (!shouldRecordFullRecovery) {
      const updated = await this.prisma.character.update({
        where: { id: character.id },
        data: {
          hpCurrent: data.hpCurrent,
          manaCurrent: data.manaCurrent,
          hpRegenAt: input.hpRegenAt,
          manaRegenAt: input.manaRegenAt
        },
        include: { ...this.characterRecordInclude }
      });
      return toCharacterRecord(updated);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.character.update({
        where: { id: character.id },
        data: {
          hpCurrent: data.hpCurrent,
          manaCurrent: data.manaCurrent,
          hpRegenAt: input.hpRegenAt,
          manaRegenAt: input.manaRegenAt
        },
        include: { ...this.characterRecordInclude }
      });
      await this.recordResourceRecovery(tx, character.id, input, data.hpCurrent);
      return toCharacterRecord(updated);
    });
  }

  private async recordResourceRecovery(
    tx: Prisma.TransactionClient,
    characterId: string,
    input: UpdateCharacterResourcesInput,
    hpCurrent: number
  ): Promise<void> {
    if (input.hpMax !== undefined && hpCurrent >= input.hpMax) {
      await this.hpRecoveryProducer.record(tx, characterId, input.hpRegenAt, "suppress", {
        errorCode: "lazy-sync-full"
      });
    }
  }

  async createForTelegramUserIfMissing(
    userInput: TelegramUserProfile,
    input: CreateCharacterInput
  ): Promise<CreateCharacterResult> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: {
          telegramUserId: userInput.telegramUserId
        },
        create: {
          telegramUserId: userInput.telegramUserId,
          username: userInput.username ?? null,
          displayName: userInput.displayName ?? null,
          languageCode: userInput.languageCode ?? null
        },
        update: {
          username: userInput.username ?? null,
          displayName: userInput.displayName ?? null,
          languageCode: userInput.languageCode ?? null
        }
      });

      const existing = await tx.character.findUnique({
        where: {
          userId: user.id
        },
        include: this.characterRecordInclude
      });

      if (existing) {
        return {
          character: toCharacterRecord(existing),
          created: false
        };
      }

      const referralAttribution = await tx.referralAttribution.findUnique({
        where: { inviteeUserId: user.id },
        select: {
          id: true,
          inviterUserId: true,
          status: true,
          arrivedAt: true,
          inviteCode: { select: { inviterNameSnapshot: true } }
        }
      });
      if (referralAttribution?.status === "PENDING") {
        throw new PendingReferralConsentError();
      }

      const arrivedAt = new Date();
      const raceName = findRace(input.raceId)?.name ?? input.raceId;
      const className = findClass(input.classId)?.name ?? input.classId;
      const title = getComboTitle(
        input.raceId,
        input.classId,
        isPronoun(input.pronoun) ? input.pronoun : "they"
      );
      const character = await tx.character.create({
        data: {
          userId: user.id,
          name: input.name,
          pronoun: input.pronoun,
          path: input.path,
          raceId: input.raceId,
          classId: input.classId,
          level: input.level,
          xp: input.xp,
          gold: input.gold,
          hpCurrent: input.hpCurrent,
          hpMax: input.hpMax,
          manaCurrent: input.manaCurrent,
          manaMax: input.manaMax,
          statsJson: input.statsJson as Prisma.InputJsonValue
        }
      });

      let referralArrival: CreateCharacterResult["referralArrival"];
      if (
        referralAttribution?.status === "ACCEPTED" &&
        referralAttribution.arrivedAt === null
      ) {
        const inviteeNameSnapshot = sanitizeReferralName(input.name);
        const arrived = await tx.referralAttribution.updateMany({
          where: {
            id: referralAttribution.id,
            status: "ACCEPTED",
            arrivedAt: null
          },
          data: {
            arrivedAt,
            arrivedCharacterId: character.id,
            inviteeNameSnapshot
          }
        });
        if (arrived.count === 1) {
          await tx.referralNotificationOutbox.create({
            data: {
              logicalKey: `REFERRAL_JOINED:${referralAttribution.id}`,
              kind: "REFERRAL_JOINED",
              recipientUserId: referralAttribution.inviterUserId,
              payloadJson: {
                attributionId: referralAttribution.id,
                inviteeName: inviteeNameSnapshot,
                raceName,
                className,
                title
              },
              state: "PENDING",
              nextAttemptAt: arrivedAt
            }
          });
          referralArrival = {
            attributionId: referralAttribution.id,
            inviterUserId: referralAttribution.inviterUserId,
            inviterNameSnapshot: referralAttribution.inviteCode.inviterNameSnapshot,
            inviteeNameSnapshot,
            arrivedAt
          };
        }
      }

      await tx.referralReward.updateMany({
        where: { beneficiaryUserId: user.id, state: "PENDING" },
        data: { nextAttemptAt: arrivedAt }
      });

      return {
        character: { ...character, currentLocationId: user.lastSeenLocationId, remortCount: 0 },
        created: true,
        ...(referralArrival ? { referralArrival } : {})
      };
    });
  }

  async spendGoldForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<SpendGoldForTelegramUserResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        include: {
          ...this.characterRecordInclude
        }
      });

      if (!character) {
        return null;
      }

      if (character.gold < amount) {
        return {
          state: "insufficient",
          character: toCharacterRecord(character)
        };
      }

      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          gold: {
            decrement: amount
          }
        },
        include: {
          ...this.characterRecordInclude
        }
      });

      return {
        state: "spent",
        character: toCharacterRecord(updated)
      };
    });
  }
}

async function countActiveGroupCombats(
  tx: Prisma.TransactionClient,
  characterId: string
): Promise<number> {
  try {
    return await tx.groupCombatSession.count({
      where: {
        status: "active",
        participants: { some: { characterId } }
      }
    });
  } catch (error) {
    if (isPrismaSchemaCompatibilityError(error, "GroupCombatSession", ["P2021"])) {
      return 0;
    }
    throw error;
  }
}

async function hasAuthoritativePartyParticipation(
  tx: Prisma.TransactionClient,
  characterId: string,
  now: Date
): Promise<boolean> {
  const where = {
    status: { in: ["recruiting", "active"] },
    OR: [
      { leaderCharacterId: characterId },
      { participants: { some: { characterId, status: "joined" } } }
    ]
  } satisfies Prisma.PartySessionWhereInput;
  try {
    const sessions = await tx.partySession.findMany({
      where,
      select: { status: true, expiresAt: true, originLocationId: true, originKind: true }
    });
    return sessions.some((session) => isAuthoritativeLivePartySession(session, now));
  } catch (error) {
    if (isPrismaSchemaCompatibilityError(error, "PartySession", ["P2021"])) {
      return false;
    }
    if (!isPrismaSchemaCompatibilityError(error, "PartySession", ["P2022"])) {
      throw error;
    }
    const sessions = await tx.partySession.findMany({
      where,
      select: { status: true, expiresAt: true, originLocationId: true }
    });
    return sessions.some((session) => isAuthoritativeLivePartySession({ ...session, originKind: null }, now));
  }
}

function isPrismaSchemaCompatibilityError(
  error: unknown,
  modelName: string,
  codes: readonly string[]
): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code) &&
    "meta" in error &&
    typeof error.meta === "object" &&
    error.meta !== null &&
    "modelName" in error.meta &&
    error.meta.modelName === modelName;
}

async function reanchorTerminalPartyBossHistory(
  tx: Prisma.TransactionClient,
  characterId: string
): Promise<void> {
  const histories = await tx.partyBossSession.findMany({
    where: {
      leaderCharacterId: characterId,
      status: { in: ["won", "lost", "cancelled"] }
    },
    select: {
      id: true,
      partySessionId: true,
      partySession: {
        select: {
          participants: {
            where: {
              status: "joined",
              characterId: { not: characterId }
            },
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
            take: 1,
            select: { characterId: true }
          }
        }
      }
    }
  });

  for (const history of histories) {
    const survivorId = history.partySession.participants[0]?.characterId;
    if (!survivorId) {
      continue;
    }
    await tx.partyBossSession.updateMany({
      where: { id: history.id, leaderCharacterId: characterId, status: { not: "active" } },
      data: { leaderCharacterId: survivorId }
    });
    await tx.partySession.updateMany({
      where: { id: history.partySessionId, leaderCharacterId: characterId },
      data: { leaderCharacterId: survivorId }
    });
  }
}

function buildCharacterRecordInclude(guildIdentityEnabled: boolean) {
  return {
    user: {
      select: {
        telegramUserId: true,
        lastSeenLocationId: true,
        ...(guildIdentityEnabled
          ? {
              guildMemberships: {
                where: { leftAt: null, activeUserKey: { not: null } },
                select: {
                  leftAt: true,
                  activeUserKey: true,
                  guild: {
                    select: {
                      crest: true,
                      status: true,
                      charterExpiresAt: true,
                      disbandedAt: true
                    }
                  }
                },
                take: 1
              }
            }
          : {})
      }
    },
    _count: {
      select: {
        remorts: true
      }
    }
  } satisfies Prisma.CharacterInclude;
}

function toCharacterRecord(
  character: Character & {
    user: {
      telegramUserId: bigint;
      lastSeenLocationId: string | null;
      guildMemberships?: Array<{
        leftAt: Date | null;
        activeUserKey: string | null;
        guild?: {
          crest: string;
          status: string;
          charterExpiresAt: Date;
          disbandedAt: Date | null;
        };
      }>;
    };
    _count?: { remorts?: number };
  }
): CharacterRecord {
  const { user, ...record } = character;
  delete (record as { _count?: unknown })._count;
  const guildCrest = readLiveGuildCrest(user.guildMemberships, new Date());

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId,
    ...(guildCrest ? { guildCrest } : {}),
    remortCount: getIncludedRemortCount(character)
  };
}

function normalizeCharacterResourceUpdate(
  character: CharacterRecord,
  input: UpdateCharacterResourcesInput
): { hpCurrent: number; manaCurrent: number } {
  return {
    hpCurrent: clampResourceValue(input.hpCurrent, input.hpMax ?? character.hpMax),
    manaCurrent: clampResourceValue(input.manaCurrent, input.manaMax ?? character.manaMax)
  };
}

function clampResourceValue(current: number, max: number): number {
  const normalizedMax = Math.max(0, Math.floor(max));
  return Math.min(normalizedMax, Math.max(0, Math.floor(current)));
}
