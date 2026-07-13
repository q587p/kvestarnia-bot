import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyPerformanceError,
  logPerformanceTiming,
  sanitizePerfTimingPayload,
  startPerfSpan,
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
      resultState: "ready",
      rowCount: 3,
      evidenceKind: "random-sample",
      sampleRate: 1
    }));
    expect(info.mock.calls[0]?.[1]).not.toHaveProperty("telegramUserId");
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

  it("keeps terminal errors independent of sampling and threshold gates", () => {
    vi.stubEnv("KVESTARNIA_PERF_SAMPLE_RATE", "0");

    expect(shouldLogPerfTiming({
      route: "inventory.open",
      totalMs: 1,
      thresholdMs: 999_999,
      outcome: "error",
      errorCategory: "database"
    }, 1)).toBe(true);
  });

  it("sanitizes payloads to compact route ids, counts, and timings", () => {
    const payload = sanitizePerfTimingPayload({
      route: "daily-korchma-round.scene",
      telegramUserId: 42n,
      resultState: "scene",
      rowCount: 2,
      questMarkerSourceCount: 8,
      questMarkerSlowestSource: "fight",
      questMarkerSlowestSourceMs: 13.04,
      dbMs: 5.04,
      computeMs: 1.94,
      telegramMs: 9.99,
      telegramEditMs: 3.33,
      totalMs: 16.97
    });

    expect(payload).toEqual({
      route: "daily-korchma-round.scene",
      slow: false,
      outcome: "success",
      evidenceKind: "random-sample",
      sampleRate: 0,
      thresholdMs: 350,
      resultState: "scene",
      rowCount: 2,
      questMarkerSourceCount: 8,
      questMarkerSlowestSource: "fight",
      questMarkerSlowestSourceMs: 13,
      dbMs: 5,
      computeMs: 1.9,
      telegramMs: 10,
      telegramEditMs: 3.3,
      totalMs: 17
    });
    expect(payload).not.toHaveProperty("telegramUserId");
    expect(Object.keys(payload)).not.toEqual(expect.arrayContaining([
      "text",
      "callbackData",
      "token",
      "resultJson"
    ]));
  });

  it("logs a measured failure once without raw error details or player identifiers", async () => {
    const error = Object.assign(new Error("secret Telegram response with callback token"), {
      name: "GrammyError",
      error_code: 429
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const span = startPerfSpan("fight.turn", { telegramUserId: 42587n });

    await expect(span.measureTelegram(() => Promise.reject(error))).rejects.toBe(error);
    span.end({ resultState: "should-not-log-twice" });

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      "Kvestarnia failed perf timing",
      expect.objectContaining({
        route: "fight.turn",
        outcome: "error",
        evidenceKind: "terminal-error",
        errorCategory: "telegram-rate-limit",
        errorComponent: "telegram",
        sampleRate: 0,
        thresholdMs: 350
      })
    );
    const payload = logged.mock.calls[0]?.[1] as unknown;
    expect(payload).not.toHaveProperty("telegramUserId");
    expect(JSON.stringify(payload)).not.toContain(error.message);
    expect(JSON.stringify(payload)).not.toContain("42587");
    expect(JSON.stringify(payload)).not.toContain("should-not-log-twice");
  });

  it("classifies database and timeout failures without exposing their messages", () => {
    expect(classifyPerformanceError({ code: "SQLITE_BUSY", message: "database is locked: private path" }))
      .toBe("database-locked");
    expect(classifyPerformanceError({ code: "P2028", message: "private transaction details" }))
      .toBe("database");
    expect(classifyPerformanceError({ code: "ETIMEDOUT", message: "private URL" }))
      .toBe("timeout");
    expect(classifyPerformanceError(new Error("private unknown details"))).toBe("unknown");
  });

  it("preserves inventory Telegram edit time on terminal failure", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("private edited message"), { name: "HttpError" });
    const span = startPerfSpan("item.detail");

    await expect(span.measureTelegramEdit(() => Promise.reject(error))).rejects.toBe(error);

    expect(logged).toHaveBeenCalledWith(
      "Kvestarnia failed perf timing",
      expect.objectContaining({
        route: "item.detail",
        errorCategory: "telegram-api",
        errorComponent: "telegram"
      })
    );
    const payload = logged.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(payload?.telegramEditMs).toEqual(expect.any(Number));
  });

  it("includes only validated Render deploy metadata", () => {
    vi.stubEnv("RENDER_GIT_COMMIT", "9b00adc2df26f55a535add76de92a7b44d6fb139");
    vi.stubEnv("RENDER_INSTANCE_ID", "srv-kvestarnia-abc_123");

    expect(sanitizePerfTimingPayload({ route: "fight.turn", totalMs: 351 })).toEqual(
      expect.objectContaining({
        renderGitCommit: "9b00adc2df26f55a535add76de92a7b44d6fb139",
        renderInstanceId: "srv-kvestarnia-abc_123"
      })
    );

    vi.stubEnv("RENDER_GIT_COMMIT", "not a sha");
    vi.stubEnv("RENDER_INSTANCE_ID", "unsafe instance value with spaces");
    const payload = sanitizePerfTimingPayload({ route: "fight.turn", totalMs: 351 });
    expect(payload).not.toHaveProperty("renderGitCommit");
    expect(payload).not.toHaveProperty("renderInstanceId");
  });
});
