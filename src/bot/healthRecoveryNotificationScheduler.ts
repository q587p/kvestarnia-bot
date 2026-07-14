import type { Bot } from "grammy";
import type {
  HealthRecoveryNotificationService,
  HealthRecoveryTickMetrics
} from "../services/healthRecoveryNotificationService";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_LIMIT = 13;

export function createHealthRecoveryNotificationScheduler(
  service: Pick<HealthRecoveryNotificationService, "runBatch">,
  bot: Bot,
  options: { intervalMs?: number; limit?: number; now?: () => Date } = {}
): { start(): void; stop(): Promise<void>; tick(): Promise<HealthRecoveryTickMetrics> } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight: Promise<HealthRecoveryTickMetrics> | null = null;
  let stopping = false;
  const now = options.now ?? (() => new Date());

  const tick = async (): Promise<HealthRecoveryTickMetrics> => {
    if (stopping || inFlight) {
      return emptyMetrics();
    }

    const startedAt = Date.now();
    inFlight = service.runBatch(bot.api, now(), { limit: options.limit ?? DEFAULT_BATCH_LIMIT });
    try {
      const metrics = await inFlight;
      logHealthRecoveryTick(metrics, Math.max(0, Date.now() - startedAt));
      return metrics;
    } finally {
      inFlight = null;
    }
  };

  return {
    start() {
      if (timer || stopping) {
        return;
      }
      void tick().catch(logHealthRecoverySchedulerError);
      timer = setInterval(() => {
        void tick().catch(logHealthRecoverySchedulerError);
      }, options.intervalMs ?? DEFAULT_INTERVAL_MS);
    },
    async stop() {
      stopping = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (inFlight) {
        await inFlight.catch(() => emptyMetrics());
      }
    },
    tick
  };
}

function emptyMetrics(): HealthRecoveryTickMetrics {
  return { due: 0, claimed: 0, sent: 0, retried: 0, suppressed: 0, errors: 0 };
}

function logHealthRecoveryTick(metrics: HealthRecoveryTickMetrics, durationMs: number): void {
  if (!Object.values(metrics).some((value) => value > 0)) {
    return;
  }

  const message =
    `Квестарня: tick сповіщень про відновлення HP. durationMs=${durationMs}` +
    ` due=${metrics.due} claimed=${metrics.claimed} sent=${metrics.sent}` +
    ` retried=${metrics.retried} suppressed=${metrics.suppressed} errors=${metrics.errors}`;
  if (metrics.errors > 0) {
    console.error(message);
    return;
  }
  console.info(message);
}

function logHealthRecoverySchedulerError(error: unknown): void {
  const errorName = error instanceof Error ? error.name : "unknown";
  console.error(
    `Квестарня: tick сповіщень про відновлення HP не відпрацював. errorName=${errorName}`
  );
}
