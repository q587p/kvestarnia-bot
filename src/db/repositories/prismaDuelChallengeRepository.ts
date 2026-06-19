import { Prisma, type Character, type CharacterEquipment, type PrismaClient } from "@prisma/client";
import type {
  DuelChallengeRecord,
  DuelChallengeRepository,
  DuelChallengeStatus,
  DuelCharacterSnapshot,
  DuelResultBalanceAudit,
  DuelResultParticipantSnapshot,
  DuelResultProgressionBudget,
  DuelResultPayload,
  ResolvedDuelChallengeRecord
} from "./duelChallengeRepository";
import type { CharacterEquipmentRecord } from "./equipmentRepository";
import type { CharacterStats, StatKey } from "../../domain/characters/starterStats";
import { getIncludedRemortCount } from "./prismaRemortCount";

type DuelChallengeWithCharacters = Awaited<ReturnType<typeof findChallengeByToken>>;

export class PrismaDuelChallengeRepository implements DuelChallengeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createOpenForTelegramUser(
    telegramUserId: bigint,
    input: {
      inviteToken: string;
      contextChatId?: bigint | null;
      expiresAt: Date;
    }
  ): Promise<DuelChallengeRecord | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!character) {
      return null;
    }

    const challenge = await this.prisma.duelChallenge.create({
      data: {
        challengerCharacterId: character.id,
        contextChatId: input.contextChatId ?? null,
        inviteToken: input.inviteToken,
        expiresAt: input.expiresAt
      }
    });

    return this.findByToken(challenge.inviteToken);
  }

  async createTargetedForTelegramUser(
    telegramUserId: bigint,
    targetCharacterId: string,
    input: {
      inviteToken: string;
      contextChatId?: bigint | null;
      expiresAt: Date;
    }
  ): Promise<DuelChallengeRecord | null> {
    const [challenger, target] = await Promise.all([
      this.prisma.character.findFirst({
        where: {
          user: {
            telegramUserId
          }
        },
        select: {
          id: true
        }
      }),
      this.prisma.character.findUnique({
        where: {
          id: targetCharacterId
        },
        select: {
          id: true
        }
      })
    ]);

    if (!challenger || !target || challenger.id === target.id) {
      return null;
    }

    const challenge = await this.prisma.duelChallenge.create({
      data: {
        challengerCharacterId: challenger.id,
        targetCharacterId: target.id,
        contextChatId: input.contextChatId ?? null,
        inviteToken: input.inviteToken,
        expiresAt: input.expiresAt
      }
    });

    return this.findByToken(challenge.inviteToken);
  }

  async findByToken(inviteToken: string): Promise<DuelChallengeRecord | null> {
    return mapChallenge(await findChallengeByToken(this.prisma, inviteToken));
  }

  async listResolvedSince(since: Date): Promise<ResolvedDuelChallengeRecord[]> {
    const records = await this.prisma.duelChallenge.findMany({
      where: {
        status: "resolved",
        resolvedAt: {
          gte: since
        },
        resultJson: {
          not: Prisma.JsonNull
        },
        targetCharacterId: {
          not: null
        }
      },
      include: {
        challenger: characterInclude,
        target: characterInclude
      },
      orderBy: {
        resolvedAt: "desc"
      }
    });

    return records.map(mapChallenge).filter(isResolvedDuelChallengeRecord);
  }

  async countResolvedBetweenCharacterPairSince(
    characterAId: string,
    characterBId: string,
    since: Date
  ): Promise<number> {
    return this.prisma.duelChallenge.count({
      where: {
        status: "resolved",
        resolvedAt: {
          gte: since
        },
        resultJson: {
          not: Prisma.JsonNull
        },
        OR: [
          {
            challengerCharacterId: characterAId,
            targetCharacterId: characterBId
          },
          {
            challengerCharacterId: characterBId,
            targetCharacterId: characterAId
          }
        ]
      }
    });
  }

  async findCharacterByTelegramUser(telegramUserId: bigint): Promise<DuelCharacterSnapshot | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      ...characterInclude
    });

    return character ? mapCharacter(character) : null;
  }

  async markExpiredByToken(inviteToken: string, now: Date): Promise<DuelChallengeRecord | null> {
    await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        expiresAt: {
          lte: now
        }
      },
      data: {
        status: "expired"
      }
    });

    return this.findByToken(inviteToken);
  }

  async cancelByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<DuelChallengeRecord | null> {
    await this.expireIfNeeded(inviteToken, now);
    await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        challenger: {
          user: {
            telegramUserId
          }
        }
      },
      data: {
        status: "cancelled"
      }
    });

    return this.findByToken(inviteToken);
  }

  async declineByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date
  ): Promise<DuelChallengeRecord | null> {
    await this.expireIfNeeded(inviteToken, now);
    await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        target: {
          user: {
            telegramUserId
          }
        }
      },
      data: {
        status: "declined"
      }
    });

    return this.findByToken(inviteToken);
  }

  async acceptByTokenForTelegramUser(
    inviteToken: string,
    telegramUserId: bigint,
    now: Date,
    result: DuelResultPayload
  ): Promise<DuelChallengeRecord | null> {
    await this.expireIfNeeded(inviteToken, now);

    const target = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!target) {
      return null;
    }

    await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        expiresAt: {
          gt: now
        },
        challengerCharacterId: {
          not: target.id
        },
        OR: [
          {
            targetCharacterId: null
          },
          {
            targetCharacterId: target.id
          }
        ]
      },
      data: {
        targetCharacterId: target.id,
        status: "resolved",
        resolvedAt: now,
        resultJson: result as unknown as Prisma.InputJsonValue
      }
    });

    return this.findByToken(inviteToken);
  }

  private async expireIfNeeded(inviteToken: string, now: Date): Promise<void> {
    await this.prisma.duelChallenge.updateMany({
      where: {
        inviteToken,
        status: "pending",
        expiresAt: {
          lte: now
        }
      },
      data: {
        status: "expired"
      }
    });
  }
}

async function findChallengeByToken(prisma: PrismaClient, inviteToken: string) {
  return prisma.duelChallenge.findUnique({
    where: {
      inviteToken
    },
    include: {
      challenger: characterInclude,
      target: characterInclude
    }
  });
}

const characterInclude = {
  include: {
    user: {
      select: {
        lastSeenLocationId: true,
        telegramUserId: true
      }
    },
    equipment: true,
    _count: {
      select: {
        remorts: true
      }
    }
  }
} satisfies Prisma.CharacterDefaultArgs;

function mapChallenge(record: DuelChallengeWithCharacters): DuelChallengeRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    challengerCharacterId: record.challengerCharacterId,
    targetCharacterId: record.targetCharacterId,
    contextChatId: record.contextChatId,
    inviteToken: record.inviteToken,
    status: parseStatus(record.status),
    expiresAt: record.expiresAt,
    resolvedAt: record.resolvedAt,
    result: parseResult(record.resultJson),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    challenger: mapCharacter(record.challenger),
    target: record.target ? mapCharacter(record.target) : null
  };
}

function isResolvedDuelChallengeRecord(
  record: DuelChallengeRecord | null
): record is ResolvedDuelChallengeRecord {
  return (
    record?.status === "resolved" &&
    record.resolvedAt !== null &&
    record.result !== null &&
    record.target !== null
  );
}

function mapCharacter(
  record: Character & {
    user: { lastSeenLocationId: string | null; telegramUserId: bigint };
    equipment: CharacterEquipment[];
    _count?: { remorts?: number };
  }
): DuelCharacterSnapshot {
  const { user, equipment, ...character } = record;
  delete (character as { _count?: unknown })._count;

  return {
    ...character,
    telegramUserId: user.telegramUserId,
    currentLocationId: user.lastSeenLocationId,
    remortCount: getIncludedRemortCount(record),
    equipment: equipment.map(mapEquipment)
  };
}

function mapEquipment(record: CharacterEquipment): CharacterEquipmentRecord {
  return {
    id: record.id,
    characterId: record.characterId,
    slot: record.slot as CharacterEquipmentRecord["slot"],
    itemId: record.itemId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function parseStatus(status: string): DuelChallengeStatus {
  return status === "pending" ||
    status === "declined" ||
    status === "expired" ||
    status === "resolved" ||
    status === "cancelled"
    ? status
    : "expired";
}

function parseResult(value: unknown): DuelResultPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const outcome = value.outcome;

  if (outcome !== "challenger" && outcome !== "target" && outcome !== "draw") {
    return null;
  }

  const participants = parseParticipants(value.participants);
  const audit = parseAudit(value.audit);
  const result: DuelResultPayload = {
    outcome,
    winnerCharacterId: typeof value.winnerCharacterId === "string" ? value.winnerCharacterId : null,
    loserCharacterId: typeof value.loserCharacterId === "string" ? value.loserCharacterId : null,
    challengerScore: intOrZero(value.challengerScore),
    targetScore: intOrZero(value.targetScore),
    swing: intOrZero(value.swing),
    flavorKey: typeof value.flavorKey === "string" ? value.flavorKey : "direct-hit",
    ...(typeof value.balanceVersion === "string" ? { balanceVersion: value.balanceVersion } : {})
  };

  if (participants) {
    result.participants = participants;
  }

  if (audit) {
    result.audit = audit;
  }

  return result;
}

function parseParticipants(value: unknown): DuelResultPayload["participants"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const challenger = parseParticipant(value.challenger);
  const target = parseParticipant(value.target);

  return challenger && target ? { challenger, target } : null;
}

function parseParticipant(value: unknown): DuelResultParticipantSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const characterId = stringOrNull(value.characterId);
  const displayName = stringOrNull(value.displayName);
  const title = stringOrNull(value.title);
  const raceId = stringOrNull(value.raceId);
  const raceName = stringOrNull(value.raceName);
  const classId = stringOrNull(value.classId);
  const className = stringOrNull(value.className);

  if (!characterId || !displayName || !title || !raceId || !raceName || !classId || !className) {
    return null;
  }

  return {
    characterId,
    displayName,
    title,
    raceId,
    raceName,
    classId,
    className,
    level: Math.max(1, intOrZero(value.level)),
    remortCount: Math.max(0, intOrZero(value.remortCount))
  };
}

function parseAudit(value: unknown): DuelResultPayload["audit"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const challenger = parseBalanceAudit(value.challenger);
  const target = parseBalanceAudit(value.target);

  return challenger && target ? { challenger, target } : null;
}

function parseBalanceAudit(value: unknown): DuelResultBalanceAudit | null {
  if (!isRecord(value) || typeof value.balanceVersion !== "string") {
    return null;
  }

  const progressionBudget = parseProgressionBudget(value.progressionBudget);
  const targetProgressionBudget = parseProgressionBudget(value.targetProgressionBudget);

  if (!progressionBudget || !targetProgressionBudget) {
    return null;
  }

  return {
    balanceVersion: value.balanceVersion,
    originalLevel: intOrZero(value.originalLevel),
    originalRemortCount: intOrZero(value.originalRemortCount),
    progressionBudget,
    targetProgressionBudget,
    temporaryHpMax: intOrZero(value.temporaryHpMax),
    temporaryManaMax: intOrZero(value.temporaryManaMax),
    temporaryStats: parseStats(value.temporaryStats) ?? parseLegacyPrimaryStat(
      value.primaryStat,
      value.temporaryPrimaryStat
    ),
    readinessPenalty: intOrZero(value.readinessPenalty),
    preparedScore: intOrZero(value.preparedScore)
  };
}

function parseProgressionBudget(value: unknown): DuelResultProgressionBudget | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    level: Math.max(1, intOrZero(value.level)),
    remortCount: Math.max(0, intOrZero(value.remortCount)),
    hpMax: intOrZero(value.hpMax),
    manaMax: intOrZero(value.manaMax),
    stats: parseStats(value.stats) ?? parseLegacyPrimaryStat(value.primaryStat, value.primaryStat),
    score: intOrZero(value.score)
  };
}

function parseStats(value: unknown): CharacterStats | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    strength: intOrZero(value.strength),
    dexterity: intOrZero(value.dexterity),
    intelligence: intOrZero(value.intelligence),
    charisma: intOrZero(value.charisma),
    luck: intOrZero(value.luck)
  };
}

function parseLegacyPrimaryStat(stat: unknown, bonus: unknown): CharacterStats {
  const stats = createEmptyStats();

  if (typeof stat === "string" && isStatKey(stat)) {
    stats[stat] = intOrZero(bonus);
  }

  return stats;
}

function isStatKey(value: string): value is StatKey {
  return (
    value === "strength" ||
    value === "dexterity" ||
    value === "intelligence" ||
    value === "charisma" ||
    value === "luck"
  );
}

function createEmptyStats(): CharacterStats {
  return {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    charisma: 0,
    luck: 0
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function intOrZero(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
