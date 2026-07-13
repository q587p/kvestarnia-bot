import {
  type ClaimedHpRecoveryNotification,
  type HpRecoveryNotificationRepository,
  type HpRecoverySnapshot
} from "../db/repositories/hpRecoveryNotificationRepository";
import { evaluateCanonicalHpRecovery } from "../domain/resources/canonicalHpRecovery";

export const HP_RECOVERY_NOTIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
        if (now.getTime() - row.updatedAt.getTime() > HP_RECOVERY_NOTIFICATION_MAX_AGE_MS) {
          metrics.suppressed += Number(await this.suppressClaim(row, now, "delivery-window-expired"));
          continue;
        }

        const snapshot = snapshotsByCharacter.get(row.characterId);
        if (!snapshot || snapshot.remortCount !== row.remortCount) {
          metrics.suppressed += Number(await this.suppressClaim(row, now, "life-changed"));
          continue;
        }

        const canonical = evaluateCanonicalHpRecovery(snapshot, now);
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
        const final = await this.repository.finalizeChecking(row, finalCheckAt);
        if (final.state === "suppressed") {
          metrics.suppressed += 1;
        } else if (final.state === "ready") {
          await this.deliver(sender, final.notification, finalCheckAt, metrics);
        }
      } catch {
        metrics.errors += 1;
        await this.suppressClaim(row, now, "row-error").catch(() => false);
      }
    }

    return metrics;
  }

  private async deliver(
    sender: HealthRecoveryMessageSender,
    row: Extract<ClaimedHpRecoveryNotification, { claim: "ready" }>,
    now: Date,
    metrics: HealthRecoveryTickMetrics
  ): Promise<void> {
    const deliveryCheckAt = this.revalidationClock?.() ?? now;
    const claim = await this.repository.claimReadyForSending(row, deliveryCheckAt);
    if (claim.state === "suppressed") {
      metrics.suppressed += 1;
      return;
    }
    if (claim.state !== "claimed") {
      return;
    }

    try {
      await sender.sendMessage(claim.telegramUserId.toString(), presentHealthRecoveryNotification(), {
        parse_mode: "HTML"
      });
      const completedAt = this.revalidationClock?.() ?? deliveryCheckAt;
      if (await this.repository.markSent(row.characterId, row.generation, completedAt)) {
        metrics.sent += 1;
      }
    } catch (error) {
      const failureAt = this.revalidationClock?.() ?? deliveryCheckAt;
      const delivery = classifyDeliveryFailure(error);
      if (delivery.kind === "permanent") {
        metrics.suppressed += Number(await this.repository.suppressSending(
          row.characterId,
          row.generation,
          failureAt,
          "telegram-permanent"
        ));
        return;
      }
      if (delivery.kind === "retryable") {
        const backoffMs = Math.min(
          13 * 60_000,
          60_000 * (2 ** Math.min(3, Math.max(0, claim.attemptCount - 1)))
        );
        const retryAfterMs = Math.max(0, delivery.retryAfterSeconds ?? 0) * 1000;
        metrics.retried += Number(await this.repository.retrySending(
          row.characterId,
          row.generation,
          new Date(failureAt.getTime() + Math.max(backoffMs, retryAfterMs)),
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
