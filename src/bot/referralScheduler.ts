import type { Bot } from "grammy";
import type { ReferralService } from "../services/referralService";
import { presentReferralNotification } from "./presenters/referralPresenter";

const DEFAULT_INTERVAL_MS = 13_000;
const DEFAULT_BATCH_LIMIT = 13;

export interface ReferralSchedulerMetrics {
  dueAchievementProjections: number;
  reconciledAchievementProjections: number;
  dueArrivalChronicles: number;
  recordedArrivalChronicles: number;
  dueRewards: number;
  grantedRewards: number;
  claimedNotifications: number;
  sentNotifications: number;
  retriedNotifications: number;
}

export function createReferralScheduler(
  service: ReferralService,
  bot: Bot,
  options: { intervalMs?: number; limit?: number } = {}
): { start(): void; stop(): Promise<void>; tick(): Promise<ReferralSchedulerMetrics> } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<ReferralSchedulerMetrics> | null = null;
  let stopping = false;
  let rerunRequested = false;
  let unsubscribeFromWork: (() => void) | null = null;

  const tick = async (): Promise<ReferralSchedulerMetrics> => {
    if (stopping) {
      return emptyMetrics();
    }
    if (inFlight) {
      rerunRequested = true;
      return emptyMetrics();
    }
    inFlight = runReferralTick(service, bot, options.limit ?? DEFAULT_BATCH_LIMIT);
    try {
      return await inFlight;
    } finally {
      inFlight = null;
      if (rerunRequested && !stopping) {
        rerunRequested = false;
        queueMicrotask(() => void tick().catch(logReferralSchedulerError));
      }
    }
  };

  return {
    start() {
      if (timer || stopping) {
        return;
      }
      unsubscribeFromWork = service.onWorkAvailable?.(() => {
        void tick().catch(logReferralSchedulerError);
      }) ?? null;
      void tick().catch(logReferralSchedulerError);
      timer = setInterval(() => void tick().catch(logReferralSchedulerError), options.intervalMs ?? DEFAULT_INTERVAL_MS);
    },
    async stop() {
      stopping = true;
      rerunRequested = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      unsubscribeFromWork?.();
      unsubscribeFromWork = null;
      await inFlight?.catch(() => emptyMetrics());
    },
    tick
  };
}

async function runReferralTick(
  service: ReferralService,
  bot: Bot,
  limit: number
): Promise<ReferralSchedulerMetrics> {
  const rewards = await service.reconcileDue(limit);
  const achievements = await service.reconcileReferralAchievements(limit).catch((error) => {
    logReferralSchedulerError(error);
    return { due: 0, reconciled: 0 };
  });
  const chronicles = await service.reconcileArrivalChronicles(limit);
  const metrics: ReferralSchedulerMetrics = {
    dueAchievementProjections: achievements.due,
    reconciledAchievementProjections: achievements.reconciled,
    dueArrivalChronicles: chronicles.due,
    recordedArrivalChronicles: chronicles.recorded,
    dueRewards: rewards.due,
    grantedRewards: rewards.granted,
    claimedNotifications: 0,
    sentNotifications: 0,
    retriedNotifications: 0
  };
  for (let index = 0; index < limit; index += 1) {
    const notification = await service.claimNextNotification();
    if (!notification) {
      break;
    }
    metrics.claimedNotifications += 1;
    const text = presentReferralNotification(notification.kind, notification.payload);
    if (!text) {
      await service.rescheduleNotification(notification);
      logReferralDeliveryRetry("invalid-payload", notification.kind, notification.attemptCount);
      metrics.retriedNotifications += 1;
      continue;
    }
    try {
      await bot.api.sendMessage(Number(notification.telegramUserId), text, { parse_mode: "HTML" });
      if (await service.markNotificationSent(notification)) {
        metrics.sentNotifications += 1;
      }
    } catch (error) {
      await service.rescheduleNotification(notification);
      logReferralDeliveryRetry(
        error instanceof Error ? error.name : "telegram-error",
        notification.kind,
        notification.attemptCount
      );
      metrics.retriedNotifications += 1;
    }
  }
  return metrics;
}

function emptyMetrics(): ReferralSchedulerMetrics {
  return {
    dueAchievementProjections: 0,
    reconciledAchievementProjections: 0,
    dueArrivalChronicles: 0,
    recordedArrivalChronicles: 0,
    dueRewards: 0,
    grantedRewards: 0,
    claimedNotifications: 0,
    sentNotifications: 0,
    retriedNotifications: 0
  };
}

function logReferralDeliveryRetry(reason: string, kind: string, attemptCount: number): void {
  console.warn("Квестарня: доставку сповіщення про поклик безпечно відкладено.", {
    reason,
    kind,
    attemptCount: Math.min(Math.max(attemptCount, 0), 93)
  });
}

function logReferralSchedulerError(error: unknown): void {
  console.error("Квестарня: автоматичні поклики не пройшли чергову звірку.", {
    errorName: error instanceof Error ? error.name : "unknown"
  });
}
