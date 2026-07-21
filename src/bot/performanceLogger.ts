import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

export interface HotPathTimingInput {
  route: string;
  /** Accepted for call-site compatibility; never emitted in performance logs. */
  telegramUserId?: bigint | string | number | null;
  itemCount?: number | null;
  rowCount?: number | null;
  questMarkerSourceCount?: number | null;
  questMarkerSlowestSource?: QuestMarkerPerformanceSource | null;
  /** Overlapping high-level source wall-clock latency, not exclusive SQL time. */
  questMarkerSlowestSourceMs?: number | null;
  fightTurnDbStageCount?: number | null;
  fightTurnSlowestDbStage?: FightTurnPerformanceStage | null;
  /** Non-additive stage wall-clock latency; stages are measured without nesting. */
  fightTurnSlowestDbStageMs?: number | null;
  resultState?: string | null;
  filter?: string | null;
  sort?: string | null;
  page?: number | null;
  dbMs?: number | null;
  computeMs?: number | null;
  telegramMs?: number | null;
  telegramEditMs?: number | null;
  preRouteMs?: number | null;
  pendingRaidMs?: number | null;
  combatLockMs?: number | null;
  presenceMs?: number | null;
  ackMs?: number | null;
  firstPresentationMs?: number | null;
  firstPresentationMethod?: CallbackPresentationMethod | null;
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

export type PerformanceErrorComponent = "db" | "compute" | "telegram" | "middleware" | "handler";
export type CallbackPresentationMethod = "edit" | "send";

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

export type FightTurnPerformanceStage = "yeger" | "resolve" | "presence" | "reward-progress";

const DEFAULT_SLOW_HOT_PATH_MS = 350;
const DEFAULT_PERF_SAMPLE_RATE = 0;
const MAX_QUEST_MARKER_SOURCE_COUNT = 32;
const MAX_QUEST_MARKER_SOURCE_MS = 60_000;
const MAX_FIGHT_TURN_DB_STAGE_COUNT = 8;
const MAX_FIGHT_TURN_DB_STAGE_MS = 60_000;
const QUEST_MARKER_PERFORMANCE_SOURCES = new Set<QuestMarkerPerformanceSource>([
  "adventure",
  "fight",
  "first-korchma",
  "yeger",
  "cellar",
  "barrel-beer",
  "daily-korchma",
  "item-upgrades",
  "cellar-grownup"
]);
const FIGHT_TURN_PERFORMANCE_STAGES = new Set<FightTurnPerformanceStage>([
  "yeger",
  "resolve",
  "presence",
  "reward-progress"
]);
const performanceRecordStorage = new AsyncLocalStorage<{ nested?: HotPathTimingInput }>();

export function hotPathNow(): number {
  return performance.now();
}

export function elapsedMs(startedAt: number): number {
  return performance.now() - startedAt;
}

export function logPerformanceTiming(input: HotPathTimingInput): void {
  const aggregate = performanceRecordStorage.getStore();
  if (aggregate) {
    if (!aggregate.nested || shouldPreferNestedTiming(input, aggregate.nested)) {
      aggregate.nested = input;
    }
    return;
  }

  emitPerformanceTiming(input);
}

export function runWithSinglePerformanceRecord<T>(callback: () => Promise<T>): Promise<T> {
  return performanceRecordStorage.run({}, callback);
}

export function logAggregatedPerformanceTiming(input: HotPathTimingInput): void {
  const nested = performanceRecordStorage.getStore()?.nested;
  if (!nested) {
    emitPerformanceTiming(input);
    return;
  }

  const resultState = nested.resultState ?? input.resultState;
  const errorCategory = nested.errorCategory ?? input.errorCategory;
  const errorComponent = nested.errorComponent ?? input.errorComponent;
  emitPerformanceTiming({
    ...nested,
    ...input,
    route: nested.route,
    ...(resultState === undefined ? {} : { resultState }),
    ...(errorCategory === undefined ? {} : { errorCategory }),
    ...(errorComponent === undefined ? {} : { errorComponent })
  });
}

function emitPerformanceTiming(input: HotPathTimingInput): void {
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

function shouldPreferNestedTiming(
  candidate: HotPathTimingInput,
  current: HotPathTimingInput
): boolean {
  const candidateFailed = candidate.outcome === "error" || candidate.errorCategory != null;
  const currentFailed = current.outcome === "error" || current.errorCategory != null;
  if (candidateFailed !== currentFailed) {
    return candidateFailed;
  }
  return candidate.totalMs > current.totalMs;
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
  const questMarkerSourceCount = sanitizeBoundedNumber(
    input.questMarkerSourceCount,
    MAX_QUEST_MARKER_SOURCE_COUNT,
    true
  );
  const questMarkerSlowestSource = sanitizeQuestMarkerPerformanceSource(
    input.questMarkerSlowestSource
  );
  const questMarkerSlowestSourceMs = sanitizeBoundedNumber(
    input.questMarkerSlowestSourceMs,
    MAX_QUEST_MARKER_SOURCE_MS
  );
  const fightTurnDbStageCount = sanitizeBoundedNumber(
    input.fightTurnDbStageCount,
    MAX_FIGHT_TURN_DB_STAGE_COUNT,
    true
  );
  const fightTurnSlowestDbStage = sanitizeFightTurnPerformanceStage(
    input.fightTurnSlowestDbStage
  );
  const fightTurnSlowestDbStageMs = sanitizeBoundedNumber(
    input.fightTurnSlowestDbStageMs,
    MAX_FIGHT_TURN_DB_STAGE_MS
  );

  const callbackTimings = {
    preRouteMs: sanitizeBoundedNumber(input.preRouteMs, MAX_QUEST_MARKER_SOURCE_MS),
    pendingRaidMs: sanitizeBoundedNumber(input.pendingRaidMs, MAX_QUEST_MARKER_SOURCE_MS),
    combatLockMs: sanitizeBoundedNumber(input.combatLockMs, MAX_QUEST_MARKER_SOURCE_MS),
    presenceMs: sanitizeBoundedNumber(input.presenceMs, MAX_QUEST_MARKER_SOURCE_MS),
    ackMs: sanitizeBoundedNumber(input.ackMs, MAX_QUEST_MARKER_SOURCE_MS),
    firstPresentationMs: sanitizeBoundedNumber(input.firstPresentationMs, MAX_QUEST_MARKER_SOURCE_MS)
  };

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
    ...(questMarkerSourceCount !== undefined ? { questMarkerSourceCount } : {}),
    ...(questMarkerSlowestSource !== undefined && questMarkerSlowestSourceMs !== undefined
      ? { questMarkerSlowestSource }
      : {}),
    ...(questMarkerSlowestSource !== undefined && questMarkerSlowestSourceMs !== undefined
      ? { questMarkerSlowestSourceMs: roundMs(questMarkerSlowestSourceMs) }
      : {}),
    ...(fightTurnDbStageCount !== undefined ? { fightTurnDbStageCount } : {}),
    ...(fightTurnSlowestDbStage !== undefined && fightTurnSlowestDbStageMs !== undefined
      ? { fightTurnSlowestDbStage }
      : {}),
    ...(fightTurnSlowestDbStage !== undefined && fightTurnSlowestDbStageMs !== undefined
      ? { fightTurnSlowestDbStageMs: roundMs(fightTurnSlowestDbStageMs) }
      : {}),
    ...(input.filter !== undefined ? { filter: input.filter } : {}),
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
    ...(input.page !== undefined ? { page: input.page } : {}),
    ...(input.dbMs != null ? { dbMs: roundMs(input.dbMs) } : {}),
    ...(input.computeMs != null ? { computeMs: roundMs(input.computeMs) } : {}),
    ...(input.telegramMs != null ? { telegramMs: roundMs(input.telegramMs) } : {}),
    ...(input.telegramEditMs != null ? { telegramEditMs: roundMs(input.telegramEditMs) } : {}),
    ...Object.fromEntries(
      Object.entries(callbackTimings)
        .filter((entry): entry is [string, number] => entry[1] !== undefined)
        .map(([key, value]) => [key, roundMs(value)])
    ),
    ...(input.firstPresentationMethod === "edit" || input.firstPresentationMethod === "send"
      ? { firstPresentationMethod: input.firstPresentationMethod }
      : {}),
    totalMs: roundMs(input.totalMs)
  };
}

export function createFightTurnDbAttribution(now: () => number = hotPathNow) {
  let stageCount = 0;
  let slowestStage: FightTurnPerformanceStage | null = null;
  let slowestStageMs = 0;

  return {
    async measure<T>(stage: FightTurnPerformanceStage, lookup: () => Promise<T>): Promise<T> {
      stageCount += 1;
      const startedAt = now();

      try {
        return await lookup();
      } finally {
        const elapsed = now() - startedAt;
        const durationMs = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
        if (durationMs > slowestStageMs) {
          slowestStage = stage;
          slowestStageMs = durationMs;
        }
      }
    },
    fields() {
      return {
        fightTurnDbStageCount: stageCount,
        ...(slowestStage === null
          ? {}
          : {
              fightTurnSlowestDbStage: slowestStage,
              fightTurnSlowestDbStageMs: slowestStageMs
            })
      };
    }
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

function sanitizeBoundedNumber(
  value: number | null | undefined,
  maximum: number,
  integer = false
): number | undefined {
  if (value == null || !Number.isFinite(value)) {
    return undefined;
  }

  const bounded = Math.min(maximum, Math.max(0, value));
  return integer ? Math.round(bounded) : bounded;
}

function sanitizeQuestMarkerPerformanceSource(
  value: QuestMarkerPerformanceSource | null | undefined
): QuestMarkerPerformanceSource | undefined {
  return value !== null && value !== undefined && QUEST_MARKER_PERFORMANCE_SOURCES.has(value)
    ? value
    : undefined;
}

function sanitizeFightTurnPerformanceStage(
  value: FightTurnPerformanceStage | null | undefined
): FightTurnPerformanceStage | undefined {
  return value !== null && value !== undefined && FIGHT_TURN_PERFORMANCE_STAGES.has(value)
    ? value
    : undefined;
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
