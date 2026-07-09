import { performance } from "node:perf_hooks";

export interface HotPathTimingInput {
  route: string;
  telegramUserId?: bigint | string | number | null;
  itemCount?: number | null;
  filter?: string | null;
  sort?: string | null;
  page?: number | null;
  dbMs?: number | null;
  computeMs?: number | null;
  telegramEditMs?: number | null;
  totalMs: number;
  thresholdMs?: number;
}

const DEFAULT_SLOW_HOT_PATH_MS = 350;

export function hotPathNow(): number {
  return performance.now();
}

export function elapsedMs(startedAt: number): number {
  return performance.now() - startedAt;
}

export function logSlowHotPathTiming(input: HotPathTimingInput): void {
  const thresholdMs = input.thresholdMs ?? DEFAULT_SLOW_HOT_PATH_MS;

  if (input.totalMs < thresholdMs) {
    return;
  }

  console.warn("Kvestarnia slow item hot path", {
    route: input.route,
    ...(input.telegramUserId != null ? { telegramUserId: input.telegramUserId.toString() } : {}),
    ...(input.itemCount != null ? { itemCount: input.itemCount } : {}),
    ...(input.filter !== undefined ? { filter: input.filter } : {}),
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
    ...(input.page !== undefined ? { page: input.page } : {}),
    ...(input.dbMs != null ? { dbMs: roundMs(input.dbMs) } : {}),
    ...(input.computeMs != null ? { computeMs: roundMs(input.computeMs) } : {}),
    ...(input.telegramEditMs != null ? { telegramEditMs: roundMs(input.telegramEditMs) } : {}),
    totalMs: roundMs(input.totalMs)
  });
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}
