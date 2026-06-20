import { Prisma, type PrismaClient } from "@prisma/client";
import type { CombatState, CombatStatus, CombatTurnSummary } from "../../domain/combat";
import type {
  CreateSoloCombatSessionInput,
  DueSoloCombatSessionRecord,
  RecordSoloCombatRewardInput,
  SoloCombatSessionCompletionRecord,
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

  async listDueActiveSessions(
    now: Date,
    options: { limit?: number } = {}
  ): Promise<DueSoloCombatSessionRecord[]> {
    const records = await this.prisma.soloCombatSession.findMany({
      where: {
        status: "active"
      },
      include: {
        character: {
          select: {
            user: {
              select: {
                telegramUserId: true
              }
            }
          }
        }
      },
      orderBy: {
        updatedAt: "asc"
      },
      take: Math.max(options.limit ?? 20, 100)
    });

    return records.flatMap((record) => {
      const mapped = mapRecord(record);

      if (!mapped?.state?.turnExpiresAt || Date.parse(mapped.state.turnExpiresAt) > now.getTime()) {
        return [];
      }

      return [{
        ...mapped,
        telegramUserId: record.character.user.telegramUserId
      }];
    }).slice(0, options.limit ?? 20);
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

  async listCompletedByTelegramUserIdSince(
    telegramUserId: bigint,
    since: Date
  ): Promise<SoloCombatSessionCompletionRecord[]> {
    const records = await this.prisma.soloCombatSession.findMany({
      where: {
        OR: [{ updatedAt: { gte: since } }, { createdAt: { gte: since } }],
        character: {
          user: {
            telegramUserId
          }
        }
      },
      orderBy: {
        updatedAt: "asc"
      },
      select: {
        monsterId: true,
        status: true,
        stateJson: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return records.flatMap((record) => {
      const status = parseStatus(record.status);
      const state = parseCombatState(record.stateJson);
      const completedAt = getSessionCompletionTime({
        status,
        state,
        createdAt: record.createdAt
      });

      if (!completedAt || completedAt < since) {
        return [];
      }

      return [{
        monsterId: record.monsterId,
        status,
        state,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        completedAt
      }];
    });
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
    const sessionId = input.id;
    const record = await this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
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

      const session = await tx.soloCombatSession.create({
        data: {
          ...(sessionId ? { id: sessionId } : {}),
          characterId: character.id,
          monsterId: input.monsterId,
          stateJson: input.state as unknown as Prisma.InputJsonValue,
          status: input.state.status,
          turn: input.state.turn,
          expiresAt: input.expiresAt
        }
      });

      await tx.activeCombatLease.create({
        data: {
          characterId: character.id,
          kind: "solo-combat",
          referenceId: session.id
        }
      });

      return session;
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
    if (!hasTransaction(this.prisma)) {
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

    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.soloCombatSession.update({
        where: {
          id: sessionId
        },
        data: {
          status
        }
      });

      if (status !== "active") {
        await tx.activeCombatLease.deleteMany({
          where: {
            referenceId: sessionId
          }
        });
      }

      return updated;
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
    if (!hasTransaction(this.prisma)) {
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

    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.soloCombatSession.update({
        where: {
          id: sessionId
        },
        data: {
          stateJson: input.state as unknown as Prisma.InputJsonValue,
          status: input.status,
          turn: input.state.turn,
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
        }
      });

      if (input.status !== "active") {
        await tx.activeCombatLease.deleteMany({
          where: {
            referenceId: sessionId
          }
        });
      }

      return updated;
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

      if (input.status !== "active") {
        await tx.activeCombatLease.deleteMany({
          where: {
            referenceId: sessionId
          }
        });
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
  const completedAt = parseIsoDate(value.completedAt);
  const turnExpiresAt = parseIsoDate(value.turnExpiresAt);

  if (turn === null || !status || !hero || !monster) {
    return null;
  }

  const cooldowns = parseCooldowns(value.cooldowns);

  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(source ? { source } : {}),
    ...(completedAt ? { completedAt: completedAt.toISOString() } : {}),
    ...(turnExpiresAt ? { turnExpiresAt: turnExpiresAt.toISOString() } : {}),
    ...(parseMessageReference(value.message) ? { message: parseMessageReference(value.message)! } : {}),
    turn,
    status,
    hero,
    monster,
    ...(cooldowns ? { cooldowns } : {}),
    ...(parseMonsterContextSnapshot(value.context) ? { context: parseMonsterContextSnapshot(value.context)! } : {}),
    ...(parseBarkState(value.barks) ? { barks: parseBarkState(value.barks)! } : {}),
    ...(isTurnSummary(value.lastTurn) ? { lastTurn: value.lastTurn } : {})
  };
}

function parseMessageReference(value: unknown): CombatState["message"] | null {
  if (!isRecord(value) || typeof value.chatId !== "string") {
    return null;
  }

  const messageId = intOrNull(value.messageId);

  return messageId === null || messageId <= 0
    ? null
    : { chatId: value.chatId, messageId };
}

function getSessionCompletionTime(input: {
  status: SoloCombatSessionStatus;
  state: CombatState | null;
  createdAt: Date;
}): Date | null {
  if (input.status === "active" || input.state?.status === "active") {
    return null;
  }

  return parseIsoDate(input.state?.completedAt) ?? input.createdAt;
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCombatSource(value: unknown): CombatState["source"] | null {
  if (value === "normal" || value === "yeger" || value === "adventure" || value === "training") {
    return value;
  }

  return null;
}

function parseCooldowns(value: unknown): CombatState["cooldowns"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const abilityEntries = isRecord(value.abilities)
    ? Object.entries(value.abilities).flatMap(([abilityId, entry]) => {
        if (!isRecord(entry) || typeof entry.id !== "string") {
          return [];
        }

        const remainingTurns = intOrNull(entry.remainingTurns);

        return remainingTurns === null || remainingTurns <= 0
          ? []
          : [[abilityId, { id: entry.id, remainingTurns }] as const];
      })
    : [];
  const skill = parseCooldown(value.skill);
  const abilities = Object.fromEntries([
    ...abilityEntries,
    ...(skill ? [[skill.id, skill] as const] : [])
  ]);

  if (Object.keys(abilities).length === 0) {
    return null;
  }

  return {
    abilities,
    ...(skill ? { skill } : {})
  };
}

function parseCooldown(value: unknown): { id: string; remainingTurns: number } | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const remainingTurns = intOrNull(value.remainingTurns);

  return remainingTurns === null || remainingTurns <= 0
    ? null
    : { id: value.id, remainingTurns };
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

  return hp === null || hpMax === null
    ? null
    : {
        id: value.id,
        ...(typeof value.name === "string" ? { name: value.name } : {}),
        ...(intOrNull(value.level) !== null ? { level: intOrNull(value.level)! } : {}),
        hp,
        hpMax,
        ...(intOrNull(value.attack) !== null ? { attack: intOrNull(value.attack)! } : {}),
        ...(intOrNull(value.armor) !== null ? { armor: intOrNull(value.armor)! } : {}),
        ...(intOrNull(value.resist) !== null ? { resist: intOrNull(value.resist)! } : {}),
        ...(intOrNull(value.dexterity) !== null ? { dexterity: intOrNull(value.dexterity)! } : {}),
        ...(typeof value.classId === "string" ? { classId: value.classId } : {}),
        ...(typeof value.className === "string" ? { className: value.className } : {}),
        ...(typeof value.raceId === "string" ? { raceId: value.raceId } : {}),
        ...(typeof value.raceName === "string" ? { raceName: value.raceName } : {}),
        ...(typeof value.title === "string" ? { title: value.title } : {}),
        ...(intOrNull(value.spellPower) !== null ? { spellPower: intOrNull(value.spellPower)! } : {}),
        ...(parseCombatContextModifiers(value.contextModifiers)
          ? { contextModifiers: parseCombatContextModifiers(value.contextModifiers)! }
          : {})
      };
}

function parseStateStatus(value: unknown): CombatStatus | null {
  return value === "active" || terminalStatuses.has(value as CombatStatus)
    ? (value as CombatStatus)
    : null;
}

function isTurnSummary(value: unknown): value is CombatTurnSummary {
  return (
    isRecord(value) &&
    (value.action === "attack" || value.action === "defend" || value.action === "skill" || value.action === "flee") &&
    typeof value.heroOutcome === "string" &&
    typeof value.heroDamage === "number" &&
    typeof value.monsterDamage === "number" &&
    typeof value.manaSpent === "number" &&
    typeof value.critical === "boolean"
  );
}

function parseMonsterContextSnapshot(value: unknown): CombatState["context"] | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.rulesVersion !== "string") {
    return null;
  }

  const world = parseCombatWorldContext(value.world);
  const effects = parseCombatContextModifiers(value.effects);

  if (typeof value.monsterId !== "string" || !world || !effects || !Array.isArray(value.traitIds)) {
    return null;
  }

  return {
    version: 1,
    rulesVersion: "monster-context-v1",
    monsterId: value.monsterId,
    traitIds: value.traitIds.filter((entry): entry is string => typeof entry === "string"),
    world,
    matchedBranches: Array.isArray(value.matchedBranches)
      ? value.matchedBranches.flatMap((entry) => {
          if (
            !isRecord(entry) ||
            typeof entry.traitId !== "string" ||
            typeof entry.branchId !== "string" ||
            typeof entry.tone !== "string"
          ) {
            return [];
          }

          return [{
            traitId: entry.traitId,
            branchId: entry.branchId,
            tone: entry.tone as NonNullable<CombatState["context"]>["matchedBranches"][number]["tone"]
          }];
        })
      : [],
    effects,
    ...(isRecord(value.cue) && typeof value.cue.id === "string" && typeof value.cue.text === "string" && typeof value.cue.tone === "string"
      ? {
          cue: {
            id: value.cue.id,
            text: value.cue.text,
            tone: value.cue.tone as NonNullable<NonNullable<CombatState["context"]>["cue"]>["tone"]
          }
        }
      : {})
  };
}

function parseCombatWorldContext(value: unknown): NonNullable<CombatState["context"]>["world"] | null {
  if (!isRecord(value) || value.version !== 1 || value.timezone !== "Europe/Kyiv") {
    return null;
  }

  if (
    typeof value.localStartedAt !== "string" ||
    typeof value.localDate !== "string" ||
    !isDayPhase(value.dayPhase) ||
    !isWeekKind(value.weekKind) ||
    !isSeason(value.season) ||
    !isMealWindow(value.mealWindow) ||
    !isMonthEdge(value.monthEdge) ||
    !isPartySizeBand(value.partySizeBand)
  ) {
    return null;
  }

  const calendarDay = intOrNull(value.calendarDay);

  if (calendarDay === null) {
    return null;
  }

  return {
    version: 1,
    timezone: "Europe/Kyiv",
    localStartedAt: value.localStartedAt,
    localDate: value.localDate,
    dayPhase: value.dayPhase,
    weekKind: value.weekKind,
    season: value.season,
    mealWindow: value.mealWindow,
    monthEdge: value.monthEdge,
    calendarDay,
    partySizeBand: value.partySizeBand,
    locationTags: Array.isArray(value.locationTags)
      ? value.locationTags.filter((entry): entry is string => typeof entry === "string")
      : []
  };
}

function parseCombatContextModifiers(value: unknown): CombatState["monster"]["contextModifiers"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const entries = [
    "outgoingDamageMultiplier",
    "incomingDamageMultiplier",
    "accuracyDeltaPp",
    "evasionDeltaPp",
    "abilityWeightDelta",
    "signatureCooldownDelta",
    "flatArmorDelta",
    "flatResistDelta",
    "flatDexterityDelta"
  ] as const;
  const parsed = Object.fromEntries(
    entries.map((key) => [key, typeof value[key] === "number" ? value[key] : null])
  ) as Record<(typeof entries)[number], number | null>;

  return entries.some((key) => parsed[key] === null)
    ? null
    : {
        outgoingDamageMultiplier: parsed.outgoingDamageMultiplier!,
        incomingDamageMultiplier: parsed.incomingDamageMultiplier!,
        accuracyDeltaPp: parsed.accuracyDeltaPp!,
        evasionDeltaPp: parsed.evasionDeltaPp!,
        abilityWeightDelta: parsed.abilityWeightDelta!,
        signatureCooldownDelta: parsed.signatureCooldownDelta!,
        flatArmorDelta: parsed.flatArmorDelta!,
        flatResistDelta: parsed.flatResistDelta!,
        flatDexterityDelta: parsed.flatDexterityDelta!
      };
}

function parseBarkState(value: unknown): CombatState["barks"] | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }

  return {
    version: 1,
    rulesVersion: "monster-barks-v1",
    audience: value.audience === "party" ? "party" : "solo",
    selectedEarlyBarkByMonsterId: parseStringRecord(value.selectedEarlyBarkByMonsterId),
    emittedBarkIds: Array.isArray(value.emittedBarkIds)
      ? value.emittedBarkIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    lastBarkOwnActionByMonsterId: parseNumberRecord(value.lastBarkOwnActionByMonsterId),
    encounterBarkCountByMonsterId: parseNumberRecord(value.encounterBarkCountByMonsterId),
    ownActionCountByMonsterId: parseNumberRecord(value.ownActionCountByMonsterId)
  };
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ? [[key, entry]] : []
    )
  );
}

function parseNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "number" && Number.isInteger(entry) ? [[key, entry]] : []
    )
  );
}

function isDayPhase(value: unknown): value is NonNullable<CombatState["context"]>["world"]["dayPhase"] {
  return value === "morning" || value === "day" || value === "evening" || value === "night";
}

function isWeekKind(value: unknown): value is NonNullable<CombatState["context"]>["world"]["weekKind"] {
  return value === "weekday" || value === "weekend";
}

function isSeason(value: unknown): value is NonNullable<CombatState["context"]>["world"]["season"] {
  return value === "winter" || value === "spring" || value === "summer" || value === "autumn";
}

function isMealWindow(value: unknown): value is NonNullable<CombatState["context"]>["world"]["mealWindow"] {
  return value === "lunch" || value === "dinner" || value === "none";
}

function isMonthEdge(value: unknown): value is NonNullable<CombatState["context"]>["world"]["monthEdge"] {
  return value === "first-three-days" || value === "last-three-days" || value === "middle";
}

function isPartySizeBand(value: unknown): value is NonNullable<CombatState["context"]>["world"]["partySizeBand"] {
  return value === "solo" || value === "duo" || value === "group";
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

function hasTransaction(prisma: PrismaClient): boolean {
  return typeof (prisma as { $transaction?: unknown }).$transaction === "function";
}
