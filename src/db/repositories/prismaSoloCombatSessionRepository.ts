import { Prisma, type PrismaClient } from "@prisma/client";
import { SOLO_COMBAT_LEASE_KIND } from "../../domain/combat/combatLeaseRegistry";
import type {
  CombatActionType,
  CombatCopiedEquipment,
  CombatDamageKind,
  CombatDebugTrace,
  CombatEnemyState,
  CombatEnemyTurnSummary,
  DrinkCombatModifiers,
  CombatLifeState,
  CombatResourceSettlementState,
  CombatSettlementState,
  CombatState,
  CombatStatus,
  CombatTrainingSettlementState,
  CombatTurnLogEntry,
  CombatTurnOutcome,
  CombatTurnSummary
} from "../../domain/combat";
import {
  findThreatEscalationLine,
  markCombatSettlementCompleted,
  markCombatSettlementForfeitedByRemort,
  parseCombatAnalyticsState,
  parseMonsterAbilityRuntimeState,
  THREAT_ESCALATION_REQUIRED_WINS,
  THREAT_ESCALATION_LINE_VERSION
} from "../../domain/combat";
import { isShynokDrinkKey } from "../../domain/shynokDrinks";
import { parseVarenykSatedCombatState } from "../../domain/noncombat/varenykSatedSupport";
import { parseBardInspirationCombatState } from "../../domain/noncombat/bardSupport";
import { applyCombatDrinkStateCommit } from "./combatDrinkStateCommit";
import { findActiveItemUseReservedItems } from "./itemUseReservations";
import { findActiveTransferReservedItems } from "./itemTransferReservations";
import { isConsumableCommitAllowed } from "./consumableCommitGate";
import {
  freezeVarenykSatedForSoloCombatStart,
  releaseCombatLeaseWithTimedStatuses
} from "./prismaVarenykSated";
import { freezeBardInspirationFromCooldown } from "./prismaBardSupport";
import type {
  AdoptLegacySoloCombatSettlementInput,
  AdoptLegacySoloCombatSettlementResult,
  ApplyCombatItemTurnInput,
  ApplyCombatItemTurnResult,
  ApplyTerminalResourcesInput,
  ApplyTerminalResourcesResult,
  ApplyTrainingCooldownInput,
  ApplyTrainingCooldownResult,
  CompleteSoloCombatSettlementInput,
  CreateSoloCombatSessionInput,
  DueSoloCombatSessionRecord,
  ForfeitSoloCombatSettlementInput,
  GuardedSettlementResult,
  RecordSoloCombatRewardInput,
  SoloCombatLeaseLookupResult,
  SoloCombatSessionLifeRecord,
  SoloCombatSessionCompletionRecord,
  SoloCombatSessionRecord,
  SoloCombatSessionRepository,
  SoloCombatSessionStatus,
  UpdateSoloCombatSessionInput
} from "./soloCombatSessionRepository";
import { countCharacterRemorts } from "./prismaRemortCount";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";
import { getQuestMarkerReadSnapshot } from "./questMarkerReadContext";

type PrismaSoloCombatSessionRecord = Awaited<
  ReturnType<PrismaClient["soloCombatSession"]["findFirst"]>
>;
type CountRow = { count: bigint | number };
type TxClient = Prisma.TransactionClient;

const terminalStatuses = new Set<CombatStatus>(["won", "lost", "fled", "expired"]);
const DEFAULT_DUE_SESSION_LIMIT = 20;
const DUE_SESSION_PAGE_SIZE = 100;
const DUE_SESSION_SCAN_CAP = 1000;
const RECENT_ORDINARY_PAGE_SIZE = 50;
const RECENT_ORDINARY_SCAN_CAP = 200;
const MAX_PROGRESS_ELIGIBLE_WIN_COUNT = 93;
const RETRY_SOLO_COMBAT_CREATE = Symbol("retry-solo-combat-create");
const TRAINING_DOPPELGANGER_COOLDOWN_KEY = "training.doppelganger.spar";

class CombatItemTurnRollback extends Error {
  constructor(readonly outcome: Extract<ApplyCombatItemTurnResult["outcome"], "not-owned">) {
    super("Combat item turn rolled back.");
  }
}

export class PrismaSoloCombatSessionRepository implements SoloCombatSessionRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hpRecoveryProducer = new HpRecoveryNotificationProducer(false)
  ) {}

  async findActiveByTelegramUserId(
    telegramUserId: bigint
  ): Promise<SoloCombatSessionRecord | null> {
    const markerSnapshot = getQuestMarkerReadSnapshot(telegramUserId);
    if (markerSnapshot) {
      const session = this.mapSoloCombatSessionRecord(markerSnapshot.activeCombatSession);
      return session?.status === "active" ? session : null;
    }

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

    return this.mapSoloCombatSessionRecord(record);
  }

  async listDueActiveSessions(
    now: Date,
    options: {
      limit?: number;
      monsterIds?: readonly string[];
      excludeMonsterIds?: readonly string[];
    } = {}
  ): Promise<DueSoloCombatSessionRecord[]> {
    const limit = clampDueSessionLimit(options.limit);
    const due: DueSoloCombatSessionRecord[] = [];
    let scanned = 0;

    while (due.length < limit && scanned < DUE_SESSION_SCAN_CAP) {
      const records = await this.prisma.soloCombatSession.findMany({
        where: {
          status: "active",
          ...(options.monsterIds && options.monsterIds.length > 0
            ? { monsterId: { in: [...options.monsterIds] } }
            : {}),
          ...(options.excludeMonsterIds && options.excludeMonsterIds.length > 0
            ? { monsterId: { notIn: [...options.excludeMonsterIds] } }
            : {})
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
        orderBy: [
          { updatedAt: "asc" },
          { id: "asc" }
        ],
        skip: scanned,
        take: Math.min(DUE_SESSION_PAGE_SIZE, DUE_SESSION_SCAN_CAP - scanned)
      });

      if (records.length === 0) {
        break;
      }

      scanned += records.length;

      for (const record of records) {
        if (due.length >= limit) {
          break;
        }

        if (record.expiresAt.getTime() <= now.getTime()) {
          continue;
        }

        const mapped = this.mapSoloCombatSessionRecord(record);

        if (!mapped?.state?.turnExpiresAt || Date.parse(mapped.state.turnExpiresAt) > now.getTime()) {
          continue;
        }

        due.push({
          ...mapped,
          telegramUserId: record.character.user.telegramUserId
        });
      }
    }

    return due;
  }

  async countWonByTelegramUserId(
    telegramUserId: bigint,
    options: {
      excludeMonsterIds?: readonly string[];
      since?: Date;
      life?: Pick<CombatLifeState, "remortCount">;
    } = {}
  ): Promise<number> {
    const records = await this.prisma.soloCombatSession.findMany({
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
      },
      select: {
        stateJson: true
      }
    });

    return records.filter((record) => {
      const state = this.parseCombatState(record.stateJson);
      return isVictoryProgressEligible("won", state) && combatLifeMatchesProgressFilter(state, options.life);
    }).length;
  }

  async countBoundedWonByTelegramUserId(
    telegramUserId: bigint,
    options: {
      excludeMonsterIds?: readonly string[];
      since?: Date;
      life?: Pick<CombatLifeState, "remortCount">;
      limit: number;
    }
  ): Promise<number> {
    const limit = Math.max(1, Math.min(MAX_PROGRESS_ELIGIBLE_WIN_COUNT, Math.floor(options.limit)));
    const excluded = [...new Set(options.excludeMonsterIds ?? [])];
    const remortCount = options.life
      ? Math.max(0, Math.floor(options.life.remortCount))
      : null;
    const rows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS count
      FROM (
        SELECT session.id
        FROM solo_combat_sessions AS session
        INNER JOIN characters AS character ON character.id = session.character_id
        INNER JOIN users AS user ON user.id = character.user_id
        WHERE user.telegram_user_id = ${telegramUserId}
          AND session.status = 'won'
          ${excluded.length > 0
            ? Prisma.sql`AND session.monster_id NOT IN (${Prisma.join(excluded)})`
            : Prisma.empty}
          ${options.since
            ? Prisma.sql`AND session.created_at > ${options.since}`
            : Prisma.empty}
          AND (
            json_type(session.state_json, '$.settlement') IS NULL
            OR json_extract(session.state_json, '$.settlement.status') = 'completed'
          )
          ${remortCount === null
            ? Prisma.empty
            : Prisma.sql`AND (
                CAST(json_extract(session.state_json, '$.life.remortCount') AS INTEGER) = ${remortCount}
                OR (
                  json_type(session.state_json, '$.life.remortCount') IS NULL
                  AND ${remortCount} = 0
                )
              )`}
        LIMIT ${limit}
      ) AS bounded_wins
    `);

    return Math.min(limit, Math.max(0, Number(rows[0]?.count ?? 0)));
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
      const state = this.parseCombatState(record.stateJson);
      const completedAt = getSessionCompletionTime({
        status,
        state,
        createdAt: record.createdAt
      });

      if (!completedAt || completedAt < since) {
        return [];
      }

      if (status === "won" && !isVictoryProgressEligible(status, state)) {
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

  async countProgressEligibleWinsByTelegramUserId(
    telegramUserId: bigint,
    options: {
      monsterIds: readonly string[];
      completedSince: Date;
      life: Pick<CombatLifeState, "remortCount">;
      limit: number;
    }
  ): Promise<number> {
    const monsterIds = [...new Set(options.monsterIds)];
    if (monsterIds.length === 0) {
      return 0;
    }

    const limit = Math.max(
      1,
      Math.min(MAX_PROGRESS_ELIGIBLE_WIN_COUNT, Math.floor(options.limit))
    );
    const completedSinceIso = options.completedSince.toISOString();
    const remortCount = Math.max(0, Math.floor(options.life.remortCount));
    const rows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*) AS count
      FROM (
        SELECT session.id
        FROM solo_combat_sessions AS session
        INNER JOIN characters AS character ON character.id = session.character_id
        INNER JOIN users AS user ON user.id = character.user_id
        WHERE user.telegram_user_id = ${telegramUserId}
          AND session.status = 'won'
          AND session.monster_id IN (${Prisma.join(monsterIds)})
          AND (
            (
              julianday(json_extract(session.state_json, '$.completedAt')) IS NOT NULL
              AND julianday(json_extract(session.state_json, '$.completedAt')) >= julianday(${completedSinceIso})
            )
            OR (
              julianday(json_extract(session.state_json, '$.completedAt')) IS NULL
              AND session.created_at >= ${options.completedSince}
            )
          )
          AND (
            json_type(session.state_json, '$.settlement') IS NULL
            OR json_extract(session.state_json, '$.settlement.status') = 'completed'
          )
          AND (
            CAST(json_extract(session.state_json, '$.life.remortCount') AS INTEGER) = ${remortCount}
            OR (
              json_type(session.state_json, '$.life.remortCount') IS NULL
              AND ${remortCount} = 0
            )
          )
        LIMIT ${limit}
      ) AS bounded_wins
    `);

    const count = rows[0]?.count ?? 0;
    return Math.min(limit, Math.max(0, Number(count)));
  }

  async listRecentCompletedByTelegramUserId(
    telegramUserId: bigint,
    limit: number
  ): Promise<SoloCombatSessionCompletionRecord[]> {
    const resultLimit = Math.max(1, Math.min(RECENT_ORDINARY_SCAN_CAP, Math.floor(limit)));
    const completed: Array<SoloCombatSessionCompletionRecord & { id: string }> = [];
    let scanned = 0;

    while (scanned < RECENT_ORDINARY_SCAN_CAP) {
      const records = await this.prisma.soloCombatSession.findMany({
        where: {
          character: {
            user: {
              telegramUserId
            }
          }
        },
        orderBy: [
          // Completion lives in stateJson, but terminal writes update the row.
          // Scan by updatedAt before the canonical completedAt sort so old
          // long-running fights completed recently stay inside the bounded window.
          { updatedAt: "desc" },
          { id: "desc" }
        ],
        skip: scanned,
        take: Math.min(RECENT_ORDINARY_PAGE_SIZE, RECENT_ORDINARY_SCAN_CAP - scanned),
        select: {
          id: true,
          monsterId: true,
          status: true,
          stateJson: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (records.length === 0) {
        break;
      }

      scanned += records.length;

      for (const record of records) {
        const status = parseStatus(record.status);
        const state = this.parseCombatState(record.stateJson);
        const completedAt = getSessionCompletionTime({
          status,
          state,
          createdAt: record.createdAt
        });

        if (!completedAt) {
          continue;
        }

        completed.push({
          id: record.id,
          monsterId: record.monsterId,
          status,
          state,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          completedAt
        });
      }
    }

    return completed
      .sort(
        (left, right) =>
          right.completedAt.getTime() - left.completedAt.getTime() ||
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.id.localeCompare(left.id)
      )
      .slice(0, resultLimit)
      .map((record) => ({
        monsterId: record.monsterId,
        status: record.status,
        state: record.state,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt
      }));
  }

  async clearMonsterRestCooldownForTelegramUser(
    telegramUserId: bigint,
    input: { since: Date; completedAt: Date }
  ): Promise<number> {
    const records = await this.prisma.soloCombatSession.findMany({
      where: {
        OR: [{ updatedAt: { gte: input.since } }, { createdAt: { gte: input.since } }],
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
        id: true,
        status: true,
        stateJson: true,
        createdAt: true
      }
    });

    const completedAt = input.completedAt.toISOString();
    const updates = records.flatMap((record) => {
      const status = parseStatus(record.status);
      const state = this.parseCombatState(record.stateJson);
      const sessionCompletedAt = getSessionCompletionTime({
        status,
        state,
        createdAt: record.createdAt
      });

      if (!state || state.source !== "normal" || !sessionCompletedAt || sessionCompletedAt < input.since) {
        return [];
      }

      if (status === "won" && !isVictoryProgressEligible(status, state)) {
        return [];
      }

      return [{
        id: record.id,
        stateJson: {
          ...state,
          completedAt
        } as unknown as Prisma.InputJsonValue
      }];
    });

    for (const update of updates) {
      await this.prisma.soloCombatSession.update({
        where: {
          id: update.id
        },
        data: {
          stateJson: update.stateJson
        }
      });
    }

    return updates.length;
  }

  async listRecentOrdinaryMonsterIdsByTelegramUserId(
    telegramUserId: bigint,
    limit: number
  ): Promise<string[]> {
    const resultLimit = Math.max(1, Math.floor(limit));
    const ordinary: Array<{ monsterId: string; completedAt: Date; id: string }> = [];
    let scanned = 0;

    while (scanned < RECENT_ORDINARY_SCAN_CAP) {
      const records = await this.prisma.soloCombatSession.findMany({
        where: {
          character: {
            user: {
              telegramUserId
            }
          }
        },
        orderBy: [
          { updatedAt: "desc" },
          { id: "desc" }
        ],
        skip: scanned,
        take: Math.min(RECENT_ORDINARY_PAGE_SIZE, RECENT_ORDINARY_SCAN_CAP - scanned),
        select: {
          id: true,
          monsterId: true,
          stateJson: true,
          status: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (records.length === 0) {
        break;
      }

      scanned += records.length;

      for (const record of records) {
        const state = this.parseCombatState(record.stateJson);
        const status = parseStatus(record.status);
        const completedAt = getSessionCompletionTime({
          status,
          state,
          createdAt: record.createdAt
        });

        if (!completedAt || state?.source !== "normal") {
          continue;
        }

        ordinary.push({
          monsterId: record.monsterId,
          completedAt,
          id: record.id
        });
      }
    }

    const seen = new Set<string>();
    const result: string[] = [];

    for (const record of ordinary.sort(
      (left, right) =>
        right.completedAt.getTime() - left.completedAt.getTime() ||
        right.id.localeCompare(left.id)
    )) {
      if (seen.has(record.monsterId)) {
        continue;
      }

      result.push(record.monsterId);
      seen.add(record.monsterId);
      if (result.length >= resultLimit) {
        break;
      }
    }

    return result;
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

    return this.mapSoloCombatSessionRecord(record);
  }

  async findPublicTerminalById(sessionId: string) {
    const artifact = await this.findPublicArtifactById(sessionId);
    return artifact?.session.status === "active" ? null : artifact;
  }

  async findPublicArtifactById(sessionId: string) {
    const record = await this.prisma.soloCombatSession.findFirst({
      where: { id: sessionId },
      include: { character: true }
    });

    if (!record) {
      return null;
    }

    return {
      session: this.mapSoloCombatSessionRecord(record)!,
      character: record.character
    };
  }

  async createForTelegramUser(
    telegramUserId: bigint,
    input: CreateSoloCombatSessionInput,
    retryAttempt = 0
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
          id: true,
          hpCurrent: true,
          manaCurrent: true,
          hpRegenAt: true,
          manaRegenAt: true,
          updatedAt: true
        }
      });

      if (!character) {
        return null;
      }

      let committedState = await applyCombatDrinkStateCommit(
        tx,
        character.id,
        input.state,
        input.drinkStateCommit
      );
      const combatStartedAt = committedState.life?.startedAt
        ? new Date(committedState.life.startedAt)
        : null;
      if (combatStartedAt && Number.isFinite(combatStartedAt.getTime())) {
        committedState = await freezeVarenykSatedForSoloCombatStart({
          tx,
          character,
          state: committedState,
          now: combatStartedAt
        });
        const bardInspiration = await freezeBardInspirationFromCooldown({
          tx,
          characterId: character.id,
          remortCount: committedState.life?.remortCount ?? 0,
          now: combatStartedAt
        });
        if (bardInspiration) {
          committedState = { ...committedState, bardInspiration };
        }
      }

      const session = await tx.soloCombatSession.create({
        data: {
          ...(sessionId ? { id: sessionId } : {}),
          characterId: character.id,
          monsterId: input.monsterId,
          stateJson: committedState as unknown as Prisma.InputJsonValue,
          status: committedState.status,
          turn: committedState.turn,
          expiresAt: input.expiresAt
        }
      });

      await tx.activeCombatLease.create({
        data: {
          characterId: character.id,
          kind: SOLO_COMBAT_LEASE_KIND,
          referenceId: session.id,
          createdAt: combatStartedAt ?? session.createdAt,
          updatedAt: combatStartedAt ?? session.createdAt
        }
      });

      return session;
    }).catch(async (error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        isActiveCombatLeaseUniqueConflict(error)
      ) {
        const leased = await this.findLeasedByTelegramUserId(telegramUserId);

        if (
          leased.state === "active" ||
          leased.state === "terminal-pending" ||
          leased.state === "terminal-completed" ||
          leased.state === "terminal-forfeited"
        ) {
          return leased.session;
        }

        if (leased.state === "missing-session" || leased.state === "none") {
          return RETRY_SOLO_COMBAT_CREATE;
        }

        if (leased.state === "unsupported") {
          return null;
        }
      }

      throw error;
    });

    if (record === RETRY_SOLO_COMBAT_CREATE) {
      return retryAttempt >= 1
        ? null
        : this.createForTelegramUser(telegramUserId, input, retryAttempt + 1);
    }

    return record
      ? isSoloCombatSessionRecord(record)
        ? record
        : this.mapSoloCombatSessionRecord(record)
      : null;
  }

  async markStatusById(
    sessionId: string,
    status: SoloCombatSessionStatus,
    observedAt?: Date
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

      return this.mapSoloCombatSessionRecord(record);
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
        const state = this.parseCombatState(updated.stateJson);
        const completedAt = state?.completedAt ? new Date(state.completedAt) : null;
        await releaseSoloCombatLease(tx, {
          sessionId,
          state,
          releasedAt: status === "expired"
            ? new Date(Math.min((observedAt ?? new Date()).getTime(), updated.expiresAt.getTime()))
            : completedAt && Number.isFinite(completedAt.getTime())
              ? completedAt
              : observedAt ?? new Date()
        });
      }

      return updated;
    }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) {
        return null;
      }

      throw error;
    });

    return this.mapSoloCombatSessionRecord(record);
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

      return this.mapSoloCombatSessionRecord(record);
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

      const releasingLease = input.status !== "active" && input.releaseLease;

      if (releasingLease) {
        await releaseSoloCombatLease(tx, {
          sessionId,
          state: input.state,
          releasedAt: getSatedLeaseThrough(input)
        });
      }

      return updated;
    }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) {
        return null;
      }

      throw error;
    });

    return this.mapSoloCombatSessionRecord(record);
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

      const releasingLease = input.status !== "active" && input.releaseLease;

      if (releasingLease) {
        await releaseSoloCombatLease(tx, {
          sessionId,
          state: input.state,
          releasedAt: getSatedLeaseThrough(input)
        });
      }

      return tx.soloCombatSession.findUnique({
        where: {
          id: sessionId
        }
      });
    });

    return this.mapSoloCombatSessionRecord(record);
  }

  async applyCombatItemTurnById(
    sessionId: string,
    expectedTurn: number,
    input: ApplyCombatItemTurnInput
  ): Promise<ApplyCombatItemTurnResult> {
    const result = await this.prisma.$transaction(async (tx): Promise<ApplyCombatItemTurnResult> => {
      const character = await tx.character.findFirst({
        where: {
          id: input.characterId,
          user: { telegramUserId: input.telegramUserId }
        },
        select: { id: true }
      });

      if (!character) {
        return { outcome: "stale-turn", session: null };
      }

      const lease = await tx.activeCombatLease.findUnique({
        where: { characterId: input.characterId },
        select: { kind: true, referenceId: true }
      });
      if (!lease || lease.kind !== SOLO_COMBAT_LEASE_KIND || lease.referenceId !== sessionId) {
        return { outcome: "stale-turn", session: null };
      }

      if (!(await isConsumableCommitAllowed(tx, {
        characterId: input.characterId,
        itemId: input.itemId
      }))) {
        return { outcome: "not-usable", session: null };
      }

      await tx.characterItem.updateMany({
        where: { characterId: input.characterId, itemId: input.itemId },
        data: { updatedAt: input.now }
      });

      await cancelPendingCombatItemUseOrders(tx, input.characterId, input.itemId, input.now);

      const [stack, equipped, reservedItemIds] = await Promise.all([
        tx.characterItem.findUnique({
          where: {
            characterId_itemId: {
              characterId: input.characterId,
              itemId: input.itemId
            }
          }
        }),
        tx.characterEquipment.findFirst({
          where: { characterId: input.characterId, itemId: input.itemId },
          select: { id: true }
        }),
        getCombatItemReservedItemIds(tx, input.characterId, input.now, {
          includeItemUseReservations: false
        })
      ]);

      if (!stack || stack.quantity < 1) {
        return { outcome: "not-owned", session: null };
      }

      if (equipped || reservedItemIds.includes(input.itemId)) {
        return { outcome: "reserved", session: null };
      }

      const updated = await tx.soloCombatSession.updateMany({
        where: {
          id: sessionId,
          characterId: input.characterId,
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

      if (updated.count !== 1) {
        return { outcome: "stale-turn", session: null };
      }

      const releasingLease = input.status !== "active" && input.releaseLease;

      const consumed = await tx.characterItem.updateMany({
        where: {
          characterId: input.characterId,
          itemId: input.itemId,
          quantity: { gte: 1 }
        },
        data: {
          quantity: { decrement: 1 }
        }
      });

      if (consumed.count !== 1) {
        throw new CombatItemTurnRollback("not-owned");
      }

      await tx.characterItem.deleteMany({
        where: {
          characterId: input.characterId,
          quantity: { lte: 0 }
        }
      });

      if (releasingLease) {
        await releaseSoloCombatLease(tx, {
          sessionId,
          state: input.state,
          releasedAt: getSatedLeaseThrough(input)
        });
      }

      const session = await tx.soloCombatSession.findUnique({
        where: { id: sessionId }
      });

      return { outcome: "updated", session: this.mapSoloCombatSessionRecord(session) };
    }).catch((error: unknown) => {
      if (error instanceof CombatItemTurnRollback) {
        return { outcome: error.outcome, session: null };
      }

      throw error;
    });

    return result;
  }

  async recordRewardById(
    sessionId: string,
    input: RecordSoloCombatRewardInput
  ): Promise<SoloCombatSessionRecord | null> {
    const record = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.soloCombatSession.update({
        where: {
          id: sessionId
        },
        data: {
          rewardXp: input.rewardXp,
          rewardGold: input.rewardGold,
          rewardItemsJson: input.itemGrants,
          rewardClaimedAt: input.claimedAt,
          ...(input.state ? { stateJson: input.state as unknown as Prisma.InputJsonValue } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.state ? { turn: input.state.turn } : {})
        }
      });

      if (input.releaseLease) {
        await releaseSoloCombatLease(tx, {
          sessionId,
          state: input.state ?? this.parseCombatState(updated.stateJson),
          releasedAt: input.claimedAt
        });
      }

      return updated;
    }).catch((error: unknown) => {
      if (isPrismaNotFound(error)) {
        return null;
      }

      throw error;
    });

    return this.mapSoloCombatSessionRecord(record);
  }

  async findLeasedByTelegramUserId(
    telegramUserId: bigint
  ): Promise<SoloCombatLeaseLookupResult> {
    const markerSnapshot = getQuestMarkerReadSnapshot(telegramUserId);
    if (markerSnapshot) {
      return this.findLeasedInMarkerSnapshot(markerSnapshot.character?.id ?? null);
    }

    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: { id: true }
    });

    if (!character) {
      return { state: "none" };
    }

    return this.findLeasedByCharacterId(character.id);
  }

  async findLeasedByCharacterId(characterId: string): Promise<SoloCombatLeaseLookupResult> {
    const markerSnapshot = getQuestMarkerReadSnapshot();
    if (markerSnapshot?.character?.id === characterId) {
      return this.findLeasedInMarkerSnapshot(characterId);
    }

    const lease = await this.prisma.activeCombatLease.findUnique({
      where: { characterId },
      select: { kind: true, referenceId: true }
    });

    if (!lease) {
      return { state: "none" };
    }

    if (lease.kind !== SOLO_COMBAT_LEASE_KIND) {
      return {
        state: "unsupported",
        kind: lease.kind,
        referenceId: lease.referenceId
      };
    }

    const record = await this.prisma.soloCombatSession.findFirst({
      where: {
        id: lease.referenceId,
        characterId
      }
    });

    if (!record) {
      return {
        state: "missing-session",
        referenceId: lease.referenceId
      };
    }

    const session = this.mapSoloCombatSessionRecord(record);

    if (!session) {
      return {
        state: "missing-session",
        referenceId: lease.referenceId
      };
    }

    if (session.status === "active") {
      return { state: "active", session };
    }

    if (session.state?.settlement?.status === "completed") {
      return { state: "terminal-completed", session };
    }

    if (session.state?.settlement?.status === "forfeited-by-remort") {
      return { state: "terminal-forfeited", session };
    }

    return { state: "terminal-pending", session };
  }

  private findLeasedInMarkerSnapshot(characterId: string | null): SoloCombatLeaseLookupResult {
    const markerSnapshot = getQuestMarkerReadSnapshot();
    const lease = markerSnapshot?.activeCombatLease;
    if (!characterId || !lease) {
      return { state: "none" };
    }
    if (lease.kind !== SOLO_COMBAT_LEASE_KIND) {
      return { state: "unsupported", kind: lease.kind, referenceId: lease.referenceId };
    }
    const session = this.mapSoloCombatSessionRecord(markerSnapshot.activeCombatSession);
    if (!session || session.id !== lease.referenceId) {
      return { state: "missing-session", referenceId: lease.referenceId };
    }
    if (session.status === "active") {
      return { state: "active", session };
    }
    if (session.state?.settlement?.status === "completed") {
      return { state: "terminal-completed", session };
    }
    if (session.state?.settlement?.status === "forfeited-by-remort") {
      return { state: "terminal-forfeited", session };
    }
    return { state: "terminal-pending", session };
  }

  async releaseLeaseBySessionId(sessionId: string, now?: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.soloCombatSession.findUnique({
        where: { id: sessionId },
        select: { stateJson: true }
      });
      const state = current ? this.parseCombatState(current.stateJson) : null;
      return releaseSoloCombatLease(tx, {
        sessionId,
        state,
        releasedAt: now ?? new Date()
      });
    });
  }

  async completeSettlementById(
    sessionId: string,
    input: CompleteSoloCombatSettlementInput
  ): Promise<GuardedSettlementResult> {
    return this.guardSettlementById(sessionId, "completed", input);
  }

  async forfeitSettlementById(
    sessionId: string,
    input: ForfeitSoloCombatSettlementInput
  ): Promise<GuardedSettlementResult> {
    return this.guardSettlementById(sessionId, "forfeited", input);
  }

  async applyTerminalResourcesById(
    sessionId: string,
    input: ApplyTerminalResourcesInput
  ): Promise<ApplyTerminalResourcesResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.soloCombatSession.findUnique({
        where: {
          id: sessionId
        }
      });

      if (!current) {
        return { outcome: "missing", session: null };
      }

      const state = this.parseCombatState(current.stateJson);
      const existingTerminal = settlementTerminalOutcome(state);

      if (existingTerminal) {
        return {
          outcome: existingTerminal,
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      if (state?.settlement?.resources?.status === "applied") {
        return {
          outcome: "already-applied",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      const preflight = await validatePendingSettlementSubstep(tx, current, state, input.expected);

      if (preflight !== "ok") {
        return {
          outcome: preflight,
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      const updatedResources = await tx.character.updateMany({
        where: {
          id: current.characterId,
          hpCurrent: input.expectedResources.hpCurrent,
          manaCurrent: input.expectedResources.manaCurrent,
          hpRegenAt: input.expectedResources.hpRegenAt ?? null,
          manaRegenAt: input.expectedResources.manaRegenAt ?? null
        },
        data: {
          hpCurrent: input.resources.hpCurrent,
          manaCurrent: input.resources.manaCurrent,
          hpRegenAt: input.resources.hpRegenAt,
          manaRegenAt: input.resources.manaRegenAt
        }
      });

      if (updatedResources.count !== 1) {
        return {
          outcome: "resource-cas-conflict",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      await this.hpRecoveryProducer.record(
        tx,
        current.characterId,
        input.appliedAt,
        input.resources.hpCurrent >= (state?.hero.hpMax ?? Number.POSITIVE_INFINITY)
          ? "suppress"
          : "recovering"
      );

      const nextState = markTerminalResourcesAppliedInState(state, input);
      const updated = await tx.soloCombatSession.update({
        where: {
          id: sessionId
        },
        data: {
          stateJson: nextState as unknown as Prisma.InputJsonValue,
          status: nextState.status,
          turn: nextState.turn
        }
      });

      return {
        outcome: "applied",
        session: this.mapSoloCombatSessionRecord(updated)
      };
    });
  }

  async applyTrainingCooldownById(
    sessionId: string,
    input: ApplyTrainingCooldownInput
  ): Promise<ApplyTrainingCooldownResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.soloCombatSession.findUnique({
        where: {
          id: sessionId
        }
      });

      if (!current) {
        return { outcome: "missing", session: null, availableAt: null };
      }

      const state = this.parseCombatState(current.stateJson);
      const existingTerminal = settlementTerminalOutcome(state);

      if (existingTerminal) {
        return {
          outcome: existingTerminal,
          session: this.mapSoloCombatSessionRecord(current),
          availableAt: state?.settlement?.training?.availableAt
            ? new Date(state.settlement.training.availableAt)
            : null
        };
      }

      if (state?.settlement?.training?.availableAt && state.settlement.training.cooldownClaimedAt) {
        return {
          outcome: "already-applied",
          session: this.mapSoloCombatSessionRecord(current),
          availableAt: new Date(state.settlement.training.availableAt)
        };
      }

      const preflight = await validatePendingSettlementSubstep(tx, current, state, input.expected);

      if (preflight !== "ok") {
        return {
          outcome: preflight,
          session: this.mapSoloCombatSessionRecord(current),
          availableAt: null
        };
      }

      const character = await tx.character.findFirst({
        where: {
          id: current.characterId,
          user: {
            telegramUserId: input.telegramUserId
          }
        },
        select: {
          id: true
        }
      });

      if (!character) {
        return {
          outcome: "missing",
          session: this.mapSoloCombatSessionRecord(current),
          availableAt: null
        };
      }

      const owner = buildTrainingCooldownOwner(sessionId, input.expected.life.remortCount, input.availableAt);
      const existing = await tx.characterCooldown.findUnique({
        where: {
          characterId_key: {
            characterId: current.characterId,
            key: input.cooldownKey
          }
        }
      });
      let cooldown = existing;

      if (existing) {
        const existingOwner = parseTrainingCooldownOwner(existing.resultJson);

        if (existing.availableAt > input.now) {
          if (
            existingOwner?.sessionId !== sessionId ||
            existingOwner.remortCount !== input.expected.life.remortCount
          ) {
            return {
              outcome: "cooldown-conflict",
              session: this.mapSoloCombatSessionRecord(current),
              availableAt: null
            };
          }
        } else {
          cooldown = await tx.characterCooldown.update({
            where: {
              id: existing.id
            },
            data: {
              availableAt: input.availableAt,
              resultJson: owner as Prisma.InputJsonValue
            }
          });
        }
      } else {
        cooldown = await tx.characterCooldown.create({
          data: {
            characterId: current.characterId,
            key: input.cooldownKey,
            availableAt: input.availableAt,
            resultJson: owner as Prisma.InputJsonValue
          }
        });
      }

      if (!cooldown) {
        return {
          outcome: "cooldown-conflict",
          session: this.mapSoloCombatSessionRecord(current),
          availableAt: null
        };
      }

      if (!parseTrainingCooldownOwner(cooldown.resultJson)) {
        cooldown = await tx.characterCooldown.update({
          where: {
            id: cooldown.id
          },
          data: {
            resultJson: owner as Prisma.InputJsonValue
          }
        });
      }

      const nextState = markTrainingCooldownAppliedInState(state, cooldown.availableAt, cooldown.updatedAt);
      const updated = await tx.soloCombatSession.update({
        where: {
          id: sessionId
        },
        data: {
          stateJson: nextState as unknown as Prisma.InputJsonValue,
          status: nextState.status,
          turn: nextState.turn
        }
      });

      return {
        outcome: "applied",
        session: this.mapSoloCombatSessionRecord(updated),
        availableAt: cooldown.availableAt
      };
    });
  }

  async adoptLegacySettlementById(
    sessionId: string,
    input: AdoptLegacySoloCombatSettlementInput
  ): Promise<AdoptLegacySoloCombatSettlementResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.soloCombatSession.findUnique({
        where: {
          id: sessionId
        }
      });

      if (!current) {
        return { outcome: "missing", session: null };
      }

      const state = this.parseCombatState(current.stateJson);

      if (!state) {
        return {
          outcome: "missing-state",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      if (state.settlement?.status === "completed" || state.settlement?.status === "forfeited-by-remort") {
        return {
          outcome: "already-terminal-settlement",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      if (state.life && state.settlement) {
        return {
          outcome: "already-current",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      if (parseStatus(current.status) !== input.expectedStatus || state.turn !== input.expectedTurn) {
        return {
          outcome: "stale-status-turn",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      if (
        (input.expectedSettlementVersion === null && state.settlement) ||
        (typeof input.expectedSettlementVersion === "number" &&
          state.settlement?.version !== input.expectedSettlementVersion)
      ) {
        return {
          outcome: "stale-status-turn",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      const lease = await tx.activeCombatLease.findUnique({
        where: {
          characterId: current.characterId
        },
        select: {
          kind: true,
          referenceId: true
        }
      });

      if (!lease || lease.kind !== SOLO_COMBAT_LEASE_KIND || lease.referenceId !== current.id) {
        return {
          outcome: "missing-mismatched-lease",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      const derivedLife = await deriveCombatLifeAtSessionStart(tx, current);
      const currentRemortCount = await countCharacterRemorts(tx, current.characterId);

      if (currentRemortCount !== derivedLife.remortCount) {
        return {
          outcome: "life-mismatch",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      const rawState = isRecord(current.stateJson)
        ? current.stateJson
        : state as unknown as Record<string, unknown>;
      const nextState = {
        ...rawState,
        life: state.life ?? {
          characterId: current.characterId,
          remortCount: derivedLife.remortCount,
          startedAt: current.createdAt.toISOString()
        },
        settlement: state.settlement ?? {
          status: "pending",
          version: 1
        }
      };

      const updated = await tx.soloCombatSession.update({
        where: {
          id: current.id
        },
        data: {
          stateJson: nextState as unknown as Prisma.InputJsonValue,
          status: state.status,
          turn: state.turn
        }
      });

      return {
        outcome: "adopted",
        session: this.mapSoloCombatSessionRecord(updated)
      };
    });
  }

  private async guardSettlementById(
    sessionId: string,
    target: "completed" | "forfeited",
    input: CompleteSoloCombatSettlementInput | ForfeitSoloCombatSettlementInput
  ): Promise<GuardedSettlementResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.soloCombatSession.findUnique({
        where: {
          id: sessionId
        }
      });

      if (!current) {
        return { outcome: "missing", session: null };
      }

      const state = this.parseCombatState(current.stateJson);

      if (state?.settlement?.status === "completed") {
        if (input.releaseLease) {
          await releaseSoloCombatLease(tx, {
            sessionId,
            state,
            releasedAt: input.settledAt
          });
        }

        return {
          outcome: "already-completed",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      if (state?.settlement?.status === "forfeited-by-remort") {
        if (input.releaseLease) {
          await releaseSoloCombatLease(tx, {
            sessionId,
            state,
            releasedAt: input.settledAt
          });
        }

        return {
          outcome: "already-forfeited",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      if (!settlementExpectationMatches(current, state, input.expected)) {
        return {
          outcome: "version-changed",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      const lifeMatches = await currentLifeMatchesExpected(tx, current, input.expected);
      const isLifeMismatchForfeit =
        target === "forfeited" &&
        (input as ForfeitSoloCombatSettlementInput).reason === "life-mismatch" &&
        Boolean(input.expected?.life);

      if (
        (!lifeMatches && !isLifeMismatchForfeit) ||
        (lifeMatches && isLifeMismatchForfeit) ||
        (isLifeMismatchForfeit && !(await hasExactSoloCombatLease(tx, current)))
      ) {
        return {
          outcome: "version-changed",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      if (
        target === "completed" &&
        !settlementCompletionPrerequisitesMet(current, state, input)
      ) {
        return {
          outcome: "substeps-incomplete",
          session: this.mapSoloCombatSessionRecord(current)
        };
      }

      const nextState = state
        ? target === "completed"
          ? markCombatSettlementCompleted(state, input.settledAt)
          : markCombatSettlementForfeitedByRemort(
              state,
              input.settledAt,
              (input as ForfeitSoloCombatSettlementInput).reason
            )
        : null;

      const updated = await tx.soloCombatSession.update({
        where: {
          id: sessionId
        },
        data: {
          ...(nextState
            ? {
                stateJson: nextState as unknown as Prisma.InputJsonValue,
                status: nextState.status,
                turn: nextState.turn
              }
            : {}),
          ...(target === "completed" && "reward" in input && input.reward
            ? {
                rewardXp: input.reward.rewardXp,
                rewardGold: input.reward.rewardGold,
                rewardItemsJson: input.reward.itemGrants,
                rewardClaimedAt: input.reward.claimedAt
              }
            : {})
        }
      });

      if (input.releaseLease) {
        await releaseSoloCombatLease(tx, {
          sessionId,
          state: nextState ?? state,
          releasedAt: input.settledAt
        });
      }

      if (target === "forfeited" && input.expected?.life) {
        await deleteOwnedPendingTrainingCooldown(tx, current.characterId, sessionId, input.expected.life.remortCount);
      }

      return {
        outcome: target,
        session: this.mapSoloCombatSessionRecord(updated)
      };
    });
  }

  async resolveLifeById(sessionId: string): Promise<SoloCombatSessionLifeRecord | null> {
    const session = await this.prisma.soloCombatSession.findUnique({
      where: {
        id: sessionId
      },
      select: {
        characterId: true,
        createdAt: true
      }
    });

    if (!session) {
      return null;
    }

    const remortCount = await this.prisma.characterRemort.count({
      where: {
        characterId: session.characterId,
        createdAt: {
          lte: session.createdAt
        }
      }
    });

    return { remortCount };
  }

  private mapSoloCombatSessionRecord(
    record: PrismaSoloCombatSessionRecord
  ): SoloCombatSessionRecord | null {
    return mapSoloCombatSessionRecord(record);
  }

  private parseCombatState(value: unknown): CombatState | null {
    return parseCombatState(value);
  }
}

export function mapSoloCombatSessionRecord(
  record: PrismaSoloCombatSessionRecord
): SoloCombatSessionRecord | null {
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

function clampDueSessionLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_DUE_SESSION_LIMIT;
  }

  return Math.min(100, Math.max(1, Math.floor(value)));
}

export function parseCombatState(value: unknown): CombatState | null {
  if (!isRecord(value)) {
    return null;
  }

  const turn = intOrNull(value.turn);
  const status = parseStateStatus(value.status);
  const source = parseCombatSource(value.source);
  const life = parseCombatLife(value.life);
  const settlement = parseCombatSettlement(value.settlement);
  const threat = parseCombatThreat(value.threat);
  const threatExclusion = parseCombatThreatExclusion(value.threatExclusion);
  const hero = parseResourceBlock(value.hero);
  const monster = parseMonsterBlock(value.monster);
  const enemies = parseEnemies(value.enemies, monster);
  const completedAt = parseIsoDate(value.completedAt);
  const turnExpiresAt = parseIsoDate(value.turnExpiresAt);
  const message = parseMessageReference(value.message);
  const timeout = parseTimeoutState(value.timeout);
  const guard = parseGuardState(value.guard);
  const context = parseMonsterContextSnapshot(value.context);
  const barks = parseBarkState(value.barks);
  const analytics = parseCombatAnalyticsState(value.analytics);
  const monsterRuntime = parseMonsterAbilityRuntimeState(value.monsterRuntime);
  const lastTurn = parseTurnSummary(value.lastTurn);
  const turnLog = parseTurnLog(value.turnLog);
  const drinkModifiers = parseDrinkModifiers(value.drinkModifiers);
  const playerAbilityFumbles = parsePlayerAbilityFumbles(value.playerAbilityFumbles);
  const equipmentAbilities = parseEquipmentAbilities(value.equipmentAbilities);
  const enemyStatuses = parseEnemyStatuses(value.enemyStatuses);
  const statistics = parseCombatStatistics(value.statistics);
  const varenykSated = parseVarenykSatedCombatState(value.varenykSated);
  const bardInspiration = parseBardInspirationCombatState(value.bardInspiration);

  if (turn === null || !status || !hero || !monster || enemies === "malformed") {
    return null;
  }

  const cooldowns = parseCooldowns(value.cooldowns);
  const combatItems = parseCombatItems(value.combatItems);

  return {
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    ...(source ? { source } : {}),
    ...(life ? { life } : {}),
    ...(settlement ? { settlement } : {}),
    ...(threat ? { threat } : {}),
    ...(threatExclusion ? { threatExclusion } : {}),
    ...(typeof value.originLocationId === "string" ? { originLocationId: value.originLocationId } : {}),
    ...(completedAt ? { completedAt: completedAt.toISOString() } : {}),
    ...(turnExpiresAt ? { turnExpiresAt: turnExpiresAt.toISOString() } : {}),
    ...(message ? { message } : {}),
    ...(timeout ? { timeout } : {}),
    turn,
    status,
    hero,
    monster,
    ...(enemies ? { enemies } : {}),
    ...(cooldowns ? { cooldowns } : {}),
    ...(combatItems ? { combatItems } : {}),
    ...(guard ? { guard } : {}),
    ...(context ? { context } : {}),
    ...(barks ? { barks } : {}),
    ...(analytics ? { analytics } : {}),
    ...(drinkModifiers ? { drinkModifiers } : {}),
    ...(monsterRuntime ? { monsterRuntime } : {}),
    ...(lastTurn ? { lastTurn } : {}),
    ...(turnLog.length > 0 ? { turnLog } : {}),
    ...(playerAbilityFumbles ? { playerAbilityFumbles } : {}),
    ...(equipmentAbilities ? { equipmentAbilities } : {}),
    ...(enemyStatuses ? { enemyStatuses } : {}),
    ...(statistics ? { statistics } : {}),
    ...(varenykSated ? { varenykSated } : {}),
    ...(bardInspiration ? { bardInspiration } : {})
  };
}

function parseEquipmentAbilities(value: unknown): CombatState["equipmentAbilities"] | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.grantIds)) {
    return null;
  }

  const grantIds = value.grantIds.filter((grantId): grantId is string =>
    typeof grantId === "string" && grantId.length > 0 && grantId.length <= 128
  );

  return grantIds.length > 0
    ? { version: 1, grantIds: [...new Set(grantIds)] }
    : null;
}

function parseEnemyStatuses(value: unknown): CombatState["enemyStatuses"] | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.enemies)) {
    return null;
  }

  const enemies = Object.fromEntries(
    Object.entries(value.enemies).flatMap(([enemyId, raw]) => {
      if (!isRecord(raw) || enemyId.length === 0 || enemyId.length > 128) {
        return [];
      }

      const bleed = parseCombatBleedStatus(raw.bleed);
      return bleed ? [[enemyId, { bleed }] as const] : [];
    })
  );

  return Object.keys(enemies).length > 0
    ? { version: 1, enemies }
    : null;
}

function parseCombatBleedStatus(value: unknown): NonNullable<CombatState["enemyStatuses"]>["enemies"][string]["bleed"] | null {
  if (!isRecord(value) || typeof value.sourceAbilityId !== "string" || value.sourceAbilityId.length === 0 || value.sourceAbilityId.length > 128) {
    return null;
  }

  const damagePerActivation = boundedOptionalInt(value.damagePerActivation, 1, 93);
  const remainingHeroActivations = boundedOptionalInt(value.remainingHeroActivations, 0, 93);
  const refreshedAtTurn = boundedOptionalInt(value.refreshedAtTurn, 1, 1_000_000);

  return damagePerActivation === undefined ||
    remainingHeroActivations === undefined ||
    refreshedAtTurn === undefined
    ? null
    : {
        sourceAbilityId: value.sourceAbilityId,
        damagePerActivation,
        remainingHeroActivations,
        refreshedAtTurn
      };
}

function parseCombatItems(value: unknown): CombatState["combatItems"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const cooldowns = parseCombatItemCooldowns(value.cooldowns);
  const uses = parseCombatItemUses(value.uses);

  return cooldowns || uses
    ? {
        ...(cooldowns ? { cooldowns } : {}),
        ...(uses ? { uses } : {})
      }
    : null;
}

function parseCombatItemCooldowns(value: unknown): NonNullable<NonNullable<CombatState["combatItems"]>["cooldowns"]> | null {
  if (!isRecord(value)) {
    return null;
  }

  const entries = Object.entries(value).flatMap(([itemId, raw]) => {
    if (!isRecord(raw) || raw.itemId !== itemId || itemId.length === 0 || itemId.length > 128) {
      return [];
    }

    const parsed = boundedOptionalInt(raw.remainingTurns, 0, 93);
    if (parsed === undefined) {
      return [];
    }

    return [[itemId, { itemId, remainingTurns: parsed }]] as const;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function parseCombatItemUses(value: unknown): NonNullable<NonNullable<CombatState["combatItems"]>["uses"]> | null {
  if (!isRecord(value)) {
    return null;
  }

  const entries = Object.entries(value).flatMap(([itemId, raw]) => {
    if (!isRecord(raw) || raw.itemId !== itemId || itemId.length === 0 || itemId.length > 128) {
      return [];
    }

    const parsed = boundedOptionalInt(raw.count, 1, 13);
    if (parsed === undefined) {
      return [];
    }

    return [[itemId, { itemId, count: parsed }]] as const;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function parsePlayerAbilityFumbles(value: unknown): CombatState["playerAbilityFumbles"] | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.abilities)) {
    return null;
  }

  const abilities = Object.fromEntries(
    Object.entries(value.abilities).flatMap(([abilityId, entry]) => {
      if (!isRecord(entry) || entry.version !== 1 || abilityId.length === 0 || abilityId.length > 128) {
        return [];
      }
      const cycle = boundedOptionalInt(entry.cycle, 0, 1_000_000);
      const usesInCycle = boundedOptionalInt(entry.usesInCycle, 0, 92);
      const triggerAt = boundedOptionalInt(entry.triggerAt, 1, 93);

      return cycle === undefined || usesInCycle === undefined || triggerAt === undefined
        ? []
        : [[abilityId, { version: 1 as const, cycle, usesInCycle, triggerAt }] as const];
    })
  );

  return Object.keys(abilities).length > 0
    ? { version: 1, abilities }
    : null;
}

function parseCombatThreat(value: unknown): CombatState["threat"] | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }

  const pressure = parseCombatThreatPressure(value.pressure);
  const eligibleWins = boundedOptionalInt(
    value.eligibleWins,
    1,
    THREAT_ESCALATION_REQUIRED_WINS
  );

  return value.enemyCount === 2 &&
    value.reason === "ordinary-win-streak" &&
    eligibleWins !== undefined &&
    typeof value.lineId === "string" &&
    value.lineVersion === THREAT_ESCALATION_LINE_VERSION &&
    findThreatEscalationLine(value.lineId)
    ? {
        version: 1,
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins,
        lineId: value.lineId,
        lineVersion: value.lineVersion,
        ...(pressure ? { pressure } : {})
      }
    : null;
}

function parseCombatThreatPressure(value: unknown): NonNullable<NonNullable<CombatState["threat"]>["pressure"]> | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.boostedEnemyId !== "string") {
    return null;
  }

  const consecutiveWonEscalatedFights = boundedOptionalInt(value.consecutiveWonEscalatedFights, 0, 587);
  const requestedSecondEnemyLevelBonus = boundedOptionalInt(value.requestedSecondEnemyLevelBonus, 0, 587);
  const appliedSecondEnemyLevelBonus = boundedOptionalInt(value.appliedSecondEnemyLevelBonus, 0, 587);
  const boostedEnemyEffectiveLevel = boundedOptionalInt(value.boostedEnemyEffectiveLevel, 1, 587);
  const levelCap = boundedOptionalInt(value.levelCap, 1, 587);

  if (
    consecutiveWonEscalatedFights === undefined ||
    requestedSecondEnemyLevelBonus === undefined ||
    appliedSecondEnemyLevelBonus === undefined ||
    boostedEnemyEffectiveLevel === undefined ||
    levelCap === undefined ||
    value.boostedEnemyId.length === 0 ||
    value.boostedEnemyId.length > 80 ||
    appliedSecondEnemyLevelBonus > requestedSecondEnemyLevelBonus ||
    boostedEnemyEffectiveLevel > levelCap
  ) {
    return null;
  }

  return {
    version: 1,
    consecutiveWonEscalatedFights,
    requestedSecondEnemyLevelBonus,
    appliedSecondEnemyLevelBonus,
    boostedEnemyId: value.boostedEnemyId,
    boostedEnemyEffectiveLevel,
    levelCap
  };
}

function parseCombatThreatExclusion(value: unknown): CombatState["threatExclusion"] | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }

  return value.reason === "dev-forced-two-enemies"
    ? {
        version: 1,
        reason: "dev-forced-two-enemies"
      }
    : null;
}

function parseDrinkModifiers(value: unknown): DrinkCombatModifiers | null {
  if (!isRecord(value)) {
    return null;
  }

  const drinkKey = typeof value.drinkKey === "string" && isShynokDrinkKey(value.drinkKey)
    ? value.drinkKey
    : null;
  const sourceId = typeof value.sourceId === "string" && value.sourceId.length > 0 && value.sourceId.length <= 128
    ? value.sourceId
    : null;
  const activationId = typeof value.activationId === "string" && value.activationId.length > 0 && value.activationId.length <= 128
    ? value.activationId
    : null;

  if (!drinkKey || !sourceId) {
    return null;
  }

  const accuracyPenaltyPp = boundedOptionalInt(value.accuracyPenaltyPp, 0, 50);
  const outgoingDamageMultiplierBp = boundedOptionalInt(value.outgoingDamageMultiplierBp, 0, 20000);
  const incomingDamageMultiplierBp = boundedOptionalInt(value.incomingDamageMultiplierBp, 0, 20000);

  if (
    accuracyPenaltyPp === undefined &&
    outgoingDamageMultiplierBp === undefined &&
    incomingDamageMultiplierBp === undefined
  ) {
    return null;
  }

  return {
    drinkKey,
    sourceId,
    ...(activationId ? { activationId } : {}),
    ...(accuracyPenaltyPp !== undefined ? { accuracyPenaltyPp } : {}),
    ...(outgoingDamageMultiplierBp !== undefined ? { outgoingDamageMultiplierBp } : {}),
    ...(incomingDamageMultiplierBp !== undefined ? { incomingDamageMultiplierBp } : {})
  };
}

function boundedOptionalInt(value: unknown, min: number, max: number): number | undefined {
  const parsed = intOrNull(value);

  if (parsed === null || parsed < min || parsed > max) {
    return undefined;
  }

  return parsed;
}

function parseCombatLife(value: unknown): CombatLifeState | null {
  if (!isRecord(value)) {
    return null;
  }

  const remortCount = intOrNull(value.remortCount);
  const startedAt = parseIsoDate(value.startedAt);

  return remortCount === null || remortCount < 0
    ? null
    : {
        ...(typeof value.characterId === "string" ? { characterId: value.characterId } : {}),
        remortCount,
        ...(startedAt ? { startedAt: startedAt.toISOString() } : {})
      };
}

function parseCombatSettlement(value: unknown): CombatSettlementState | null {
  if (!isRecord(value)) {
    return null;
  }

  const status = parseSettlementStatus(value.status);
  const settledAt = parseIsoDate(value.settledAt);
  const version = intOrNull(value.version);
  const reason = parseSettlementReason(value.reason);
  const resources = parseResourceSettlement(value.resources);
  const training = parseTrainingSettlement(value.training);

  return status
    ? {
        status,
        ...(settledAt ? { settledAt: settledAt.toISOString() } : {}),
        ...(reason ? { reason } : {}),
        ...(version !== null && version > 0 ? { version } : {}),
        ...(resources ? { resources } : {}),
        ...(training ? { training } : {})
      }
    : null;
}

function parseResourceSettlement(value: unknown): CombatResourceSettlementState | null {
  if (!isRecord(value) || value.status !== "applied") {
    return null;
  }

  const appliedAt = parseIsoDate(value.appliedAt);
  const hpRegenAt = parseIsoDate(value.hpRegenAt);
  const manaRegenAt = parseIsoDate(value.manaRegenAt);
  const hpCurrent = intOrNull(value.hpCurrent);
  const manaCurrent = intOrNull(value.manaCurrent);

  if (!appliedAt || !hpRegenAt || !manaRegenAt || hpCurrent === null || manaCurrent === null) {
    return null;
  }

  return {
    status: "applied",
    appliedAt: appliedAt.toISOString(),
    hpCurrent,
    manaCurrent,
    hpRegenAt: hpRegenAt.toISOString(),
    manaRegenAt: manaRegenAt.toISOString()
  };
}

function parseTrainingSettlement(value: unknown): CombatTrainingSettlementState | null {
  if (!isRecord(value)) {
    return null;
  }

  const availableAt = parseIsoDate(value.availableAt);
  const cooldownClaimedAt = parseIsoDate(value.cooldownClaimedAt);

  if (!availableAt && !cooldownClaimedAt) {
    return null;
  }

  return {
    ...(availableAt ? { availableAt: availableAt.toISOString() } : {}),
    ...(cooldownClaimedAt ? { cooldownClaimedAt: cooldownClaimedAt.toISOString() } : {})
  };
}

function parseSettlementStatus(value: unknown): CombatSettlementState["status"] | null {
  return value === "pending" || value === "completed" || value === "forfeited-by-remort"
    ? value
    : null;
}

function parseSettlementReason(value: unknown): CombatSettlementState["reason"] | null {
  return value === "terminal" ||
    value === "remort" ||
    value === "legacy-life-mismatch" ||
    value === "life-mismatch"
    ? value
    : null;
}

function parseTimeoutState(value: unknown): CombatState["timeout"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const consecutiveMissedTurns = intOrNull(value.consecutiveMissedTurns);
  const lastMissedAt = parseIsoDate(value.lastMissedAt);

  return consecutiveMissedTurns === null || consecutiveMissedTurns < 0
    ? null
    : {
        consecutiveMissedTurns,
        ...(lastMissedAt ? { lastMissedAt: lastMissedAt.toISOString() } : {})
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

function isVictoryProgressEligible(
  status: SoloCombatSessionStatus,
  state: CombatState | null
): boolean {
  if (status !== "won") {
    return false;
  }

  if (!state?.settlement) {
    return true;
  }

  return state.settlement.status === "completed";
}

function combatLifeMatchesProgressFilter(
  state: CombatState | null,
  life: Pick<CombatLifeState, "remortCount"> | undefined
): boolean {
  if (!life) {
    return true;
  }

  const stateRemortCount = state?.life?.remortCount;
  if (stateRemortCount === undefined) {
    return life.remortCount === 0;
  }

  return stateRemortCount === life.remortCount;
}

function settlementExpectationMatches(
  record: NonNullable<PrismaSoloCombatSessionRecord>,
  state: CombatState | null,
  expected: CompleteSoloCombatSettlementInput["expected"]
): boolean {
  if (!expected) {
    return true;
  }

  if (expected.combatStatus && parseStatus(record.status) !== expected.combatStatus) {
    return false;
  }

  if (
    expected.settlementStatus &&
    (state?.settlement?.status ?? "pending") !== expected.settlementStatus
  ) {
    return false;
  }

  if (
    expected.settlementVersion !== undefined &&
    state?.settlement?.version !== expected.settlementVersion
  ) {
    return false;
  }

  if (
    expected.life &&
    state?.life &&
    state.life.remortCount !== expected.life.remortCount
  ) {
    return false;
  }

  return true;
}

async function validatePendingSettlementSubstep(
  tx: TxClient,
  record: NonNullable<PrismaSoloCombatSessionRecord>,
  state: CombatState | null,
  expected: ApplyTerminalResourcesInput["expected"]
): Promise<"ok" | "life-mismatch" | "version-changed"> {
  if (!state || !terminalStatuses.has(state.status)) {
    return "version-changed";
  }

  if (!settlementExpectationMatches(record, state, expected)) {
    return "version-changed";
  }

  const lease = await tx.activeCombatLease.findUnique({
    where: {
      characterId: record.characterId
    },
    select: {
      kind: true,
      referenceId: true
    }
  });

  if (!lease || lease.kind !== SOLO_COMBAT_LEASE_KIND || lease.referenceId !== record.id) {
    return "version-changed";
  }

  const currentRemortCount = await countCharacterRemorts(tx, record.characterId);

  return currentRemortCount === expected.life.remortCount ? "ok" : "life-mismatch";
}

async function hasExactSoloCombatLease(
  tx: TxClient,
  record: NonNullable<PrismaSoloCombatSessionRecord>
): Promise<boolean> {
  const lease = await tx.activeCombatLease.findUnique({
    where: {
      characterId: record.characterId
    },
    select: {
      kind: true,
      referenceId: true
    }
  });

  return lease?.kind === SOLO_COMBAT_LEASE_KIND && lease.referenceId === record.id;
}

async function currentLifeMatchesExpected(
  tx: TxClient,
  record: NonNullable<PrismaSoloCombatSessionRecord>,
  expected: CompleteSoloCombatSettlementInput["expected"]
): Promise<boolean> {
  if (!expected?.life) {
    return true;
  }

  const currentRemortCount = await countCharacterRemorts(tx, record.characterId);

  return currentRemortCount === expected.life.remortCount;
}

async function deriveCombatLifeAtSessionStart(
  tx: TxClient,
  record: NonNullable<PrismaSoloCombatSessionRecord>
): Promise<SoloCombatSessionLifeRecord> {
  const remortCount = await tx.characterRemort.count({
    where: {
      characterId: record.characterId,
      createdAt: {
        lte: record.createdAt
      }
    }
  });

  return { remortCount };
}

function settlementCompletionPrerequisitesMet(
  record: NonNullable<PrismaSoloCombatSessionRecord>,
  state: CombatState | null,
  input: CompleteSoloCombatSettlementInput
): boolean {
  if (!state || !terminalStatuses.has(state.status)) {
    return false;
  }

  if (state.settlement?.resources?.status !== "applied") {
    return false;
  }

  const rewardsRequired = state.status === "won" || state.status === "lost";
  const rewardPresent = record.rewardXp !== null &&
    record.rewardGold !== null &&
    record.rewardClaimedAt !== null;

  if (rewardsRequired && !rewardPresent && !input.reward) {
    return false;
  }

  if (state.source === "training" && rewardsRequired) {
    return Boolean(
      state.settlement.training?.availableAt &&
      state.settlement.training.cooldownClaimedAt
    );
  }

  return true;
}

async function deleteOwnedPendingTrainingCooldown(
  tx: TxClient,
  characterId: string,
  sessionId: string,
  remortCount: number
): Promise<void> {
  const cooldown = await tx.characterCooldown.findUnique({
    where: {
      characterId_key: {
        characterId,
        key: TRAINING_DOPPELGANGER_COOLDOWN_KEY
      }
    },
    select: {
      id: true,
      resultJson: true
    }
  });

  if (!cooldown) {
    return;
  }

  const owner = parseTrainingCooldownOwner(cooldown.resultJson);

  if (owner?.sessionId !== sessionId || owner.remortCount !== remortCount) {
    return;
  }

  await tx.characterCooldown.delete({
    where: {
      id: cooldown.id
    }
  });
}

function settlementTerminalOutcome(
  state: CombatState | null
): "already-completed" | "already-forfeited" | null {
  if (state?.settlement?.status === "completed") {
    return "already-completed";
  }

  if (state?.settlement?.status === "forfeited-by-remort") {
    return "already-forfeited";
  }

  return null;
}

function nextSettlementVersion(state: CombatState): number {
  return (state.settlement?.version ?? 1) + 1;
}

function markTerminalResourcesAppliedInState(
  state: CombatState | null,
  input: ApplyTerminalResourcesInput
): CombatState {
  if (!state) {
    throw new Error("Cannot mark terminal resources on a missing combat state.");
  }

  return {
    ...state,
    settlement: {
      status: "pending",
      ...state.settlement,
      version: nextSettlementVersion(state),
      resources: {
        status: "applied",
        appliedAt: input.appliedAt.toISOString(),
        hpCurrent: input.resources.hpCurrent,
        manaCurrent: input.resources.manaCurrent,
        hpRegenAt: input.resources.hpRegenAt.toISOString(),
        manaRegenAt: input.resources.manaRegenAt.toISOString()
      }
    }
  };
}

function markTrainingCooldownAppliedInState(
  state: CombatState | null,
  availableAt: Date,
  cooldownClaimedAt: Date
): CombatState {
  if (!state) {
    throw new Error("Cannot mark training cooldown on a missing combat state.");
  }

  return {
    ...state,
    settlement: {
      status: "pending",
      ...state.settlement,
      version: nextSettlementVersion(state),
      training: {
        availableAt: availableAt.toISOString(),
        cooldownClaimedAt: cooldownClaimedAt.toISOString()
      }
    }
  };
}

function buildTrainingCooldownOwner(
  sessionId: string,
  remortCount: number,
  availableAt: Date
): Record<string, unknown> {
  return {
    trainingSettlement: {
      sessionId,
      remortCount,
      availableAt: availableAt.toISOString()
    }
  };
}

function parseTrainingCooldownOwner(value: unknown): {
  sessionId: string;
  remortCount: number;
  availableAt: string;
} | null {
  if (!isRecord(value) || !isRecord(value.trainingSettlement)) {
    return null;
  }

  const sessionId = value.trainingSettlement.sessionId;
  const remortCount = intOrNull(value.trainingSettlement.remortCount);
  const availableAt = value.trainingSettlement.availableAt;

  return typeof sessionId === "string" &&
    remortCount !== null &&
    remortCount >= 0 &&
    typeof availableAt === "string"
    ? { sessionId, remortCount, availableAt }
    : null;
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
    : {
        hp,
        hpMax,
        mana,
        manaMax,
        ...(typeof value.guildCrest === "string" && value.guildCrest.length > 0
          ? { guildCrest: value.guildCrest }
          : {})
      };
}

function parseCombatStatistics(value: unknown): CombatState["statistics"] | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.enemies)) {
    return null;
  }

  const hero = parseCombatContributionDimensions(value.hero);
  if (!hero) {
    return null;
  }

  const enemies = Object.fromEntries(
    Object.entries(value.enemies).flatMap(([enemyId, dimensions]) => {
      const parsed = parseCombatContributionDimensions(dimensions);

      return enemyId.length > 0 && enemyId.length <= 80 && parsed
        ? [[enemyId, parsed] as const]
        : [];
    })
  );

  return {
    version: 1,
    hero,
    enemies
  };
}

function parseCombatContributionDimensions(
  value: unknown
): NonNullable<NonNullable<CombatState["statistics"]>["hero"]> | null {
  if (!isRecord(value)) {
    return null;
  }

  const damage = boundedOptionalInt(value.damage, 0, 1_000_000_000);
  const damageTaken = boundedOptionalInt(value.damageTaken, 0, 1_000_000_000);
  const actions = boundedOptionalInt(value.actions, 0, 1_000_000);
  const specialActions = boundedOptionalInt(value.specialActions, 0, 1_000_000);
  const guardedTurns = boundedOptionalInt(value.guardedTurns, 0, 1_000_000);
  const healing = parseNullableContributionValue(value.healing);
  const guardPrevented = parseNullableContributionValue(value.guardPrevented);
  const control = parseNullableContributionValue(value.control);

  return damage === undefined || damageTaken === undefined || actions === undefined ||
    specialActions === undefined || guardedTurns === undefined || healing === undefined ||
    guardPrevented === undefined || control === undefined
    ? null
    : {
        damage,
        healing,
        guardPrevented,
        control,
        damageTaken,
        actions,
        specialActions,
        guardedTurns
      };
}

function parseNullableContributionValue(value: unknown): number | null | undefined {
  return value === null ? null : boundedOptionalInt(value, 0, 1_000_000_000);
}

function parseMonsterBlock(value: unknown): CombatState["monster"] | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const hp = intOrNull(value.hp);
  const hpMax = intOrNull(value.hpMax);
  const level = intOrNull(value.level);
  const attack = intOrNull(value.attack);
  const armor = intOrNull(value.armor);
  const resist = intOrNull(value.resist);
  const dexterity = intOrNull(value.dexterity);
  const spellPower = intOrNull(value.spellPower);
  const copiedEquipment = parseCopiedEquipment(value.copiedEquipment);
  const debugTrace = parseCombatDebugTrace(value.debugTrace);
  const contextModifiers = parseCombatContextModifiers(value.contextModifiers);

  return hp === null || hpMax === null
    ? null
    : {
        id: value.id,
        ...(typeof value.name === "string" ? { name: value.name } : {}),
        ...(level !== null ? { level } : {}),
        hp,
        hpMax,
        ...(attack !== null ? { attack } : {}),
        ...(armor !== null ? { armor } : {}),
        ...(resist !== null ? { resist } : {}),
        ...(dexterity !== null ? { dexterity } : {}),
        ...(typeof value.classId === "string" ? { classId: value.classId } : {}),
        ...(typeof value.className === "string" ? { className: value.className } : {}),
        ...(typeof value.raceId === "string" ? { raceId: value.raceId } : {}),
        ...(typeof value.raceName === "string" ? { raceName: value.raceName } : {}),
        ...(typeof value.title === "string" ? { title: value.title } : {}),
        ...(spellPower !== null ? { spellPower } : {}),
        ...(copiedEquipment ? { copiedEquipment } : {}),
        ...(debugTrace ? { debugTrace } : {}),
        ...(contextModifiers ? { contextModifiers } : {})
      };
}

function parseEnemies(
  value: unknown,
  primaryMonster: CombatState["monster"] | null
): CombatEnemyState[] | "malformed" | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value) || value.length < 1 || value.length > 2 || !primaryMonster) {
    return "malformed";
  }

  const enemies = value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.enemyId !== "string") {
      return [];
    }

    const monster = parseMonsterBlock(entry);
    const runtime = parseMonsterAbilityRuntimeState(entry.monsterRuntime);

    return monster
      ? [{
          enemyId: entry.enemyId,
          ...monster,
          ...(runtime ? { monsterRuntime: runtime } : {})
        }]
      : [];
  });
  const enemyIds = new Set(enemies.map((enemy) => enemy.enemyId));

  if (
    enemies.length !== value.length ||
    enemyIds.size !== enemies.length ||
    !enemies[0] ||
    enemies[0].id !== primaryMonster.id ||
    enemies[0].hp !== primaryMonster.hp ||
    enemies[0].hpMax !== primaryMonster.hpMax
  ) {
    return "malformed";
  }

  return enemies;
}

function parseStateStatus(value: unknown): CombatStatus | null {
  return value === "active" || terminalStatuses.has(value as CombatStatus)
    ? (value as CombatStatus)
    : null;
}

function parseTurnSummary(value: unknown): CombatTurnSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const action = parseCombatAction(value.action);
  const heroOutcome = parseTurnOutcome(value.heroOutcome);
  const monsterOutcome = parseTurnOutcome(value.monsterOutcome);
  const heroDamage = intOrNull(value.heroDamage);
  const monsterDamage = intOrNull(value.monsterDamage);
  const heroEffectDamage = intOrNull(value.heroEffectDamage);
  const manaSpent = intOrNull(value.manaSpent);
  const heroCounterDamage = intOrNull(value.heroCounterDamage);
  const heroHealing = intOrNull(value.heroHealing);
  const heroManaRestored = intOrNull(value.heroManaRestored);
  const damageKind = parseDamageKind(value.damageKind);
  const monsterDamageKind = parseDamageKind(value.monsterDamageKind);
  const debugTrace = parseCombatDebugTrace(value.debugTrace);
  const actionOrigin = parseActionOrigin(value.actionOrigin);
  const monsterAction = parseMonsterAction(value.monsterAction);
  const abilitySource = parseAbilitySource(value.abilitySource);
  const targetScope = parseTargetScope(value.targetScope);
  const secondaryTargetScope = parseTargetScope(value.secondaryTargetScope);
  const enemyResults = parseEnemyAbilityResults(value.enemyResults);
  const allyResults = parseAllyAbilityResults(value.allyResults);
  const fumble = parsePlayerAbilityFumbleSummary(value.fumble);
  const enemyActions = parseEnemyTurnSummaries(value.enemyActions);
  const enemyPressureSkips = parseEnemyPressureSkipSummaries(value.enemyPressureSkips);
  const satedRecovery = parseSatedRecovery(value.satedRecovery);
  const itemResponse = parseCombatItemResponse(value.itemResponse);

  if (
    !action ||
    !heroOutcome ||
    heroDamage === null ||
    monsterDamage === null ||
    manaSpent === null ||
    typeof value.critical !== "boolean"
  ) {
    return null;
  }

  return {
    action,
    ...(actionOrigin ? { actionOrigin } : {}),
    heroOutcome,
    ...(monsterOutcome ? { monsterOutcome } : {}),
    heroDamage,
    monsterDamage,
    ...(heroEffectDamage !== null ? { heroEffectDamage } : {}),
    manaSpent,
    critical: value.critical,
    ...(typeof value.skillId === "string" ? { skillId: value.skillId } : {}),
    ...(abilitySource ? { abilitySource } : {}),
    ...(targetScope ? { targetScope } : {}),
    ...(secondaryTargetScope ? { secondaryTargetScope } : {}),
    ...(damageKind ? { damageKind } : {}),
    ...(monsterAction ? { monsterAction } : {}),
    ...(typeof value.monsterSkillId === "string" ? { monsterSkillId: value.monsterSkillId } : {}),
    ...(monsterDamageKind ? { monsterDamageKind } : {}),
    ...(typeof value.monsterEffectText === "string" ? { monsterEffectText: value.monsterEffectText } : {}),
    ...(typeof value.monsterTelegraphAbilityId === "string" ? { monsterTelegraphAbilityId: value.monsterTelegraphAbilityId } : {}),
    ...(typeof value.simultaneousFinalResponse === "boolean" ? { simultaneousFinalResponse: value.simultaneousFinalResponse } : {}),
    ...(heroCounterDamage !== null ? { heroCounterDamage } : {}),
    ...(typeof value.monsterBarkId === "string" ? { monsterBarkId: value.monsterBarkId } : {}),
    ...(typeof value.itemId === "string" ? { itemId: value.itemId } : {}),
    ...(typeof value.itemName === "string" ? { itemName: value.itemName } : {}),
    ...(heroHealing !== null ? { heroHealing } : {}),
    ...(heroManaRestored !== null ? { heroManaRestored } : {}),
    ...(enemyResults.length > 0 ? { enemyResults } : {}),
    ...(allyResults.length > 0 ? { allyResults } : {}),
    ...(fumble ? { fumble } : {}),
    ...(enemyActions.length > 0 ? { enemyActions } : {}),
    ...(enemyPressureSkips.length > 0 ? { enemyPressureSkips } : {}),
    ...(itemResponse ? { itemResponse } : {}),
    ...(debugTrace ? { debugTrace } : {}),
    ...(satedRecovery ? { satedRecovery } : {})
  };
}

function parseCombatItemResponse(
  value: unknown
): NonNullable<CombatTurnSummary["itemResponse"]> | null {
  if (!isRecord(value) || typeof value.enemyId !== "string" || typeof value.monsterId !== "string") {
    return null;
  }
  if (value.kind !== "guard" && value.kind !== "evade") {
    return null;
  }
  const damageAfter = intOrNull(value.damageAfter);
  const preventedDamage = intOrNull(value.preventedDamage);
  if (damageAfter === null) {
    return null;
  }
  return {
    enemyId: value.enemyId,
    monsterId: value.monsterId,
    ...(typeof value.monsterName === "string" ? { monsterName: value.monsterName } : {}),
    kind: value.kind,
    damageAfter,
    ...(preventedDamage !== null ? { preventedDamage } : {})
  };
}

async function releaseSoloCombatLease(
  tx: TxClient,
  input: {
    sessionId: string;
    state: CombatState | null;
    releasedAt: Date;
  }
): Promise<boolean> {
  const lease = await tx.activeCombatLease.findFirst({
    where: {
      kind: SOLO_COMBAT_LEASE_KIND,
      referenceId: input.sessionId
    },
    select: {
      id: true,
      characterId: true,
      kind: true,
      referenceId: true,
      createdAt: true,
      updatedAt: true
    }
  });
  if (!lease) {
    return false;
  }

  return releaseCombatLeaseWithTimedStatuses({
    tx,
    lease,
    releasedAt: input.releasedAt,
    ...(input.state?.varenykSated ? { sated: input.state.varenykSated } : {}),
    ...(input.state?.bardInspiration ? { inspiration: input.state.bardInspiration } : {})
  });
}

function getSatedLeaseThrough(input: UpdateSoloCombatSessionInput): Date {
  const completedAt = input.state.completedAt;
  return input.satedLeaseAt ??
    (completedAt ? new Date(completedAt) : new Date(input.state.varenykSated?.cursorAt ?? 0));
}

function parseSatedRecovery(value: unknown): CombatTurnSummary["satedRecovery"] | null {
  if (!isRecord(value)) {
    return null;
  }
  const hpRestored = intOrNull(value.hpRestored);
  const manaRestored = intOrNull(value.manaRestored);
  return hpRestored !== null && hpRestored >= 0 && manaRestored !== null && manaRestored >= 0
    ? { hpRestored, manaRestored }
    : null;
}

function parsePlayerAbilityFumbleSummary(value: unknown): CombatTurnSummary["fumble"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const abilityId = typeof value.abilityId === "string" && value.abilityId.length > 0 && value.abilityId.length <= 128
    ? value.abilityId
    : null;
  const line = typeof value.line === "string" && value.line.trim().length > 0 && value.line.length <= 240
    ? value.line
    : null;
  const selfDamage = intOrNull(value.selfDamage);
  const enemyHealing = intOrNull(value.enemyHealing);

  if (!abilityId || !line) {
    return null;
  }

  if (value.kind === "self-damage" && selfDamage !== null && selfDamage > 0) {
    return { abilityId, kind: "self-damage", line, selfDamage };
  }

  if (value.kind === "enemy-heal" && enemyHealing !== null && enemyHealing >= 0) {
    return { abilityId, kind: "enemy-heal", line, enemyHealing };
  }

  return null;
}

function parseEnemyAbilityResults(value: unknown): NonNullable<CombatTurnSummary["enemyResults"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.enemyId !== "string" || typeof entry.monsterId !== "string") {
      return [];
    }

    const damage = intOrNull(entry.damage);
    const outcome = parseTurnOutcome(entry.outcome);

    if (
      damage === null ||
      (outcome !== "hit" && outcome !== "critical-hit" && outcome !== "miss" && outcome !== "won")
    ) {
      return [];
    }

    return [{
      enemyId: entry.enemyId,
      monsterId: entry.monsterId,
      ...(typeof entry.monsterName === "string" ? { monsterName: entry.monsterName } : {}),
      damage,
      outcome,
      ...(entry.critical === true ? { critical: true } : {})
    }];
  });
}

function parseAllyAbilityResults(value: unknown): NonNullable<CombatTurnSummary["allyResults"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.targetId !== "string") {
      return [];
    }

    const healing = intOrNull(entry.healing);
    const guard = intOrNull(entry.guard);

    if ((healing === null || healing <= 0) && (guard === null || guard <= 0)) {
      return [];
    }

    return [{
      targetId: entry.targetId,
      ...(typeof entry.label === "string" ? { label: entry.label } : {}),
      ...(healing !== null && healing > 0 ? { healing } : {}),
      ...(guard !== null && guard > 0 ? { guard } : {})
    }];
  });
}

function parseEnemyTurnSummaries(value: unknown): CombatEnemyTurnSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.enemyId !== "string" || typeof entry.monsterId !== "string") {
      return [];
    }

    const monsterOutcome = parseTurnOutcome(entry.monsterOutcome);
    const monsterDamage = intOrNull(entry.monsterDamage);
    const monsterAction = parseMonsterAction(entry.monsterAction);
    const monsterDamageKind = parseDamageKind(entry.monsterDamageKind);

    return monsterDamage === null
      ? []
      : [{
          enemyId: entry.enemyId,
          monsterId: entry.monsterId,
          ...(typeof entry.monsterName === "string" ? { monsterName: entry.monsterName } : {}),
          ...(monsterOutcome ? { monsterOutcome } : {}),
          monsterDamage,
          ...(monsterAction ? { monsterAction } : {}),
          ...(typeof entry.monsterSkillId === "string" ? { monsterSkillId: entry.monsterSkillId } : {}),
          ...(monsterDamageKind ? { monsterDamageKind } : {}),
          ...(typeof entry.monsterEffectText === "string" ? { monsterEffectText: entry.monsterEffectText } : {}),
          ...(typeof entry.monsterTelegraphAbilityId === "string" ? { monsterTelegraphAbilityId: entry.monsterTelegraphAbilityId } : {}),
          ...(typeof entry.simultaneousFinalResponse === "boolean" ? { simultaneousFinalResponse: entry.simultaneousFinalResponse } : {})
        }];
  });
}

function parseEnemyPressureSkipSummaries(value: unknown): NonNullable<CombatTurnSummary["enemyPressureSkips"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.enemyId !== "string" || typeof entry.monsterId !== "string") {
      return [];
    }

    return [{
      enemyId: entry.enemyId,
      monsterId: entry.monsterId,
      ...(typeof entry.monsterName === "string" ? { monsterName: entry.monsterName } : {})
    }];
  });
}

function parseTurnLog(value: unknown): CombatTurnLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const turn = intOrNull(entry.turn);
    const summary = parseTurnSummary(entry.summary);
    const hero = parseTurnLogHero(entry.hero);
    const monster = parseTurnLogMonster(entry.monster);
    const enemies = parseTurnLogEnemies(entry.enemies);
    const eventId = parseTurnLogEventId(entry.eventId);
    const notices = parseTurnLogNotices(entry.notices);
    const cooldowns = parseCooldowns(entry.cooldowns);
    const varenykSated = parseVarenykSatedCombatState(entry.varenykSated);
    const bardInspiration = parseBardInspirationCombatState(entry.bardInspiration);

    return turn === null || turn < 1 || !summary || !hero || !monster
      ? []
      : [{
          ...(eventId ? { eventId } : {}),
          turn,
          summary,
          ...(notices.length > 0 ? { notices } : {}),
          ...(cooldowns ? { cooldowns } : {}),
          hero,
          monster,
          ...(enemies.length > 0 ? { enemies } : {}),
          ...(varenykSated ? { varenykSated } : {}),
          ...(bardInspiration ? { bardInspiration } : {})
        }];
  });
}

function parseTurnLogNotices(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string =>
    typeof entry === "string" && entry.trim().length > 0 && entry.length <= 240
  );
}

function parseTurnLogEnemies(value: unknown): NonNullable<CombatTurnLogEntry["enemies"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.enemyId !== "string") {
      return [];
    }

    const hp = intOrNull(entry.hp);

    return hp === null ? [] : [{ enemyId: entry.enemyId, hp }];
  });
}

function parseTurnLogEventId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 80
    ? value
    : null;
}

function parseTurnLogHero(value: unknown): CombatTurnLogEntry["hero"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const hp = intOrNull(value.hp);
  const mana = intOrNull(value.mana);

  return hp === null || mana === null ? null : { hp, mana };
}

function parseTurnLogMonster(value: unknown): CombatTurnLogEntry["monster"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const hp = intOrNull(value.hp);

  return hp === null ? null : { hp };
}

function parseCombatAction(value: unknown): CombatActionType | null {
  return value === "attack" ||
    value === "defend" ||
    value === "skill" ||
    value === "race" ||
    value === "gear" ||
    value === "flee" ||
    value === "skip" ||
    value === "item"
    ? value
    : null;
}

function parseMonsterAction(value: unknown): CombatTurnSummary["monsterAction"] | null {
  return value === "attack" || value === "skill" || value === "defend" || value === "telegraph"
    ? value
    : null;
}

function parseActionOrigin(value: unknown): CombatTurnSummary["actionOrigin"] | null {
  return value === "manual" ||
    value === "timeout-auto-attack" ||
    value === "timeout-auto-defend" ||
    value === "timeout-skip"
    ? value
    : null;
}

function parseTurnOutcome(value: unknown): CombatTurnOutcome | null {
  return (
    value === "hit" ||
    value === "critical-hit" ||
    value === "miss" ||
    value === "defended" ||
    value === "not-enough-mana" ||
    value === "skill-on-cooldown" ||
    value === "critical-fumble" ||
    value === "item-used" ||
    value === "inactive" ||
    value === "fled" ||
    value === "flee-failed" ||
    value === "won" ||
    value === "lost"
  )
    ? value
    : null;
}

function parseDamageKind(value: unknown): CombatDamageKind | null {
  return value === "physical" || value === "spell" || value === "social" || value === "trick"
    ? value
    : null;
}

function parseAbilitySource(value: unknown): CombatTurnSummary["abilitySource"] | null {
  return value === "basic" ||
    value === "class" ||
    value === "race" ||
    value === "equipment" ||
    value === "signature" ||
    value === "monster"
    ? value
    : null;
}

function parseTargetScope(value: unknown): CombatTurnSummary["targetScope"] | null {
  return value === "self" ||
    value === "single-enemy" ||
    value === "lowest-hp-enemy" ||
    value === "all-enemies" ||
    value === "single-ally-or-self" ||
    value === "all-allies-including-self" ||
    value === "lowest-hp-ally"
    ? value
    : null;
}

async function getCombatItemReservedItemIds(
  tx: TxClient,
  characterId: string,
  now: Date,
  options: { includeItemUseReservations?: boolean } = {}
): Promise<string[]> {
  const [pendingChestRuns, pendingLevelBarters, pendingSales, pendingTransfers, pendingUses] = await Promise.all([
    tx.mantokChestRun.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.levelBarterExchange.findMany({
      where: { characterId, status: "pending" },
      select: { inputItemsJson: true }
    }),
    tx.korchmaMantokSale.findMany({
      where: {
        characterId,
        status: { in: ["pending", "processing"] },
        expiresAt: { gt: now }
      },
      select: { selectionJson: true }
    }),
    findActiveTransferReservedItems(tx, { senderCharacterId: characterId, now }),
    options.includeItemUseReservations === false
      ? Promise.resolve([])
      : findActiveItemUseReservedItems(tx, { characterId, now })
  ]);
  const reserved = new Set<string>();

  for (const run of pendingChestRuns) {
    for (const item of parseCombatReservedItems(run.inputItemsJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const exchange of pendingLevelBarters) {
    for (const item of parseCombatReservedItems(exchange.inputItemsJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const sale of pendingSales) {
    for (const item of parseCombatReservedItems(sale.selectionJson)) {
      reserved.add(item.itemId);
    }
  }
  for (const transfer of pendingTransfers) {
    reserved.add(transfer.itemId);
  }
  for (const use of pendingUses) {
    reserved.add(use.itemId);
  }

  return [...reserved];
}

async function cancelPendingCombatItemUseOrders(
  tx: Prisma.TransactionClient,
  characterId: string,
  itemId: string,
  now: Date
): Promise<void> {
  await tx.itemUseOrder.updateMany({
    where: {
      characterId,
      itemId,
      status: { in: ["pending", "processing"] },
      expiresAt: { gt: now }
    },
    data: {
      status: "cancelled",
      reservationKey: null,
      cancelledAt: now,
      resultJson: {
        kind: "cancelled",
        itemId
      },
      updatedAt: now
    }
  });
}

function parseCombatReservedItems(value: unknown): Array<{ itemId: string; quantity: number }> {
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

function parseGuardState(value: unknown): CombatState["guard"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const consecutiveDefends = intOrNull(value.consecutiveDefends);
  const abilityDamageReduction = intOrNull(value.abilityDamageReduction);

  return consecutiveDefends === null || consecutiveDefends < 0
    ? null
    : {
        consecutiveDefends,
        ...(abilityDamageReduction !== null && abilityDamageReduction > 0 ? { abilityDamageReduction } : {})
      };
}

function parseCopiedEquipment(value: unknown): CombatCopiedEquipment[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const copiedEquipment = value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.sourceItemId !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.slot !== "string"
    ) {
      return [];
    }

    return [{
      sourceItemId: entry.sourceItemId,
      name: entry.name,
      slot: entry.slot,
      effectKeys: parseStringArray(entry.effectKeys)
    }];
  });

  return copiedEquipment.length > 0 ? copiedEquipment : null;
}

function parseCombatDebugTrace(value: unknown): CombatDebugTrace | null {
  if (!isRecord(value)) {
    return null;
  }

  const source = value.source === "target" || value.source === "random-build" || value.source === "champion-fallback"
    ? value.source
    : null;
  const interventionKind = value.interventionKind === "help" || value.interventionKind === "none" || value.interventionKind === "hinder"
    ? value.interventionKind
    : null;
  const timeoutMode = value.timeoutMode === "auto-attack" ||
    value.timeoutMode === "auto-defend" ||
    value.timeoutMode === "skip"
    ? value.timeoutMode
    : null;
  const copiedEquipmentCount = intOrNull(value.copiedEquipmentCount);
  const baseMonsterLevel = intOrNull(value.baseMonsterLevel);
  const effectiveMonsterLevel = intOrNull(value.effectiveMonsterLevel);
  const trace: CombatDebugTrace = {
    ...(typeof value.spawnMode === "string" ? { spawnMode: value.spawnMode } : {}),
    ...(source ? { source } : {}),
    ...(typeof value.championPeriod === "string" ? { championPeriod: value.championPeriod } : {}),
    ...(typeof value.championName === "string" ? { championName: value.championName } : {}),
    ...(copiedEquipmentCount !== null ? { copiedEquipmentCount } : {}),
    ...(Array.isArray(value.appliedEffectKeys)
      ? { appliedEffectKeys: parseStringArray(value.appliedEffectKeys) }
      : {}),
    ...(Array.isArray(value.legalAbilityIds)
      ? { legalAbilityIds: parseStringArray(value.legalAbilityIds) }
      : {}),
    ...(typeof value.chosenAbilityId === "string" ? { chosenAbilityId: value.chosenAbilityId } : {}),
    ...(typeof value.lineId === "string" ? { lineId: value.lineId } : {}),
    ...(typeof value.lineCategory === "string" ? { lineCategory: value.lineCategory } : {}),
    ...(interventionKind ? { interventionKind } : {}),
    ...(typeof value.interventionSourceKey === "string" ? { interventionSourceKey: value.interventionSourceKey } : {}),
    ...(baseMonsterLevel !== null ? { baseMonsterLevel } : {}),
    ...(effectiveMonsterLevel !== null ? { effectiveMonsterLevel } : {}),
    ...(typeof value.contextRulesVersion === "string" ? { contextRulesVersion: value.contextRulesVersion } : {}),
    ...(Array.isArray(value.contextTraitIds)
      ? { contextTraitIds: parseStringArray(value.contextTraitIds) }
      : {}),
    ...(Array.isArray(value.contextBranchIds)
      ? { contextBranchIds: parseStringArray(value.contextBranchIds) }
      : {}),
    ...(typeof value.contextCueId === "string" ? { contextCueId: value.contextCueId } : {}),
    ...(timeoutMode ? { timeoutMode } : {})
  };

  return Object.keys(trace).length > 0 ? trace : null;
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

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
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

function isSoloCombatSessionRecord(value: unknown): value is SoloCombatSessionRecord {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.characterId === "string" &&
    "state" in value &&
    "reward" in value;
}

function isPrismaNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isActiveCombatLeaseUniqueConflict(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = error.meta?.target;

  if (Array.isArray(target)) {
    return target.includes("characterId") || target.includes("character_id");
  }

  return typeof target === "string" &&
    (target.includes("active_combat_leases") || target.includes("character_id"));
}

function hasTransaction(prisma: PrismaClient): boolean {
  return typeof (prisma as { $transaction?: unknown }).$transaction === "function";
}
