import { performance } from "node:perf_hooks";

export interface HotPathTimingInput {
  route: string;
  /** Accepted for call-site compatibility; never emitted in performance logs. */
  telegramUserId?: bigint | string | number | null;
  itemCount?: number | null;
  rowCount?: number | null;
  questMarkerSourceCount?: number | null;
  questMarkerSlowestSource?: QuestMarkerPerformanceSource | null;
  questMarkerSlowestSourceMs?: number | null;
  resultState?: string | null;
  filter?: string | null;
  sort?: string | null;
  page?: number | null;
  dbMs?: number | null;
  computeMs?: number | null;
  telegramMs?: number | null;
  telegramEditMs?: number | null;
  totalMs: number;
  thresholdMs?: number;
  outcome?: "success" | "error";
  errorCategory?: PerformanceErrorCategory | null;
  errorComponent?: PerformanceErrorComponent | null;
}

export type PerformanceErrorCategory =
  | "telegram-rate-limit"
  | "timeout"
  | "database-locked"
  | "database"
  | "telegram-api"
  | "unknown";

export type PerformanceErrorComponent = "db" | "compute" | "telegram";

export type QuestMarkerPerformanceSource =
  | "adventure"
  | "fight"
  | "first-korchma"
  | "yeger"
  | "cellar"
  | "barrel-beer"
  | "daily-korchma"
  | "item-upgrades"
  | "cellar-grownup";

const DEFAULT_SLOW_HOT_PATH_MS = 350;
const DEFAULT_PERF_SAMPLE_RATE = 0;

export function hotPathNow(): number {
  return performance.now();
}

export function elapsedMs(startedAt: number): number {
  return performance.now() - startedAt;
}

export function logPerformanceTiming(input: HotPathTimingInput): void {
  const thresholdMs = input.thresholdMs ?? getSlowPerfThresholdMs();
  const totalMs = input.totalMs;
  const slow = totalMs >= thresholdMs;
  const failed = input.outcome === "error" || input.errorCategory != null;

  if (!failed && !slow && !shouldSamplePerfTiming()) {
    return;
  }

  const evidenceKind = failed ? "terminal-error" : slow ? "slow-tail" : "random-sample";
  const payload = sanitizePerfTimingPayload(input, thresholdMs, evidenceKind);
  const log = failed ? console.error : slow ? console.warn : console.info;

  log(
    failed
      ? "Kvestarnia failed perf timing"
      : slow
        ? "Kvestarnia slow perf timing"
        : "Kvestarnia sampled perf timing",
    payload
  );
}

export function startPerfSpan(
  route: string,
  fields: Omit<HotPathTimingInput, "route" | "totalMs" | "dbMs" | "computeMs" | "telegramMs" | "telegramEditMs"> = {}
) {
  const totalStartedAt = hotPathNow();
  let dbMs = 0;
  let computeMs = 0;
  let telegramMs = 0;
  let telegramEditMs = 0;
  let telegramEditMeasured = false;
  let ended = false;

  const finish = (
    extra: Partial<Omit<HotPathTimingInput, "route" | "totalMs" | "dbMs" | "computeMs" | "telegramMs">> = {}
  ): void => {
    if (ended) {
      return;
    }

    ended = true;
    logPerformanceTiming({
      route,
      ...fields,
      ...extra,
      dbMs,
      computeMs,
      telegramMs,
      ...(telegramEditMeasured ? { telegramEditMs } : {}),
      totalMs: elapsedMs(totalStartedAt)
    });
  };

  const finishFailure = (error: unknown, errorComponent: PerformanceErrorComponent): void => {
    finish({
      outcome: "error",
      errorCategory: classifyPerformanceError(error),
      errorComponent
    });
  };

  return {
    async measureDb<T>(callback: () => Promise<T>): Promise<T> {
      const startedAt = hotPathNow();
      try {
        const result = await callback();
        dbMs += elapsedMs(startedAt);
        return result;
      } catch (error) {
        dbMs += elapsedMs(startedAt);
        finishFailure(error, "db");
        throw error;
      }
    },
    measureCompute<T>(callback: () => T): T {
      const startedAt = hotPathNow();
      try {
        const result = callback();
        computeMs += elapsedMs(startedAt);
        return result;
      } catch (error) {
        computeMs += elapsedMs(startedAt);
        finishFailure(error, "compute");
        throw error;
      }
    },
    async measureTelegram<T>(callback: () => Promise<T>): Promise<T> {
      const startedAt = hotPathNow();
      try {
        const result = await callback();
        telegramMs += elapsedMs(startedAt);
        return result;
      } catch (error) {
        telegramMs += elapsedMs(startedAt);
        finishFailure(error, "telegram");
        throw error;
      }
    },
    async measureTelegramEdit<T>(callback: () => Promise<T>): Promise<T> {
      const startedAt = hotPathNow();
      telegramEditMeasured = true;
      try {
        const result = await callback();
        telegramEditMs += elapsedMs(startedAt);
        return result;
      } catch (error) {
        telegramEditMs += elapsedMs(startedAt);
        finishFailure(error, "telegram");
        throw error;
      }
    },
    end(extra: Partial<Omit<HotPathTimingInput, "route" | "totalMs" | "dbMs" | "computeMs" | "telegramMs">> = {}): void {
      finish({ outcome: "success", ...extra });
    },
    fail(error: unknown, errorComponent: PerformanceErrorComponent): void {
      finishFailure(error, errorComponent);
    }
  };
}

export function shouldLogPerfTiming(input: HotPathTimingInput, randomValue = Math.random()): boolean {
  if (input.outcome === "error" || input.errorCategory != null) {
    return true;
  }

  const thresholdMs = input.thresholdMs ?? getSlowPerfThresholdMs();
  if (input.totalMs >= thresholdMs) {
    return true;
  }

  return randomValue < getPerfSampleRate();
}

export function sanitizePerfTimingPayload(
  input: HotPathTimingInput,
  thresholdMs = input.thresholdMs ?? getSlowPerfThresholdMs(),
  evidenceKind: "slow-tail" | "random-sample" | "terminal-error" =
    input.outcome === "error" || input.errorCategory != null
      ? "terminal-error"
      : input.totalMs >= thresholdMs
        ? "slow-tail"
        : "random-sample"
): Record<string, string | number | null | boolean> {
  const renderGitCommit = getSafeRenderMetadata("RENDER_GIT_COMMIT", /^[a-f0-9]{7,40}$/i);
  const renderInstanceId = getSafeRenderMetadata("RENDER_INSTANCE_ID", /^[A-Za-z0-9._-]{1,100}$/);

  return {
    route: input.route,
    slow: input.totalMs >= thresholdMs,
    outcome: input.outcome ?? (input.errorCategory != null ? "error" : "success"),
    evidenceKind,
    sampleRate: getPerfSampleRate(),
    thresholdMs,
    ...(renderGitCommit ? { renderGitCommit } : {}),
    ...(renderInstanceId ? { renderInstanceId } : {}),
    ...(input.resultState != null ? { resultState: input.resultState } : {}),
    ...(input.errorCategory != null ? { errorCategory: input.errorCategory } : {}),
    ...(input.errorComponent != null ? { errorComponent: input.errorComponent } : {}),
    ...(input.itemCount != null ? { itemCount: input.itemCount } : {}),
    ...(input.rowCount != null ? { rowCount: input.rowCount } : {}),
    ...(input.questMarkerSourceCount != null ? { questMarkerSourceCount: input.questMarkerSourceCount } : {}),
    ...(input.questMarkerSlowestSource != null
      ? { questMarkerSlowestSource: input.questMarkerSlowestSource }
      : {}),
    ...(input.questMarkerSlowestSourceMs != null
      ? { questMarkerSlowestSourceMs: roundMs(input.questMarkerSlowestSourceMs) }
      : {}),
    ...(input.filter !== undefined ? { filter: input.filter } : {}),
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
    ...(input.page !== undefined ? { page: input.page } : {}),
    ...(input.dbMs != null ? { dbMs: roundMs(input.dbMs) } : {}),
    ...(input.computeMs != null ? { computeMs: roundMs(input.computeMs) } : {}),
    ...(input.telegramMs != null ? { telegramMs: roundMs(input.telegramMs) } : {}),
    ...(input.telegramEditMs != null ? { telegramEditMs: roundMs(input.telegramEditMs) } : {}),
    totalMs: roundMs(input.totalMs)
  };
}

export function classifyPerformanceError(error: unknown): PerformanceErrorCategory {
  const record = asErrorRecord(error);
  const errorCode = record?.error_code;
  const code = typeof record?.code === "string" ? record.code.toUpperCase() : null;
  const name = typeof record?.name === "string" ? record.name : null;
  const message = typeof record?.message === "string" ? record.message : "";

  if (errorCode === 429 || errorCode === "429") {
    return "telegram-rate-limit";
  }

  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    name === "AbortError"
  ) {
    return "timeout";
  }

  if (code === "SQLITE_BUSY" || /\bSQLITE_BUSY\b|database is locked/i.test(message)) {
    return "database-locked";
  }

  if (code?.startsWith("P") && /^P\d{4}$/.test(code)) {
    return "database";
  }

  if (name === "GrammyError" || name === "HttpError" || typeof errorCode === "number") {
    return "telegram-api";
  }

  return "unknown";
}

function shouldSamplePerfTiming(): boolean {
  return Math.random() < getPerfSampleRate();
}

function getPerfSampleRate(): number {
  const raw = process.env.KVESTARNIA_PERF_SAMPLE_RATE;
  const parsed = raw === undefined ? DEFAULT_PERF_SAMPLE_RATE : Number(raw);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_PERF_SAMPLE_RATE;
  }

  return Math.min(1, Math.max(0, parsed));
}

function getSlowPerfThresholdMs(): number {
  const raw = process.env.KVESTARNIA_PERF_SLOW_MS;
  const parsed = raw === undefined ? DEFAULT_SLOW_HOT_PATH_MS : Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SLOW_HOT_PATH_MS;
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function asErrorRecord(error: unknown): Record<string, unknown> | null {
  return error !== null && typeof error === "object"
    ? error as Record<string, unknown>
    : null;
}

function getSafeRenderMetadata(name: "RENDER_GIT_COMMIT" | "RENDER_INSTANCE_ID", pattern: RegExp): string | null {
  const value = process.env[name]?.trim();
  return value && pattern.test(value) ? value : null;
}
