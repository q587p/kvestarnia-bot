import { Prisma, type Character, type CharacterEquipment, type PrismaClient } from "@prisma/client";
import type {
  DuelChallengeRecord,
  DuelChallengeRepository,
  DuelChallengeStatus,
  DuelCharacterSnapshot,
  DuelResultPayload
} from "./duelChallengeRepository";
import type { CharacterEquipmentRecord } from "./equipmentRepository";
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

  async findByToken(inviteToken: string): Promise<DuelChallengeRecord | null> {
    return mapChallenge(await findChallengeByToken(this.prisma, inviteToken));
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
        targetCharacterId: null
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

  return {
    outcome,
    winnerCharacterId: typeof value.winnerCharacterId === "string" ? value.winnerCharacterId : null,
    loserCharacterId: typeof value.loserCharacterId === "string" ? value.loserCharacterId : null,
    challengerScore: intOrZero(value.challengerScore),
    targetScore: intOrZero(value.targetScore),
    swing: intOrZero(value.swing),
    flavorKey: typeof value.flavorKey === "string" ? value.flavorKey : "direct-hit"
  };
}

function intOrZero(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
