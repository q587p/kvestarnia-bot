import { Prisma, type PrismaClient } from "@prisma/client";
import {
  EQUIPMENT_ATTUNEMENT_ACTION_KEY,
  MAX_EQUIPMENT_ATTUNEMENT_MS
} from "../../domain/equipment/equipmentAttunement";
import {
  buildHpRecoveryStateFingerprint,
  type HpRecoveryNotificationRepository,
  type HpRecoverySnapshot,
  type ClaimedHpRecoveryNotification,
  type HpRecoveryNotificationRecord,
  type MarkHpRecoveryReadyInput,
  type RebaseHpRecoveryInput
} from "./hpRecoveryNotificationRepository";
import { HpRecoveryNotificationProducer } from "./hpRecoveryNotificationProducer";

const DEFAULT_CHECKING_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_SENDING_LEASE_MS = 13 * 60 * 1000;
export const HP_RECOVERY_ATTUNEMENT_HISTORY_TOLERANCE_MS = 2 * 60 * 1000;

class HpRecoveryReadyRace extends Error {}

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
    const rows = await this.prisma.hpRecoveryNotification.findMany({
      where: {
        OR: [
          { status: { in: ["waiting", "ready"] }, nextAttemptAt: { lte: now } },
          { status: "checking", processingStartedAt: { lte: staleCheckingAt } },
          { status: "sending", processingStartedAt: { lte: staleSendingAt } }
        ]
      },
      orderBy: [{ nextAttemptAt: "asc" }, { updatedAt: "asc" }],
      take: limit
    });
    const claimed: ClaimedHpRecoveryNotification[] = [];

    for (const row of rows) {
      if (row.status === "sending") {
        const suppressed = await this.prisma.hpRecoveryNotification.updateMany({
          where: {
            id: row.id,
            generation: row.generation,
            status: "sending",
            processingStartedAt: { lte: staleSendingAt }
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
            ? { processingStartedAt: { lte: staleCheckingAt } }
            : { nextAttemptAt: { lte: now } })
        },
        data: {
          status: "checking",
          processingStartedAt: now,
          attemptCount: { increment: 1 },
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

  async markReady(input: MarkHpRecoveryReadyInput): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const [current] = await loadSnapshotsWithClient(tx, [input.characterId], input.readyAt);
        if (
          !current ||
          current.activeCombatLease ||
          current.remortCount !== input.remortCount ||
          current.hpCurrent !== input.sourceHpCurrent ||
          !datesEqual(current.hpRegenAt, input.sourceHpRegenAt) ||
          buildHpRecoveryStateFingerprint(current, input.readyAt) !== input.sourceFingerprint
        ) {
          return false;
        }

        const guarded = await tx.hpRecoveryNotification.updateMany({
          where: {
            characterId: input.characterId,
            generation: input.generation,
            remortCount: input.remortCount,
            status: "checking",
            processingStartedAt: input.claimStartedAt,
            sourceHpCurrent: input.sourceHpCurrent,
            sourceHpMax: input.sourceHpMax,
            sourceHpRegenAt: sameNullableDate(input.sourceHpRegenAt)
          },
          data: {
            status: "ready",
            readyAt: input.readyAt,
            nextAttemptAt: input.readyAt,
            processingStartedAt: null,
            sourceHpCurrent: input.effectiveHpMax,
            sourceHpRegenAt: input.readyAt,
            sourceFingerprint: input.sourceFingerprint
          }
        });
        if (guarded.count !== 1) {
          return false;
        }

        const character = await tx.character.updateMany({
          where: {
            id: input.characterId,
            hpCurrent: input.sourceHpCurrent,
            hpRegenAt: sameNullableDate(input.sourceHpRegenAt)
          },
          data: {
            hpCurrent: input.effectiveHpMax,
            hpRegenAt: input.readyAt
          }
        });
        if (character.count !== 1) {
          throw new HpRecoveryReadyRace();
        }
        return true;
      });
    } catch (error) {
      if (error instanceof HpRecoveryReadyRace) {
        return false;
      }
      throw error;
    }
  }

  async claimReadyForSending(input: {
    characterId: string;
    generation: number;
    remortCount: number;
    expectedHpCurrent: number;
    expectedHpRegenAt: Date | null;
    expectedStateFingerprint: string;
    expectedEffectiveHpMax: number;
    readyAt: Date;
    now: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const [snapshot] = await loadSnapshotsWithClient(tx, [input.characterId], input.now);
      if (!snapshot || snapshot.remortCount !== input.remortCount) {
        await suppressReady(tx, input.characterId, input.generation, input.now, "life-changed");
        return false;
      }
      if (snapshot.activeCombatLease) {
        await tx.hpRecoveryNotification.updateMany({
          where: { characterId: input.characterId, generation: input.generation, status: "ready" },
          data: { nextAttemptAt: new Date(input.now.getTime() + 60_000) }
        });
        return false;
      }
      if (
        snapshot.hpCurrent !== input.expectedHpCurrent ||
        snapshot.hpCurrent !== input.expectedEffectiveHpMax ||
        !datesEqual(snapshot.hpRegenAt, input.expectedHpRegenAt)
      ) {
        await suppressReady(tx, input.characterId, input.generation, input.now, "resource-changed");
        return false;
      }
      if (snapshot.lastActionAt && snapshot.lastActionAt > input.readyAt) {
        await suppressReady(tx, input.characterId, input.generation, input.now, "active-after-ready");
        return false;
      }
      if (buildHpRecoveryStateFingerprint(snapshot, input.now) !== input.expectedStateFingerprint) {
        await suppressReady(tx, input.characterId, input.generation, input.now, "effective-state-changed");
        return false;
      }

      const updated = await tx.hpRecoveryNotification.updateMany({
        where: {
          characterId: input.characterId,
          generation: input.generation,
          remortCount: input.remortCount,
          status: "ready",
          sourceHpCurrent: input.expectedHpCurrent,
          sourceHpRegenAt: sameNullableDate(input.expectedHpRegenAt),
          sourceFingerprint: input.expectedStateFingerprint
        },
        data: {
          status: "sending",
          processingStartedAt: input.now,
          attemptCount: { increment: 1 },
          lastErrorCode: null
        }
      });
      return updated.count === 1;
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

async function suppressReady(
  tx: Prisma.TransactionClient,
  characterId: string,
  generation: number,
  now: Date,
  errorCode: string
): Promise<void> {
  await tx.hpRecoveryNotification.updateMany({
    where: { characterId, generation, status: "ready" },
    data: {
      status: "suppressed",
      suppressedAt: now,
      processingStartedAt: null,
      lastErrorCode: errorCode
    }
  });
}

function sanitizeErrorCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64) || "unknown";
}
