import { Prisma, type PrismaClient } from "@prisma/client";
import type { CombatState, CombatStatus, CombatTurnSummary } from "../../domain/combat";
import type {
  CreateSoloCombatSessionInput,
  RecordSoloCombatRewardInput,
  SoloCombatSessionRecord,
  SoloCombatSessionRepository,
  SoloCombatSessionStatus,
  UpdateSoloCombatSessionInput
} from "./soloCombatSessionRepository";

type PrismaSoloCombatSessionRecord = Awaited<
  ReturnType<PrismaClient["soloCombatSession"]["findFirst"]>
>;

const terminalStatuses = new Set<CombatStatus>(["won", "lost", "fled", "expired"]);

export class PrismaSoloCombatSessionRepository implements SoloCombatSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveByTelegramUserId(
    telegramUserId: bigint
  ): Promise<SoloCombatSessionRecord | null> {
    const record = await this.prisma.soloCombatSession.findFirst({
      where: {
        status: "active",
        character: {
          user: {
            telegramUserId
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    return mapRecord(record);
  }

  async countWonByTelegramUserId(
    telegramUserId: bigint,
    options: { excludeMonsterIds?: readonly string[]; since?: Date } = {}
  ): Promise<number> {
    return this.prisma.soloCombatSession.count({
      where: {
        status: "won",
        ...(options.since ? { createdAt: { gt: options.since } } : {}),
        ...(options.excludeMonsterIds && options.excludeMonsterIds.length > 0
          ? { monsterId: { notIn: [...options.excludeMonsterIds] } }
          : {}),
        character: {
          user: {
            telegramUserId
          }
        }
      }
    });
  }

  async listByTelegramUserIdSince(
    telegramUserId: bigint,
    since: Date
  ): Promise<Array<Pick<SoloCombatSessionRecord, "monsterId" | "status" | "createdAt" | "state">>> {
    const records = await this.prisma.soloCombatSession.findMany({
      where: {
        createdAt: {
          gte: since
        },
        character: {
          user: {
            telegramUserId
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        monsterId: true,
        status: true,
        stateJson: true,
        createdAt: true
      }
    });

    return records.map((record) => ({
      monsterId: record.monsterId,
      status: parseStatus(record.status),
      state: parseCombatState(record.stateJson),
      createdAt: record.createdAt
    }));
  }

  async findByIdForTelegramUserId(
    telegramUserId: bigint,
    sessionId: string
  ): Promise<SoloCombatSessionRecord | null> {
    const record = await this.prisma.soloCombatSession.findFirst({
      where: {
        id: sessionId,
        character: {
          user: {
            telegramUserId
          }
        }
      }
    });

    return mapRecord(record);
  }

  async createForTelegramUser(
    telegramUserId: bigint,
    input: CreateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
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

    const record = await this.prisma.soloCombatSession.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        characterId: character.id,
        monsterId: input.monsterId,
        stateJson: input.state as unknown as Prisma.InputJsonValue,
        status: input.state.status,
        turn: input.state.turn,
        expiresAt: input.expiresAt
      }
    }).catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return null;
      }

      throw error;
    });

    return record ? mapRecord(record) : this.findActiveByTelegramUserId(telegramUserId);
  }

  async markStatusById(
    sessionId: string,
    status: SoloCombatSessionStatus
  ): Promise<SoloCombatSessionRecord | null> {
    const record = await this.prisma.soloCombatSession.update({
      where: {
        id: sessionId
      },
      data: {
        status
      }
    }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) {
        return null;
      }

      throw error;
    });

    return mapRecord(record);
  }

  async updateById(
    sessionId: string,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const record = await this.prisma.soloCombatSession.update({
      where: {
        id: sessionId
      },
      data: {
        stateJson: input.state as unknown as Prisma.InputJsonValue,
        status: input.status,
        turn: input.state.turn,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
      }
    }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) {
        return null;
      }

      throw error;
    });

    return mapRecord(record);
  }

  async updateByIdIfActiveTurn(
    sessionId: string,
    expectedTurn: number,
    input: UpdateSoloCombatSessionInput
  ): Promise<SoloCombatSessionRecord | null> {
    const record = await this.prisma.$transaction(async (tx) => {
      const result = await tx.soloCombatSession.updateMany({
        where: {
          id: sessionId,
          status: "active",
          turn: expectedTurn
        },
        data: {
          stateJson: input.state as unknown as Prisma.InputJsonValue,
          status: input.status,
          turn: input.state.turn,
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
        }
      });

      if (result.count !== 1) {
        return null;
      }

      return tx.soloCombatSession.findUnique({
        where: {
          id: sessionId
        }
      });
    });

    return mapRecord(record);
  }

  async recordRewardById(
    sessionId: string,
    input: RecordSoloCombatRewardInput
  ): Promise<SoloCombatSessionRecord | null> {
    const record = await this.prisma.soloCombatSession.update({
      where: {
        id: sessionId
      },
      data: {
        rewardXp: input.rewardXp,
        rewardGold: input.rewardGold,
        rewardItemsJson: input.itemGrants,
        rewardClaimedAt: input.claimedAt
      }
    }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) {
        return null;
      }

      throw error;
    });

    return mapRecord(record);
  }
}

function mapRecord(record: PrismaSoloCombatSessionRecord): SoloCombatSessionRecord | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    characterId: record.characterId,
    monsterId: record.monsterId,
    status: parseStatus(record.status),
    turn: record.turn,
    state: parseCombatState(record.stateJson),
    reward: parseReward(record),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt
  };
}

function parseReward(record: NonNullable<PrismaSoloCombatSessionRecord>): SoloCombatSessionRecord["reward"] {
  if (
    record.rewardXp === null ||
    record.rewardGold === null ||
    record.rewardClaimedAt === null
  ) {
    return null;
  }

  return {
    xp: record.rewardXp,
    gold: record.rewardGold,
    itemGrants: parseItemGrants(record.rewardItemsJson),
    claimedAt: record.rewardClaimedAt
  };
}

function parseItemGrants(value: unknown): Array<{ itemId: string; quantity: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      return [];
    }

    const quantity = intOrNull(entry.quantity);

    return quantity === null || quantity <= 0 ? [] : [{ itemId: entry.itemId, quantity }];
  });
}

function parseStatus(value: string): SoloCombatSessionStatus {
  return value === "active" || terminalStatuses.has(value as CombatStatus)
    ? (value as SoloCombatSessionStatus)
    : "expired";
}

function parseCombatState(value: unknown): CombatState | null {
  if (!isRecord(value)) {
    return null;
  }

  const turn = intOrNull(value.turn);
  const status = parseStateStatus(value.status);
  const source = parseCombatSource(value.source);
  const hero = parseResourceBlock(value.hero);
  const monster = parseMonsterBlock(value.monster);

  if (turn === null || !status || !hero || !monster) {
    return null;
  }

  const cooldowns = parseCooldowns(value.cooldowns);

  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(source ? { source } : {}),
    turn,
    status,
    hero,
    monster,
    ...(cooldowns ? { cooldowns } : {}),
    ...(isTurnSummary(value.lastTurn) ? { lastTurn: value.lastTurn } : {})
  };
}

function parseCombatSource(value: unknown): CombatState["source"] | null {
  if (value === "normal" || value === "yeger" || value === "adventure" || value === "training") {
    return value;
  }

  return null;
}

function parseCooldowns(value: unknown): CombatState["cooldowns"] | null {
  if (!isRecord(value) || !isRecord(value.skill)) {
    return null;
  }

  const remainingTurns = intOrNull(value.skill.remainingTurns);

  if (typeof value.skill.id !== "string" || remainingTurns === null || remainingTurns <= 0) {
    return null;
  }

  return {
    skill: {
      id: value.skill.id,
      remainingTurns
    }
  };
}

function parseResourceBlock(value: unknown): CombatState["hero"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const hp = intOrNull(value.hp);
  const hpMax = intOrNull(value.hpMax);
  const mana = intOrNull(value.mana);
  const manaMax = intOrNull(value.manaMax);

  return hp === null || hpMax === null || mana === null || manaMax === null
    ? null
    : { hp, hpMax, mana, manaMax };
}

function parseMonsterBlock(value: unknown): CombatState["monster"] | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const hp = intOrNull(value.hp);
  const hpMax = intOrNull(value.hpMax);

  return hp === null || hpMax === null ? null : { id: value.id, hp, hpMax };
}

function parseStateStatus(value: unknown): CombatStatus | null {
  return value === "active" || terminalStatuses.has(value as CombatStatus)
    ? (value as CombatStatus)
    : null;
}

function isTurnSummary(value: unknown): value is CombatTurnSummary {
  return (
    isRecord(value) &&
    (value.action === "attack" || value.action === "skill" || value.action === "flee") &&
    typeof value.heroOutcome === "string" &&
    typeof value.heroDamage === "number" &&
    typeof value.monsterDamage === "number" &&
    typeof value.manaSpent === "number" &&
    typeof value.critical === "boolean"
  );
}

function intOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
