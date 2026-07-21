import { AsyncLocalStorage } from "node:async_hooks";
import type { Bot } from "grammy";
import {
  classifyPerformanceError,
  hotPathNow,
  logAggregatedPerformanceTiming,
  runWithSinglePerformanceRecord,
  type CallbackPresentationMethod,
  type HotPathTimingInput
} from "./performanceLogger";

type UpdateComponent = "pendingRaid" | "combatLock" | "presence";

interface CallbackTrace {
  route: string;
  startedAt: number;
  preRouteMs?: number;
  pendingRaidMs: number;
  combatLockMs: number;
  presenceMs: number;
  ackMs?: number;
  firstPresentationMs?: number;
  firstPresentationMethod?: CallbackPresentationMethod;
  routeStarted: boolean;
  ended: boolean;
}

interface UpdateState {
  reads: Map<string, Promise<unknown>>;
  trace: CallbackTrace | null;
}

const updateStorage = new AsyncLocalStorage<UpdateState>();

export function installUpdatePerformanceTracing(bot: Bot): void {
  bot.api.config.use(async (prev, method, payload, signal) => {
    const result = await prev(method, payload, signal);
    observeTelegramMethod(method);
    return result;
  });

  bot.use(async (ctx, next) => {
    const callbackData = ctx.callbackQuery?.data;
    const trace = callbackData
      ? createCallbackTrace(classifyCallbackRoute(callbackData))
      : null;

    const runUpdate = () => updateStorage.run({ reads: new Map(), trace }, async () => {
      try {
        await next();
        finishCallbackTrace("handled");
      } catch (error) {
        finishCallbackTrace("terminal-error", error);
        throw error;
      }
    });
    await (trace ? runWithSinglePerformanceRecord(runUpdate) : runUpdate());
  });
}

export function registerUpdateRouteBoundary(bot: Bot): void {
  bot.use(async (_ctx, next) => {
    const trace = updateStorage.getStore()?.trace;
    if (trace && !trace.routeStarted) {
      trace.routeStarted = true;
      trace.preRouteMs = elapsed(trace.startedAt);
    }
    await next();
  });
}

export function beginUpdateComponent(component: UpdateComponent): { end(): void } {
  const trace = updateStorage.getStore()?.trace;
  const startedAt = hotPathNow();
  let ended = false;

  return {
    end(): void {
      if (ended) {
        return;
      }
      ended = true;
      if (trace) {
        addComponentMs(trace, component, elapsed(startedAt));
      }
    }
  };
}

export async function measureUpdateComponent<T>(
  component: UpdateComponent,
  callback: () => Promise<T>
): Promise<T> {
  const measurement = beginUpdateComponent(component);
  try {
    return await callback();
  } finally {
    measurement.end();
  }
}

export function memoizeUpdateRead<T>(
  key: string,
  loader: () => Promise<T>,
  component?: UpdateComponent
): Promise<T> {
  const state = updateStorage.getStore();
  if (!state) {
    return loader();
  }

  const existing = state.reads.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const pending = component
    ? measureUpdateComponent(component, loader)
    : loader();
  state.reads.set(key, pending);
  void pending.catch(() => {
    if (state.reads.get(key) === pending) {
      state.reads.delete(key);
    }
  });
  return pending;
}

export function getMemoizedUpdateRead<T>(key: string): Promise<T> | undefined {
  return updateStorage.getStore()?.reads.get(key) as Promise<T> | undefined;
}

export function invalidateUpdateReads(prefix?: string): void {
  const reads = updateStorage.getStore()?.reads;
  if (!reads) {
    return;
  }
  if (!prefix) {
    reads.clear();
    return;
  }
  for (const key of reads.keys()) {
    if (key.startsWith(prefix)) {
      reads.delete(key);
    }
  }
}

function createCallbackTrace(route: string): CallbackTrace {
  return {
    route,
    startedAt: hotPathNow(),
    pendingRaidMs: 0,
    combatLockMs: 0,
    presenceMs: 0,
    routeStarted: false,
    ended: false
  };
}

function finishCallbackTrace(resultState: "handled" | "terminal-error", error?: unknown): void {
  const trace = updateStorage.getStore()?.trace;
  if (!trace || trace.ended) {
    return;
  }
  trace.ended = true;
  const totalMs = elapsed(trace.startedAt);
  const fields: HotPathTimingInput = {
    route: trace.route,
    resultState,
    preRouteMs: trace.preRouteMs ?? totalMs,
    pendingRaidMs: trace.pendingRaidMs,
    combatLockMs: trace.combatLockMs,
    presenceMs: trace.presenceMs,
    ...(trace.ackMs === undefined ? {} : { ackMs: trace.ackMs }),
    ...(trace.firstPresentationMs === undefined
      ? {}
      : {
          firstPresentationMs: trace.firstPresentationMs,
          firstPresentationMethod: trace.firstPresentationMethod
        }),
    totalMs,
    ...(error === undefined
      ? { outcome: "success" as const }
      : {
          outcome: "error" as const,
          errorCategory: classifyPerformanceError(error),
          errorComponent: trace.routeStarted ? "handler" as const : "middleware" as const
        })
  };
  logAggregatedPerformanceTiming(fields);
}

function observeTelegramMethod(method: string): void {
  const trace = updateStorage.getStore()?.trace;
  if (!trace) {
    return;
  }
  if (method === "answerCallbackQuery" && trace.ackMs === undefined) {
    trace.ackMs = elapsed(trace.startedAt);
  }
  if (trace.firstPresentationMs !== undefined) {
    return;
  }
  const presentationMethod = classifyPresentationMethod(method);
  if (presentationMethod) {
    trace.firstPresentationMs = elapsed(trace.startedAt);
    trace.firstPresentationMethod = presentationMethod;
  }
}

function classifyPresentationMethod(method: string): CallbackPresentationMethod | null {
  if (method === "sendMessage" || method === "sendPhoto" || method === "sendDocument") {
    return "send";
  }
  if (
    method === "editMessageText" ||
    method === "editMessageCaption" ||
    method === "editMessageMedia" ||
    method === "editMessageReplyMarkup"
  ) {
    return "edit";
  }
  return null;
}

function classifyCallbackRoute(data: string): string {
  const [version, namespace, kind] = data.split(":", 3);
  if (version !== "v1") {
    return "callback.unknown";
  }
  if (namespace === "sh") {
    return kind === "gpr" ? "callback.shynok.dice-rules" : "callback.shynok";
  }
  if (namespace === "place") {
    return "callback.place";
  }
  if (namespace === "menu") {
    return "callback.menu";
  }
  if (namespace === "fight") {
    return "callback.fight";
  }
  if (namespace === "party") {
    return "callback.party";
  }
  if (namespace === "duel") {
    return "callback.duel";
  }
  if (namespace === "dkr") {
    return "callback.daily-korchma";
  }
  return "callback.other";
}

function addComponentMs(trace: CallbackTrace, component: UpdateComponent, milliseconds: number): void {
  if (component === "pendingRaid") {
    trace.pendingRaidMs += milliseconds;
  } else if (component === "combatLock") {
    trace.combatLockMs += milliseconds;
  } else {
    trace.presenceMs += milliseconds;
  }
}

function elapsed(startedAt: number): number {
  const value = hotPathNow() - startedAt;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
