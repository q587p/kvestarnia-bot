import { performance } from "node:perf_hooks";

export interface HotPathTimingInput {
  route: string;
  telegramUserId?: bigint | string | number | null;
  itemCount?: number | null;
  rowCount?: number | null;
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
}

const DEFAULT_SLOW_HOT_PATH_MS = 350;
const DEFAULT_PERF_SAMPLE_RATE = 0;

export function hotPathNow(): number {
  return performance.now();
}

export function elapsedMs(startedAt: number): number {
  return performance.now() - startedAt;
}

export function logSlowHotPathTiming(input: HotPathTimingInput): void {
  logPerformanceTiming(input);
}

export function logPerformanceTiming(input: HotPathTimingInput): void {
  const thresholdMs = input.thresholdMs ?? getSlowPerfThresholdMs();
  const totalMs = input.totalMs;
  const slow = totalMs >= thresholdMs;

  if (!slow && !shouldSamplePerfTiming()) {
    return;
  }

  const payload = sanitizePerfTimingPayload(input, thresholdMs);
  const log = slow ? console.warn : console.info;

  log(slow ? "Kvestarnia slow perf timing" : "Kvestarnia sampled perf timing", payload);
}

export function startPerfSpan(
  route: string,
  fields: Omit<HotPathTimingInput, "route" | "totalMs" | "dbMs" | "computeMs" | "telegramMs" | "telegramEditMs"> = {}
) {
  const totalStartedAt = hotPathNow();
  let dbMs = 0;
  let computeMs = 0;
  let telegramMs = 0;

  return {
    async measureDb<T>(callback: () => Promise<T>): Promise<T> {
      const startedAt = hotPathNow();
      const result = await callback();
      dbMs += elapsedMs(startedAt);

      return result;
    },
    measureCompute<T>(callback: () => T): T {
      const startedAt = hotPathNow();
      const result = callback();
      computeMs += elapsedMs(startedAt);

      return result;
    },
    async measureTelegram<T>(callback: () => Promise<T>): Promise<T> {
      const startedAt = hotPathNow();
      const result = await callback();
      telegramMs += elapsedMs(startedAt);

      return result;
    },
    end(extra: Partial<Omit<HotPathTimingInput, "route" | "totalMs" | "dbMs" | "computeMs" | "telegramMs">> = {}): void {
      logPerformanceTiming({
        route,
        ...fields,
        ...extra,
        dbMs,
        computeMs,
        telegramMs,
        totalMs: elapsedMs(totalStartedAt)
      });
    }
  };
}

export function shouldLogPerfTiming(input: HotPathTimingInput, randomValue = Math.random()): boolean {
  const thresholdMs = input.thresholdMs ?? getSlowPerfThresholdMs();
  if (input.totalMs >= thresholdMs) {
    return true;
  }

  return randomValue < getPerfSampleRate();
}

export function sanitizePerfTimingPayload(
  input: HotPathTimingInput,
  thresholdMs = input.thresholdMs ?? getSlowPerfThresholdMs()
): Record<string, string | number | null | boolean> {
  return {
    route: input.route,
    slow: input.totalMs >= thresholdMs,
    ...(input.telegramUserId != null ? { telegramUserId: input.telegramUserId.toString() } : {}),
    ...(input.resultState != null ? { resultState: input.resultState } : {}),
    ...(input.itemCount != null ? { itemCount: input.itemCount } : {}),
    ...(input.rowCount != null ? { rowCount: input.rowCount } : {}),
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
