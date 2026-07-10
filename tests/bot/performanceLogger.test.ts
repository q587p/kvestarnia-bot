import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logPerformanceTiming,
  sanitizePerfTimingPayload,
  shouldLogPerfTiming
} from "../../src/bot/performanceLogger";

describe("performance logger", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is quiet for fast calls by default", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logPerformanceTiming({
      route: "inventory.page",
      telegramUserId: 42n,
      totalMs: 13,
      dbMs: 5,
      computeMs: 3,
      telegramMs: 5
    });

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("samples fast calls only when the environment gate allows it", () => {
    vi.stubEnv("KVESTARNIA_PERF_SAMPLE_RATE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logPerformanceTiming({
      route: "yeger.bandages",
      telegramUserId: 42n,
      resultState: "ready",
      rowCount: 3,
      totalMs: 23
    });

    expect(info).toHaveBeenCalledWith("Kvestarnia sampled perf timing", expect.objectContaining({
      route: "yeger.bandages",
      telegramUserId: "42",
      resultState: "ready",
      rowCount: 3
    }));
  });

  it("always logs calls above the slow threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(shouldLogPerfTiming({ route: "fight.turn", totalMs: 351 }, 1)).toBe(true);
    logPerformanceTiming({
      route: "fight.turn",
      totalMs: 351,
      dbMs: 93.34,
      computeMs: 13.05,
      telegramMs: 244.6
    });

    expect(warn).toHaveBeenCalledWith("Kvestarnia slow perf timing", expect.objectContaining({
      route: "fight.turn",
      dbMs: 93.3,
      computeMs: 13.1,
      telegramMs: 244.6,
      totalMs: 351
    }));
  });

  it("sanitizes payloads to compact route ids, counts, and timings", () => {
    const payload = sanitizePerfTimingPayload({
      route: "daily-korchma-round.scene",
      telegramUserId: 42n,
      resultState: "scene",
      rowCount: 2,
      dbMs: 5.04,
      computeMs: 1.94,
      telegramMs: 9.99,
      totalMs: 16.97
    });

    expect(payload).toEqual({
      route: "daily-korchma-round.scene",
      slow: false,
      telegramUserId: "42",
      resultState: "scene",
      rowCount: 2,
      dbMs: 5,
      computeMs: 1.9,
      telegramMs: 10,
      totalMs: 17
    });
    expect(Object.keys(payload)).not.toEqual(expect.arrayContaining([
      "text",
      "callbackData",
      "token",
      "resultJson"
    ]));
  });
});
