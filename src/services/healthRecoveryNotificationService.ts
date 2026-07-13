import { items } from "../content";
import type { ItemContent } from "../content/schema";
import type {
  ClaimedHpRecoveryNotification,
  HpRecoveryNotificationRepository,
  HpRecoverySnapshot
} from "../db/repositories/hpRecoveryNotificationRepository";
import { summarizeCharacter } from "../domain/characters/characterSummary";
import { isEquipmentAttunementPendingForRow } from "../domain/equipment/equipmentAttunement";
import { applyPassiveResourceRegeneration } from "../domain/resources/resourceRegeneration";
import {
  buildShynokRecoveryWindows,
  isShynokDrinkKey
} from "../domain/shynokDrinks";

export interface HealthRecoveryTickMetrics {
  due: number;
  claimed: number;
  sent: number;
  retried: number;
  suppressed: number;
  errors: number;
}

export interface HealthRecoveryMessageSender {
  sendMessage(chatId: string, text: string, options: { parse_mode: "HTML" }): Promise<unknown>;
}

export class HealthRecoveryNotificationService {
  constructor(
    private readonly repository: HpRecoveryNotificationRepository,
    private readonly enabled: boolean,
    private readonly devHelpersEnabled: boolean
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  areDevHelpersEnabled(): boolean {
    return this.enabled && this.devHelpersEnabled;
  }

  async prepareDueForTelegramUser(telegramUserId: bigint, now = new Date()): Promise<boolean> {
    if (!this.areDevHelpersEnabled()) {
      return false;
    }
    return this.repository.prepareDueForTelegramUser(telegramUserId, now);
  }

  async runBatch(
    sender: HealthRecoveryMessageSender,
    now: Date,
    options: { limit?: number; checkingLeaseMs?: number; sendingLeaseMs?: number } = {}
  ): Promise<HealthRecoveryTickMetrics> {
    const metrics = emptyMetrics();
    if (!this.enabled) {
      return metrics;
    }

    const claimed = await this.repository.claimDue(now, options);
    metrics.due = claimed.length;
    metrics.claimed = claimed.filter((row) => row.claim !== "suppressed-stale-send").length;
    metrics.suppressed += claimed.filter((row) => row.claim === "suppressed-stale-send").length;
    const work = claimed.filter((row) => row.claim !== "suppressed-stale-send");
    const snapshots = await this.repository.loadSnapshots(work.map((row) => row.characterId));
    const snapshotsByCharacter = new Map(snapshots.map((snapshot) => [snapshot.characterId, snapshot]));

    for (const row of work) {
      try {
        const snapshot = snapshotsByCharacter.get(row.characterId);
        if (!snapshot || snapshot.remortCount !== row.remortCount) {
          metrics.suppressed += Number(await this.repository.suppress(
            row.characterId,
            row.generation,
            now,
            "life-changed"
          ));
          continue;
        }

        const canonical = buildCanonicalRecovery(snapshot, now);
        if (row.claim === "ready") {
          if (
            snapshot.hpCurrent !== row.sourceHpCurrent ||
            !datesEqual(snapshot.hpRegenAt, row.sourceHpRegenAt) ||
            canonical.summary.hpCurrent < canonical.summary.hpMax ||
            (row.sourceFingerprint !== null && row.sourceFingerprint !== canonical.fingerprint)
          ) {
            metrics.suppressed += Number(await this.repository.suppress(
              row.characterId,
              row.generation,
              now,
              "ready-state-changed"
            ));
            continue;
          }
          await this.deliver(sender, row, snapshot, now, metrics);
          continue;
        }

        if (snapshot.activeCombatLease) {
          await this.repository.rebase({
            ...rebaseInput(row, snapshot, canonical.fingerprint),
            nextAttemptAt: new Date(now.getTime() + 60_000)
          });
          continue;
        }

        if (canonical.summary.hpCurrent >= canonical.summary.hpMax) {
          metrics.suppressed += Number(await this.repository.suppress(
            row.characterId,
            row.generation,
            now,
            "already-full"
          ));
          continue;
        }

        const sourceChanged =
          snapshot.hpCurrent !== row.sourceHpCurrent ||
          snapshot.hpMax !== row.sourceHpMax ||
          !datesEqual(snapshot.hpRegenAt, row.sourceHpRegenAt) ||
          (row.sourceFingerprint !== null && row.sourceFingerprint !== canonical.fingerprint);
        if (sourceChanged && canonical.summary.hpCurrent >= canonical.summary.hpMax) {
          metrics.suppressed += Number(await this.repository.suppress(
            row.characterId,
            row.generation,
            now,
            "full-outside-worker"
          ));
          continue;
        }
        if (sourceChanged) {
          await this.repository.rebase({
            ...rebaseInput(row, snapshot, canonical.fingerprint),
            nextAttemptAt: canonical.regeneration.recovery.hpFullAt ?? new Date(now.getTime() + 60_000)
          });
          continue;
        }

        if (canonical.regeneration.resources.hpCurrent < canonical.regeneration.resources.hpMax) {
          await this.repository.rebase({
            ...rebaseInput(row, snapshot, canonical.fingerprint),
            nextAttemptAt: canonical.regeneration.recovery.hpFullAt ?? new Date(now.getTime() + 60_000)
          });
          continue;
        }

        const ready = await this.repository.markReady({
          ...rebaseInput(row, snapshot, canonical.fingerprint),
          nextAttemptAt: now,
          readyAt: now,
          effectiveHpMax: canonical.regeneration.resources.hpMax
        });
        if (!ready) {
          continue;
        }

        await this.deliver(sender, {
          ...row,
          status: "ready",
          sourceHpCurrent: canonical.regeneration.resources.hpMax,
          sourceHpRegenAt: now,
          sourceFingerprint: canonical.fingerprint,
          readyAt: now,
          nextAttemptAt: now,
          processingStartedAt: null,
          claim: "ready"
        }, {
          ...snapshot,
          hpCurrent: canonical.regeneration.resources.hpMax,
          hpRegenAt: now
        }, now, metrics);
      } catch {
        metrics.errors += 1;
        await this.repository.suppress(row.characterId, row.generation, now, "row-error").catch(() => false);
      }
    }

    return metrics;
  }

  private async deliver(
    sender: HealthRecoveryMessageSender,
    row: ClaimedHpRecoveryNotification,
    snapshot: HpRecoverySnapshot,
    now: Date,
    metrics: HealthRecoveryTickMetrics
  ): Promise<void> {
    const claimed = await this.repository.claimReadyForSending({
      characterId: row.characterId,
      generation: row.generation,
      remortCount: row.remortCount,
      expectedHpCurrent: row.sourceHpCurrent,
      expectedHpRegenAt: row.sourceHpRegenAt,
      now
    });
    if (!claimed) {
      return;
    }

    try {
      await sender.sendMessage(snapshot.telegramUserId.toString(), presentHealthRecoveryNotification(), {
        parse_mode: "HTML"
      });
      if (await this.repository.markSent(row.characterId, row.generation, now)) {
        metrics.sent += 1;
      }
    } catch (error) {
      const delivery = classifyDeliveryFailure(error);
      if (delivery === "permanent") {
        metrics.suppressed += Number(await this.repository.suppressSending(
          row.characterId,
          row.generation,
          now,
          "telegram-permanent"
        ));
        return;
      }
      if (delivery === "retryable") {
        const backoffMs = Math.min(13 * 60_000, 60_000 * (2 ** Math.min(3, row.attemptCount)));
        metrics.retried += Number(await this.repository.retrySending(
          row.characterId,
          row.generation,
          new Date(now.getTime() + backoffMs),
          "telegram-retryable"
        ));
        return;
      }

      metrics.errors += 1;
      // Keep `sending`: a crash or unknown network outcome is ambiguous and must not auto-resend.
    }
  }
}

export function presentHealthRecoveryNotification(): string {
  return [
    "❤️ Життя відновилося повністю.",
    "",
    "Організм подав заявку на продовження пригод і сам її погодив."
  ].join("\n");
}

function buildCanonicalRecovery(snapshot: HpRecoverySnapshot, now: Date) {
  const equippedItems = getActiveEquippedItems(snapshot, now);
  const summary = summarizeCharacter({
    name: "",
    pronoun: snapshot.pronoun,
    path: snapshot.path,
    raceId: snapshot.raceId,
    classId: snapshot.classId,
    level: snapshot.level,
    xp: snapshot.xp,
    gold: 0,
    hpCurrent: snapshot.hpCurrent,
    hpMax: snapshot.hpMax,
    manaCurrent: 0,
    manaMax: 1,
    statsJson: snapshot.statsJson
  }, {
    equippedItems,
    remortCount: snapshot.remortCount
  });
  const recoveryDrink = snapshot.recoveryDrink && isShynokDrinkKey(snapshot.recoveryDrink.drinkKey)
    ? {
        drinkKey: snapshot.recoveryDrink.drinkKey,
        phase: snapshot.recoveryDrink.phase === "queued" ? "queued" as const : "timed" as const,
        startedAt: snapshot.recoveryDrink.startedAt,
        expiresAt: snapshot.recoveryDrink.expiresAt,
        metadata: snapshot.recoveryDrink.metadata
      }
    : null;
  const regeneration = applyPassiveResourceRegeneration({
    resources: {
      hpCurrent: summary.hpCurrent,
      hpMax: summary.hpMax,
      manaCurrent: 0,
      manaMax: 0,
      hpRegenAt: snapshot.hpRegenAt,
      manaRegenAt: now
    },
    profile: {
      raceId: summary.raceId,
      classId: summary.classId,
      title: summary.title,
      stats: summary.stats
    },
    now,
    multiplierWindows: buildShynokRecoveryWindows(recoveryDrink)
  });
  const fingerprint = JSON.stringify({
    level: summary.level,
    remortCount: snapshot.remortCount,
    hpMax: summary.hpMax,
    stats: summary.stats,
    equipment: snapshot.equipment
      .filter((row) => equippedItems.some((item) => item.id === row.itemId))
      .map((row) => [row.slot, row.itemId, row.updatedAt.toISOString()])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    drink: recoveryDrink
      ? [recoveryDrink.drinkKey, recoveryDrink.phase, recoveryDrink.startedAt.toISOString(), recoveryDrink.expiresAt.toISOString()]
      : null
  });
  return { summary, regeneration, fingerprint };
}

function getActiveEquippedItems(snapshot: HpRecoverySnapshot, now: Date): ItemContent[] {
  return snapshot.equipment.flatMap((row) => {
    if (isEquipmentAttunementPendingForRow({
      row,
      actionPayloads: snapshot.attunementPayloads,
      now
    })) {
      return [];
    }
    const item = items.find((candidate) => candidate.id === row.itemId);
    return item ? [item] : [];
  });
}

function rebaseInput(
  row: ClaimedHpRecoveryNotification,
  snapshot: HpRecoverySnapshot,
  sourceFingerprint: string
) {
  return {
    characterId: row.characterId,
    generation: row.generation,
    remortCount: snapshot.remortCount,
    sourceHpCurrent: snapshot.hpCurrent,
    sourceHpMax: snapshot.hpMax,
    sourceHpRegenAt: snapshot.hpRegenAt,
    sourceFingerprint
  };
}

function emptyMetrics(): HealthRecoveryTickMetrics {
  return { due: 0, claimed: 0, sent: 0, retried: 0, suppressed: 0, errors: 0 };
}

function datesEqual(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function classifyDeliveryFailure(error: unknown): "retryable" | "permanent" | "ambiguous" {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const nested = candidate.error && typeof candidate.error === "object"
    ? candidate.error as Record<string, unknown>
    : candidate.response && typeof candidate.response === "object"
      ? candidate.response as Record<string, unknown>
      : {};
  const code = numberOrNull(candidate.error_code) ?? numberOrNull(nested.error_code);
  const description = String(candidate.description ?? nested.description ?? "").toLowerCase();

  if (code === 403 || (code === 400 && /chat not found|blocked|deactivated/.test(description))) {
    return "permanent";
  }
  if (code === 429 || (code !== null && code >= 500)) {
    return "retryable";
  }
  return "ambiguous";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
