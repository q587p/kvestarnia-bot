import { items } from "../content";
import type { ItemContent } from "../content/schema";
import {
  buildHpRecoveryStateFingerprint,
  type ClaimedHpRecoveryNotification,
  type HpRecoveryNotificationRepository,
  type HpRecoverySnapshot
} from "../db/repositories/hpRecoveryNotificationRepository";
import { summarizeCharacter } from "../domain/characters/characterSummary";
import {
  isEquipmentAttunementPendingForRow,
  matchesEquipmentAttunementRow,
  parseEquipmentAttunementPayload
} from "../domain/equipment/equipmentAttunement";
import { applyPassiveResourceRegeneration } from "../domain/resources/resourceRegeneration";
import {
  buildShynokRecoveryWindows,
  isShynokDrinkKey
} from "../domain/shynokDrinks";

export const HP_RECOVERY_NOTIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const HP_RECOVERY_NOTIFICATION_MAX_ATTEMPTS = 13;

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
    private readonly devHelpersEnabled: boolean,
    private readonly revalidationClock?: () => Date
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
    const work = claimed.filter(
      (row): row is Exclude<ClaimedHpRecoveryNotification, { claim: "suppressed-stale-send" }> =>
        row.claim !== "suppressed-stale-send"
    );
    const snapshots = await this.repository.loadSnapshots(work.map((row) => row.characterId), now);
    const snapshotsByCharacter = new Map(snapshots.map((snapshot) => [snapshot.characterId, snapshot]));

    for (const row of work) {
      try {
        if (
          now.getTime() - row.updatedAt.getTime() > HP_RECOVERY_NOTIFICATION_MAX_AGE_MS ||
          row.attemptCount >= HP_RECOVERY_NOTIFICATION_MAX_ATTEMPTS
        ) {
          metrics.suppressed += Number(await this.suppressClaim(row, now, "delivery-window-expired"));
          continue;
        }

        const snapshot = snapshotsByCharacter.get(row.characterId);
        if (!snapshot || snapshot.remortCount !== row.remortCount) {
          metrics.suppressed += Number(await this.suppressClaim(row, now, "life-changed"));
          continue;
        }

        const canonical = buildCanonicalRecovery(snapshot, now);
        if (row.claim === "ready") {
          await this.deliver(sender, row, now, metrics);
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
          if (canonical.pendingAttunementReadyAt) {
            await this.repository.rebase({
              ...rebaseInput(row, snapshot, canonical.fingerprint),
              nextAttemptAt: canonical.pendingAttunementReadyAt
            });
          } else {
            metrics.suppressed += Number(await this.suppressClaim(row, now, "already-full"));
          }
          continue;
        }

        const sourceChanged =
          snapshot.hpCurrent !== row.sourceHpCurrent ||
          snapshot.hpMax !== row.sourceHpMax ||
          !datesEqual(snapshot.hpRegenAt, row.sourceHpRegenAt) ||
          (row.sourceFingerprint !== null && row.sourceFingerprint !== canonical.fingerprint);
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

        const finalCheckAt = this.revalidationClock?.() ?? now;
        const [freshSnapshot] = await this.repository.loadSnapshots([row.characterId], finalCheckAt);
        if (!freshSnapshot || freshSnapshot.remortCount !== row.remortCount) {
          metrics.suppressed += Number(await this.suppressClaim(row, finalCheckAt, "life-changed"));
          continue;
        }
        const freshCanonical = buildCanonicalRecovery(freshSnapshot, finalCheckAt);
        if (freshSnapshot.activeCombatLease) {
          await this.repository.rebase({
            ...rebaseInput(row, freshSnapshot, freshCanonical.fingerprint),
            nextAttemptAt: new Date(finalCheckAt.getTime() + 60_000)
          });
          continue;
        }
        if (freshCanonical.summary.hpCurrent >= freshCanonical.summary.hpMax) {
          if (freshCanonical.pendingAttunementReadyAt) {
            await this.repository.rebase({
              ...rebaseInput(row, freshSnapshot, freshCanonical.fingerprint),
              nextAttemptAt: freshCanonical.pendingAttunementReadyAt
            });
          } else {
            metrics.suppressed += Number(await this.suppressClaim(row, finalCheckAt, "full-outside-worker"));
          }
          continue;
        }
        if (freshCanonical.regeneration.resources.hpCurrent < freshCanonical.regeneration.resources.hpMax) {
          await this.repository.rebase({
            ...rebaseInput(row, freshSnapshot, freshCanonical.fingerprint),
            nextAttemptAt: freshCanonical.regeneration.recovery.hpFullAt ?? new Date(finalCheckAt.getTime() + 60_000)
          });
          continue;
        }

        const ready = await this.repository.markReady({
          ...rebaseInput(row, freshSnapshot, freshCanonical.fingerprint),
          nextAttemptAt: finalCheckAt,
          readyAt: finalCheckAt,
          effectiveHpMax: freshCanonical.regeneration.resources.hpMax
        });
        if (!ready) {
          continue;
        }

        await this.deliver(sender, {
          ...row,
          status: "ready",
          sourceHpCurrent: freshCanonical.regeneration.resources.hpMax,
          sourceHpRegenAt: finalCheckAt,
          sourceFingerprint: freshCanonical.fingerprint,
          readyAt: finalCheckAt,
          nextAttemptAt: finalCheckAt,
          processingStartedAt: null,
          claim: "ready",
          claimStartedAt: null
        }, finalCheckAt, metrics);
      } catch {
        metrics.errors += 1;
        await this.suppressClaim(row, now, "row-error").catch(() => false);
      }
    }

    return metrics;
  }

  private async deliver(
    sender: HealthRecoveryMessageSender,
    row: ClaimedHpRecoveryNotification,
    now: Date,
    metrics: HealthRecoveryTickMetrics
  ): Promise<void> {
    const deliveryCheckAt = this.revalidationClock?.() ?? now;
    const [snapshot] = await this.repository.loadSnapshots([row.characterId], deliveryCheckAt);
    if (!snapshot || snapshot.remortCount !== row.remortCount || !row.readyAt) {
      metrics.suppressed += Number(await this.repository.suppressReady(
        row.characterId,
        row.generation,
        deliveryCheckAt,
        "ready-state-missing"
      ));
      return;
    }
    const canonical = buildCanonicalRecovery(snapshot, deliveryCheckAt);
    if (
      snapshot.hpCurrent !== row.sourceHpCurrent ||
      !datesEqual(snapshot.hpRegenAt, row.sourceHpRegenAt) ||
      canonical.summary.hpCurrent < canonical.summary.hpMax ||
      row.sourceFingerprint !== canonical.fingerprint
    ) {
      metrics.suppressed += Number(await this.repository.suppressReady(
        row.characterId,
        row.generation,
        deliveryCheckAt,
        "ready-state-changed"
      ));
      return;
    }
    if (snapshot.lastActionAt && snapshot.lastActionAt > row.readyAt) {
      metrics.suppressed += Number(await this.repository.suppressReady(
        row.characterId,
        row.generation,
        deliveryCheckAt,
        "active-after-ready"
      ));
      return;
    }

    const claimed = await this.repository.claimReadyForSending({
      characterId: row.characterId,
      generation: row.generation,
      remortCount: row.remortCount,
      expectedHpCurrent: row.sourceHpCurrent,
      expectedHpRegenAt: row.sourceHpRegenAt,
      expectedStateFingerprint: canonical.fingerprint,
      expectedEffectiveHpMax: canonical.summary.hpMax,
      readyAt: row.readyAt,
      now: deliveryCheckAt
    });
    if (!claimed) {
      return;
    }

    try {
      await sender.sendMessage(snapshot.telegramUserId.toString(), presentHealthRecoveryNotification(), {
        parse_mode: "HTML"
      });
      if (await this.repository.markSent(row.characterId, row.generation, deliveryCheckAt)) {
        metrics.sent += 1;
      }
    } catch (error) {
      const delivery = classifyDeliveryFailure(error);
      if (delivery.kind === "permanent") {
        metrics.suppressed += Number(await this.repository.suppressSending(
          row.characterId,
          row.generation,
          deliveryCheckAt,
          "telegram-permanent"
        ));
        return;
      }
      if (delivery.kind === "retryable") {
        const backoffMs = Math.min(13 * 60_000, 60_000 * (2 ** Math.min(3, row.attemptCount)));
        const retryAfterMs = Math.max(0, delivery.retryAfterSeconds ?? 0) * 1000;
        metrics.retried += Number(await this.repository.retrySending(
          row.characterId,
          row.generation,
          new Date(deliveryCheckAt.getTime() + Math.max(backoffMs, retryAfterMs)),
          "telegram-retryable"
        ));
        return;
      }

      metrics.errors += 1;
      // Keep `sending`: a crash or unknown network outcome is ambiguous and must not auto-resend.
    }
  }

  private suppressClaim(
    row: ClaimedHpRecoveryNotification,
    now: Date,
    errorCode: string
  ): Promise<boolean> {
    if (row.claim === "checking") {
      return this.repository.suppressChecking({
        characterId: row.characterId,
        generation: row.generation,
        remortCount: row.remortCount,
        claimStartedAt: row.claimStartedAt,
        now,
        errorCode
      });
    }
    return this.repository.suppressReady(row.characterId, row.generation, now, errorCode);
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
  const fingerprint = buildHpRecoveryStateFingerprint(snapshot, now);
  return { summary, regeneration, fingerprint, pendingAttunementReadyAt: getPendingAttunementReadyAt(snapshot, now) };
}

function getActiveEquippedItems(snapshot: HpRecoverySnapshot, now: Date): ItemContent[] {
  return snapshot.equipment.flatMap((row) => {
    if (isEquipmentAttunementPendingForRow({
      row,
      actionPayloads: snapshot.attunementActions.map((action) => action.resultJson),
      now
    })) {
      return [];
    }
    const item = items.find((candidate) => candidate.id === row.itemId);
    return item ? [item] : [];
  });
}

function getPendingAttunementReadyAt(snapshot: HpRecoverySnapshot, now: Date): Date | null {
  const readyTimes = snapshot.attunementActions.flatMap((action) => {
    const payload = parseEquipmentAttunementPayload(action.resultJson);
    if (!payload || !snapshot.equipment.some((row) => matchesEquipmentAttunementRow(payload, row))) {
      return [];
    }
    const readyAt = Date.parse(payload.readyAt);
    return readyAt > now.getTime() ? [readyAt] : [];
  });
  return readyTimes.length > 0 ? new Date(Math.min(...readyTimes)) : null;
}

function rebaseInput(
  row: Extract<ClaimedHpRecoveryNotification, { claim: "checking" }>,
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
    sourceFingerprint,
    claimStartedAt: row.claimStartedAt
  };
}

function emptyMetrics(): HealthRecoveryTickMetrics {
  return { due: 0, claimed: 0, sent: 0, retried: 0, suppressed: 0, errors: 0 };
}

function datesEqual(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function classifyDeliveryFailure(error: unknown): {
  kind: "retryable" | "permanent" | "ambiguous";
  retryAfterSeconds?: number;
} {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const nested = candidate.error && typeof candidate.error === "object"
    ? candidate.error as Record<string, unknown>
    : candidate.response && typeof candidate.response === "object"
      ? candidate.response as Record<string, unknown>
      : {};
  const code = numberOrNull(candidate.error_code) ?? numberOrNull(nested.error_code);
  const descriptionValue = candidate.description ?? nested.description;
  const description = typeof descriptionValue === "string" ? descriptionValue.toLowerCase() : "";
  const parameters = candidate.parameters && typeof candidate.parameters === "object"
    ? candidate.parameters as Record<string, unknown>
    : nested.parameters && typeof nested.parameters === "object"
      ? nested.parameters as Record<string, unknown>
      : {};

  if (code === 403 || (code === 400 && /chat not found|blocked|deactivated/.test(description))) {
    return { kind: "permanent" };
  }
  if (code === 429) {
    const retryAfterSeconds = numberOrNull(parameters.retry_after);
    return retryAfterSeconds === null
      ? { kind: "retryable" }
      : { kind: "retryable", retryAfterSeconds };
  }
  return { kind: "ambiguous" };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
