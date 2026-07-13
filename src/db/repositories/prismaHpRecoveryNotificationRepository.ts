import { Prisma, type PrismaClient } from "@prisma/client";
import {
  EQUIPMENT_ATTUNEMENT_ACTION_KEY,
  MAX_EQUIPMENT_ATTUNEMENT_MS
} from "../../domain/equipment/equipmentAttunement";
import {
  HP_RECOVERY_NOTIFICATION_MAX_DELIVERY_ATTEMPTS,
  type HpRecoveryNotificationRepository,
  type HpRecoverySnapshot,
  type ClaimedHpRecoveryNotification,
  type HpRecoveryNotificationRecord,
  type RebaseHpRecoveryInput
} from "./hpRecoveryNotificationRepository";
import { evaluateCanonicalHpRecovery } from "../../domain/resources/canonicalHpRecovery";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";

const DEFAULT_CHECKING_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_SENDING_LEASE_MS = 13 * 60 * 1000;
export const HP_RECOVERY_ATTUNEMENT_HISTORY_TOLERANCE_MS = 2 * 60 * 1000;

class HpRecoveryReadyRace extends Error {}

export const BOUNDED_HP_RECOVERY_CANDIDATE_SQL = `
SELECT * FROM (
  SELECT * FROM (
    SELECT
      id, character_id AS characterId, generation, remort_count AS remortCount,
      source_hp_current AS sourceHpCurrent, source_hp_max AS sourceHpMax,
      source_hp_regen_at AS sourceHpRegenAt, source_fingerprint AS sourceFingerprint,
      status, next_attempt_at AS nextAttemptAt, processing_started_at AS processingStartedAt,
      ready_at AS readyAt, sent_at AS sentAt, suppressed_at AS suppressedAt,
      attempt_count AS attemptCount, last_error_code AS lastErrorCode,
      created_at AS createdAt, updated_at AS updatedAt, next_attempt_at AS dueAt
    FROM hp_recovery_notifications
      INDEXED BY hp_recovery_notifications_status_next_attempt_at_idx
    WHERE status = 'waiting' AND next_attempt_at <= ?
    ORDER BY next_attempt_at, updated_at, id
    LIMIT ?
  ) AS waiting_due
  UNION ALL
  SELECT * FROM (
    SELECT
      id, character_id AS characterId, generation, remort_count AS remortCount,
      source_hp_current AS sourceHpCurrent, source_hp_max AS sourceHpMax,
      source_hp_regen_at AS sourceHpRegenAt, source_fingerprint AS sourceFingerprint,
      status, next_attempt_at AS nextAttemptAt, processing_started_at AS processingStartedAt,
      ready_at AS readyAt, sent_at AS sentAt, suppressed_at AS suppressedAt,
      attempt_count AS attemptCount, last_error_code AS lastErrorCode,
      created_at AS createdAt, updated_at AS updatedAt, next_attempt_at AS dueAt
    FROM hp_recovery_notifications
      INDEXED BY hp_recovery_notifications_status_next_attempt_at_idx
    WHERE status = 'ready' AND next_attempt_at <= ?
    ORDER BY next_attempt_at, updated_at, id
    LIMIT ?
  ) AS ready_due
  UNION ALL
  SELECT * FROM (
    SELECT
      id, character_id AS characterId, generation, remort_count AS remortCount,
      source_hp_current AS sourceHpCurrent, source_hp_max AS sourceHpMax,
      source_hp_regen_at AS sourceHpRegenAt, source_fingerprint AS sourceFingerprint,
      status, next_attempt_at AS nextAttemptAt, processing_started_at AS processingStartedAt,
      ready_at AS readyAt, sent_at AS sentAt, suppressed_at AS suppressedAt,
      attempt_count AS attemptCount, last_error_code AS lastErrorCode,
      created_at AS createdAt, updated_at AS updatedAt, processing_started_at AS dueAt
    FROM hp_recovery_notifications
      INDEXED BY hp_recovery_notifications_status_processing_started_at_idx
    WHERE status = 'checking' AND processing_started_at <= ?
    ORDER BY processing_started_at, updated_at, id
    LIMIT ?
  ) AS stale_checking
  UNION ALL
  SELECT * FROM (
    SELECT
      id, character_id AS characterId, generation, remort_count AS remortCount,
      source_hp_current AS sourceHpCurrent, source_hp_max AS sourceHpMax,
      source_hp_regen_at AS sourceHpRegenAt, source_fingerprint AS sourceFingerprint,
      status, next_attempt_at AS nextAttemptAt, processing_started_at AS processingStartedAt,
      ready_at AS readyAt, sent_at AS sentAt, suppressed_at AS suppressedAt,
      attempt_count AS attemptCount, last_error_code AS lastErrorCode,
      created_at AS createdAt, updated_at AS updatedAt, processing_started_at AS dueAt
    FROM hp_recovery_notifications
      INDEXED BY hp_recovery_notifications_status_processing_started_at_idx
    WHERE status = 'sending' AND processing_started_at <= ?
    ORDER BY processing_started_at, updated_at, id
    LIMIT ?
  ) AS stale_sending
) AS bounded_candidates
ORDER BY dueAt, updatedAt, id
LIMIT ?`;

export class PrismaHpRecoveryNotificationRepository implements HpRecoveryNotificationRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly producer: HpRecoveryNotificationProducer
  ) {}

  async claimDue(
    now: Date,
    options: { limit?: number; checkingLeaseMs?: number; sendingLeaseMs?: number } = {}
  ): Promise<ClaimedHpRecoveryNotification[]> {
    const limit = Math.max(1, Math.floor(options.limit ?? 13));
    const staleCheckingAt = new Date(now.getTime() - (options.checkingLeaseMs ?? DEFAULT_CHECKING_LEASE_MS));
    const staleSendingAt = new Date(now.getTime() - (options.sendingLeaseMs ?? DEFAULT_SENDING_LEASE_MS));
    const rows = (await this.prisma.$queryRawUnsafe<RawHpRecoveryCandidate[]>(
      BOUNDED_HP_RECOVERY_CANDIDATE_SQL,
      now,
      limit,
      now,
      limit,
      staleCheckingAt,
      limit,
      staleSendingAt,
      limit,
      limit
    )).map(normalizeRawCandidate);
    const claimed: ClaimedHpRecoveryNotification[] = [];

    for (const row of rows) {
      if (row.status === "sending") {
        const suppressed = await this.prisma.hpRecoveryNotification.updateMany({
          where: {
            id: row.id,
            generation: row.generation,
            status: "sending",
            processingStartedAt: row.processingStartedAt
          },
          data: {
            status: "suppressed",
            suppressedAt: now,
            processingStartedAt: null,
            lastErrorCode: "ambiguous-send-crash"
          }
        });
        if (suppressed.count === 1) {
          claimed.push({ ...toRecord(row), claim: "suppressed-stale-send", claimStartedAt: null });
        }
        continue;
      }

      if (row.status === "ready") {
        claimed.push({ ...toRecord(row), claim: "ready", claimStartedAt: null });
        continue;
      }

      const updated = await this.prisma.hpRecoveryNotification.updateMany({
        where: {
          id: row.id,
          generation: row.generation,
          status: row.status,
          ...(row.status === "checking"
            ? { processingStartedAt: row.processingStartedAt }
            : { nextAttemptAt: row.nextAttemptAt })
        },
        data: {
          status: "checking",
          processingStartedAt: now,
          lastErrorCode: null
        }
      });
      if (updated.count === 1) {
        claimed.push({
          ...toRecord({ ...row, status: "checking", processingStartedAt: now }),
          claim: "checking",
          claimStartedAt: now
        });
      }
    }

    return claimed;
  }

  async loadSnapshots(characterIds: string[], now: Date): Promise<HpRecoverySnapshot[]> {
    return loadSnapshotsWithClient(this.prisma, characterIds, now);
  }

  async rebase(input: RebaseHpRecoveryInput): Promise<boolean> {
    const updated = await this.prisma.hpRecoveryNotification.updateMany({
      where: {
        characterId: input.characterId,
        generation: input.generation,
        remortCount: input.remortCount,
        status: "checking",
        processingStartedAt: input.claimStartedAt
      },
      data: {
        sourceHpCurrent: input.sourceHpCurrent,
        sourceHpMax: input.sourceHpMax,
        sourceHpRegenAt: input.sourceHpRegenAt,
        sourceFingerprint: input.sourceFingerprint,
        status: "waiting",
        nextAttemptAt: input.nextAttemptAt,
        processingStartedAt: null,
        lastErrorCode: null
      }
    });
    return updated.count === 1;
  }

  async suppressChecking(input: {
    characterId: string;
    generation: number;
    remortCount: number;
    claimStartedAt: Date;
    now: Date;
    errorCode?: string;
  }): Promise<boolean> {
    const updated = await this.prisma.hpRecoveryNotification.updateMany({
      where: {
        characterId: input.characterId,
        generation: input.generation,
        remortCount: input.remortCount,
        status: "checking",
        processingStartedAt: input.claimStartedAt
      },
      data: {
        status: "suppressed",
        suppressedAt: input.now,
        processingStartedAt: null,
        lastErrorCode: input.errorCode ?? null
      }
    });
    return updated.count === 1;
  }

  async suppressReady(
    characterId: string,
    generation: number,
    now: Date,
    errorCode?: string
  ): Promise<boolean> {
    const updated = await this.prisma.hpRecoveryNotification.updateMany({
      where: { characterId, generation, status: "ready" },
      data: {
        status: "suppressed",
        suppressedAt: now,
        processingStartedAt: null,
        lastErrorCode: errorCode ?? null
      }
    });
    return updated.count === 1;
  }

  async finalizeChecking(
    notification: Extract<ClaimedHpRecoveryNotification, { claim: "checking" }>,
    now: Date
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [current] = await loadSnapshotsWithClient(tx, [notification.characterId], now);
        if (!current || current.remortCount !== notification.remortCount) {
          const suppressed = await suppressCheckingWithClient(tx, notification, now, "life-changed");
          return { state: suppressed ? "suppressed" as const : "lost" as const };
        }

        const canonical = evaluateCanonicalHpRecovery(current, now);
        if (current.activeCombatLease) {
          const rebased = await rebaseCheckingWithClient(
            tx,
            notification,
            current,
            canonical.fingerprint,
            new Date(now.getTime() + 60_000)
          );
          return { state: rebased ? "rebased" as const : "lost" as const };
        }

        if (canonical.summary.hpCurrent >= canonical.summary.hpMax) {
          if (canonical.pendingAttunementReadyAt) {
            const rebased = await rebaseCheckingWithClient(
              tx,
              notification,
              current,
              canonical.fingerprint,
              canonical.pendingAttunementReadyAt
            );
            return { state: rebased ? "rebased" as const : "lost" as const };
          }
          const suppressed = await suppressCheckingWithClient(tx, notification, now, "full-outside-worker");
          return { state: suppressed ? "suppressed" as const : "lost" as const };
        }

        const sourceChanged =
          current.hpCurrent !== notification.sourceHpCurrent ||
          current.hpMax !== notification.sourceHpMax ||
          !datesEqual(current.hpRegenAt, notification.sourceHpRegenAt) ||
          (notification.sourceFingerprint !== null && notification.sourceFingerprint !== canonical.fingerprint);
        if (sourceChanged || canonical.regeneration.resources.hpCurrent < canonical.regeneration.resources.hpMax) {
          const rebased = await rebaseCheckingWithClient(
            tx,
            notification,
            current,
            canonical.fingerprint,
            canonical.regeneration.recovery.hpFullAt ?? new Date(now.getTime() + 60_000)
          );
          return { state: rebased ? "rebased" as const : "lost" as const };
        }

        const guarded = await tx.hpRecoveryNotification.updateMany({
          where: {
            characterId: notification.characterId,
            generation: notification.generation,
            remortCount: notification.remortCount,
            status: "checking",
            processingStartedAt: notification.claimStartedAt,
            sourceHpCurrent: notification.sourceHpCurrent,
            sourceHpMax: notification.sourceHpMax,
            sourceHpRegenAt: sameNullableDate(notification.sourceHpRegenAt)
          },
          data: {
            status: "ready",
            readyAt: now,
            nextAttemptAt: now,
            processingStartedAt: null,
            sourceHpCurrent: canonical.regeneration.resources.hpMax,
            sourceHpRegenAt: now,
            sourceFingerprint: canonical.fingerprint
          }
        });
        if (guarded.count !== 1) {
          return { state: "lost" as const };
        }

        const character = await tx.character.updateMany({
          where: {
            id: notification.characterId,
            hpCurrent: notification.sourceHpCurrent,
            hpRegenAt: sameNullableDate(notification.sourceHpRegenAt)
          },
          data: {
            hpCurrent: canonical.regeneration.resources.hpMax,
            hpRegenAt: now
          }
        });
        if (character.count !== 1) {
          throw new HpRecoveryReadyRace();
        }
        return {
          state: "ready" as const,
          notification: {
            ...notification,
            status: "ready" as const,
            sourceHpCurrent: canonical.regeneration.resources.hpMax,
            sourceHpRegenAt: now,
            sourceFingerprint: canonical.fingerprint,
            readyAt: now,
            nextAttemptAt: now,
            processingStartedAt: null,
            claim: "ready" as const,
            claimStartedAt: null
          }
        };
      });
    } catch (error) {
      if (error instanceof HpRecoveryReadyRace) {
        return { state: "lost" as const };
      }
      throw error;
    }
  }

  async claimReadyForSending(
    notification: Extract<ClaimedHpRecoveryNotification, { claim: "ready" }>,
    now: Date
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (notification.attemptCount >= HP_RECOVERY_NOTIFICATION_MAX_DELIVERY_ATTEMPTS) {
        const suppressed = await suppressReady(
          tx,
          notification.characterId,
          notification.generation,
          now,
          "delivery-attempts-exhausted",
          notification.attemptCount
        );
        return { state: suppressed ? "suppressed" as const : "lost" as const };
      }

      const [snapshot] = await loadSnapshotsWithClient(tx, [notification.characterId], now);
      if (!snapshot || snapshot.remortCount !== notification.remortCount) {
        const suppressed = await suppressReady(
          tx,
          notification.characterId,
          notification.generation,
          now,
          "life-changed",
          notification.attemptCount
        );
        return { state: suppressed ? "suppressed" as const : "lost" as const };
      }
      if (snapshot.activeCombatLease) {
        const deferred = await tx.hpRecoveryNotification.updateMany({
          where: {
            characterId: notification.characterId,
            generation: notification.generation,
            status: "ready",
            attemptCount: notification.attemptCount
          },
          data: { nextAttemptAt: new Date(now.getTime() + 60_000) }
        });
        return { state: deferred.count === 1 ? "deferred" as const : "lost" as const };
      }
      const canonical = evaluateCanonicalHpRecovery(snapshot, now);
      if (
        snapshot.hpCurrent !== notification.sourceHpCurrent ||
        snapshot.hpCurrent !== canonical.summary.hpMax ||
        !datesEqual(snapshot.hpRegenAt, notification.sourceHpRegenAt)
      ) {
        const suppressed = await suppressReady(
          tx,
          notification.characterId,
          notification.generation,
          now,
          "resource-changed",
          notification.attemptCount
        );
        return { state: suppressed ? "suppressed" as const : "lost" as const };
      }
      if (snapshot.lastActionAt && notification.readyAt && snapshot.lastActionAt > notification.readyAt) {
        const suppressed = await suppressReady(
          tx,
          notification.characterId,
          notification.generation,
          now,
          "active-after-ready",
          notification.attemptCount
        );
        return { state: suppressed ? "suppressed" as const : "lost" as const };
      }
      if (!notification.sourceFingerprint || canonical.fingerprint !== notification.sourceFingerprint) {
        const suppressed = await suppressReady(
          tx,
          notification.characterId,
          notification.generation,
          now,
          "effective-state-changed",
          notification.attemptCount
        );
        return { state: suppressed ? "suppressed" as const : "lost" as const };
      }

      const updated = await tx.hpRecoveryNotification.updateMany({
        where: {
          characterId: notification.characterId,
          generation: notification.generation,
          remortCount: notification.remortCount,
          status: "ready",
          sourceHpCurrent: notification.sourceHpCurrent,
          sourceHpRegenAt: sameNullableDate(notification.sourceHpRegenAt),
          sourceFingerprint: notification.sourceFingerprint,
          attemptCount: notification.attemptCount
        },
        data: {
          status: "sending",
          processingStartedAt: now,
          attemptCount: { increment: 1 },
          lastErrorCode: null
        }
      });
      return updated.count === 1
        ? {
            state: "claimed" as const,
            telegramUserId: snapshot.telegramUserId,
            attemptCount: notification.attemptCount + 1
          }
        : { state: "lost" as const };
    });
  }

  async markSent(characterId: string, generation: number, now: Date): Promise<boolean> {
    const updated = await this.prisma.hpRecoveryNotification.updateMany({
      where: { characterId, generation, status: "sending" },
      data: { status: "sent", sentAt: now, processingStartedAt: null }
    });
    return updated.count === 1;
  }

  async retrySending(
    characterId: string,
    generation: number,
    nextAttemptAt: Date,
    errorCode: string
  ): Promise<boolean> {
    const updated = await this.prisma.hpRecoveryNotification.updateMany({
      where: { characterId, generation, status: "sending" },
      data: {
        status: "ready",
        nextAttemptAt,
        processingStartedAt: null,
        lastErrorCode: sanitizeErrorCode(errorCode)
      }
    });
    return updated.count === 1;
  }

  async suppressSending(
    characterId: string,
    generation: number,
    now: Date,
    errorCode: string
  ): Promise<boolean> {
    const updated = await this.prisma.hpRecoveryNotification.updateMany({
      where: { characterId, generation, status: "sending" },
      data: {
        status: "suppressed",
        suppressedAt: now,
        processingStartedAt: null,
        lastErrorCode: sanitizeErrorCode(errorCode)
      }
    });
    return updated.count === 1;
  }

  async prepareDueForTelegramUser(telegramUserId: bigint, now: Date): Promise<boolean> {
    if (!this.producer.isEnabled()) {
      return false;
    }

    return this.prisma.$transaction(async (tx) => {
      const character = await tx.character.findFirst({
        where: { user: { telegramUserId } },
        select: { id: true, hpCurrent: true }
      });
      if (!character) {
        return false;
      }
      const anchor = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      await tx.character.update({
        where: { id: character.id },
        data: { hpCurrent: Math.max(0, character.hpCurrent - 1), hpRegenAt: anchor }
      });
      await this.producer.record(tx, character.id, now, "recovering", { nextAttemptAt: now });
      return true;
    });
  }
}

async function loadSnapshotsWithClient(
  client: Pick<PrismaClient, "character">,
  characterIds: string[],
  now: Date
): Promise<HpRecoverySnapshot[]> {
  if (characterIds.length === 0) {
    return [];
  }
  const attunementCutoff = new Date(
    now.getTime() - MAX_EQUIPMENT_ATTUNEMENT_MS - HP_RECOVERY_ATTUNEMENT_HISTORY_TOLERANCE_MS
  );
  const rows = await client.character.findMany({
    where: { id: { in: [...new Set(characterIds)] } },
    select: {
      id: true,
      pronoun: true,
      path: true,
      raceId: true,
      classId: true,
      level: true,
      xp: true,
      hpCurrent: true,
      hpMax: true,
      hpRegenAt: true,
      statsJson: true,
      user: { select: { telegramUserId: true, lastActionAt: true } },
      _count: { select: { remorts: true } },
      activeCombatLease: { select: { kind: true, referenceId: true } },
      equipment: { select: { slot: true, itemId: true, updatedAt: true } },
      dailyActions: {
        where: {
          key: EQUIPMENT_ATTUNEMENT_ACTION_KEY,
          createdAt: { gte: attunementCutoff }
        },
        select: { resultJson: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      },
      drinkState: {
        select: {
          drinkKey: true,
          phase: true,
          startedAt: true,
          expiresAt: true,
          metadataJson: true
        }
      }
    }
  });

  return rows.map((row) => ({
    characterId: row.id,
    telegramUserId: row.user.telegramUserId,
    lastActionAt: row.user.lastActionAt,
    pronoun: row.pronoun,
    path: row.path,
    raceId: row.raceId,
    classId: row.classId,
    level: row.level,
    xp: row.xp,
    hpCurrent: row.hpCurrent,
    hpMax: row.hpMax,
    hpRegenAt: row.hpRegenAt,
    statsJson: row.statsJson,
    remortCount: row._count.remorts,
    activeCombatLease: row.activeCombatLease,
    equipment: row.equipment,
    attunementActions: row.dailyActions,
    recoveryDrink: row.drinkState
      ? {
          drinkKey: row.drinkState.drinkKey,
          phase: row.drinkState.phase,
          startedAt: row.drinkState.startedAt,
          expiresAt: row.drinkState.expiresAt,
          metadata: row.drinkState.metadataJson
        }
      : null
  }));
}

function toRecord(row: {
  characterId: string;
  generation: number;
  remortCount: number;
  sourceHpCurrent: number;
  sourceHpMax: number;
  sourceHpRegenAt: Date | null;
  sourceFingerprint: string | null;
  status: string;
  nextAttemptAt: Date;
  processingStartedAt: Date | null;
  readyAt: Date | null;
  sentAt: Date | null;
  suppressedAt: Date | null;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}): HpRecoveryNotificationRecord {
  return row as HpRecoveryNotificationRecord;
}

function sameNullableDate(value: Date | null): Date | null | { equals: Date } {
  return value ? { equals: value } : null;
}

function datesEqual(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

async function rebaseCheckingWithClient(
  tx: Prisma.TransactionClient,
  notification: Extract<ClaimedHpRecoveryNotification, { claim: "checking" }>,
  snapshot: HpRecoverySnapshot,
  sourceFingerprint: string,
  nextAttemptAt: Date
): Promise<boolean> {
  const updated = await tx.hpRecoveryNotification.updateMany({
    where: {
      characterId: notification.characterId,
      generation: notification.generation,
      remortCount: notification.remortCount,
      status: "checking",
      processingStartedAt: notification.claimStartedAt
    },
    data: {
      sourceHpCurrent: snapshot.hpCurrent,
      sourceHpMax: snapshot.hpMax,
      sourceHpRegenAt: snapshot.hpRegenAt,
      sourceFingerprint,
      status: "waiting",
      nextAttemptAt,
      processingStartedAt: null,
      lastErrorCode: null
    }
  });
  return updated.count === 1;
}

async function suppressCheckingWithClient(
  tx: Prisma.TransactionClient,
  notification: Extract<ClaimedHpRecoveryNotification, { claim: "checking" }>,
  now: Date,
  errorCode: string
): Promise<boolean> {
  const updated = await tx.hpRecoveryNotification.updateMany({
    where: {
      characterId: notification.characterId,
      generation: notification.generation,
      remortCount: notification.remortCount,
      status: "checking",
      processingStartedAt: notification.claimStartedAt
    },
    data: {
      status: "suppressed",
      suppressedAt: now,
      processingStartedAt: null,
      lastErrorCode: errorCode
    }
  });
  return updated.count === 1;
}

async function suppressReady(
  tx: Prisma.TransactionClient,
  characterId: string,
  generation: number,
  now: Date,
  errorCode: string,
  attemptCount?: number
): Promise<boolean> {
  const updated = await tx.hpRecoveryNotification.updateMany({
    where: {
      characterId,
      generation,
      status: "ready",
      ...(attemptCount === undefined ? {} : { attemptCount })
    },
    data: {
      status: "suppressed",
      suppressedAt: now,
      processingStartedAt: null,
      lastErrorCode: errorCode
    }
  });
  return updated.count === 1;
}

interface RawHpRecoveryCandidate {
  id: string;
  characterId: string;
  generation: number;
  remortCount: number;
  sourceHpCurrent: number;
  sourceHpMax: number;
  sourceHpRegenAt: Date | string | number | null;
  sourceFingerprint: string | null;
  status: string;
  nextAttemptAt: Date | string | number;
  processingStartedAt: Date | string | number | null;
  readyAt: Date | string | number | null;
  sentAt: Date | string | number | null;
  suppressedAt: Date | string | number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
  dueAt: Date | string | number;
}

function normalizeRawCandidate(row: RawHpRecoveryCandidate): RawHpRecoveryCandidate & HpRecoveryNotificationRecord {
  return {
    ...row,
    sourceHpRegenAt: toNullableDate(row.sourceHpRegenAt),
    nextAttemptAt: toDate(row.nextAttemptAt),
    processingStartedAt: toNullableDate(row.processingStartedAt),
    readyAt: toNullableDate(row.readyAt),
    sentAt: toNullableDate(row.sentAt),
    suppressedAt: toNullableDate(row.suppressedAt),
    createdAt: toDate(row.createdAt),
    updatedAt: toDate(row.updatedAt),
    dueAt: toDate(row.dueAt)
  } as RawHpRecoveryCandidate & HpRecoveryNotificationRecord;
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | number | null): Date | null {
  return value === null ? null : toDate(value);
}

function sanitizeErrorCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64) || "unknown";
}
