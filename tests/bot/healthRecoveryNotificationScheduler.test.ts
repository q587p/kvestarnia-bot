import type { Bot } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHealthRecoveryNotificationScheduler } from "../../src/bot/healthRecoveryNotificationScheduler";
import { presentHealthRecoveryNotification } from "../../src/services/healthRecoveryNotificationService";

const emptyMetrics = { due: 0, claimed: 0, sent: 0, retried: 0, suppressed: 0, errors: 0 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("health recovery notification scheduler", () => {
  it("uses the 60-second cadence and batch limit 13", async () => {
    vi.useFakeTimers();
    const runBatch = vi.fn().mockResolvedValue(emptyMetrics);
    const scheduler = createHealthRecoveryNotificationScheduler(
      { runBatch },
      { api: {} } as Bot
    );
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      scheduler.start();
      await Promise.resolve();
      expect(runBatch).toHaveBeenCalledTimes(1);
      expect(runBatch).toHaveBeenLastCalledWith(expect.anything(), expect.any(Date), { limit: 13 });
      await vi.advanceTimersByTimeAsync(59_999);
      expect(runBatch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(runBatch).toHaveBeenCalledTimes(2);
      await scheduler.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("prevents overlapping ticks and stop drains in-flight work", async () => {
    let resolve: ((value: typeof emptyMetrics) => void) | undefined;
    const runBatch = vi.fn(() => new Promise<typeof emptyMetrics>((done) => {
      resolve = done;
    }));
    const scheduler = createHealthRecoveryNotificationScheduler(
      { runBatch },
      { api: {} } as Bot,
      { now: () => new Date("2026-07-13T10:00:00.000Z") }
    );
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const first = scheduler.tick();
    expect(await scheduler.tick()).toEqual(emptyMetrics);
    const stopped = scheduler.stop();
    let stopFinished = false;
    void stopped.then(() => { stopFinished = true; });
    await Promise.resolve();
    expect(stopFinished).toBe(false);
    resolve?.(emptyMetrics);
    await first;
    await stopped;
    expect(runBatch).toHaveBeenCalledTimes(1);
  });

  it("does not log an all-zero successful tick", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scheduler = createHealthRecoveryNotificationScheduler(
      { runBatch: vi.fn().mockResolvedValue(emptyMetrics) },
      { api: {} } as Bot
    );

    await scheduler.tick();

    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("logs one compact activity line when due work exists", async () => {
    const metrics = { ...emptyMetrics, due: 1 };
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scheduler = createHealthRecoveryNotificationScheduler(
      { runBatch: vi.fn().mockResolvedValue(metrics) },
      { api: {} } as Bot
    );

    await scheduler.tick();

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]).toHaveLength(1);
    expect(info.mock.calls[0]?.[0]).toMatch(
      /^\u041a\u0432\u0435\u0441\u0442\u0430\u0440\u043d\u044f: tick .+ durationMs=\d+ due=1 claimed=0 sent=0 retried=0 suppressed=0 errors=0$/
    );
    expect(info.mock.calls[0]?.[0]).not.toContain("\n");
    expect(error).not.toHaveBeenCalled();
  });

  it("logs returned tick errors exactly once at error severity", async () => {
    const metrics = { ...emptyMetrics, due: 1, claimed: 1, errors: 1 };
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scheduler = createHealthRecoveryNotificationScheduler(
      { runBatch: vi.fn().mockResolvedValue(metrics) },
      { api: {} } as Bot
    );

    await scheduler.tick();

    expect(info).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]).toHaveLength(1);
    expect(error.mock.calls[0]?.[0]).toMatch(
      /^\u041a\u0432\u0435\u0441\u0442\u0430\u0440\u043d\u044f: tick .+ durationMs=\d+ due=1 claimed=1 sent=0 retried=0 suppressed=0 errors=1$/
    );
    expect(error.mock.calls[0]?.[0]).not.toContain("\n");
  });

  it("logs a rejected runBatch", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const scheduler = createHealthRecoveryNotificationScheduler(
      { runBatch: vi.fn().mockRejectedValue(new Error("batch failed")) },
      { api: {} } as Bot
    );

    scheduler.start();
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    await scheduler.stop();

    expect(info).not.toHaveBeenCalled();
    expect(error.mock.calls[0]).toHaveLength(1);
    expect(error.mock.calls[0]?.[0]).toContain("errorName=Error");
    expect(error.mock.calls[0]?.[0]).not.toContain("\n");
  });

  it("keeps the exact compact Ukrainian notice", () => {
    expect(presentHealthRecoveryNotification()).toBe(
      "❤️ Життя відновилося повністю.\n\nОрганізм подав заявку на продовження пригод і сам її погодив."
    );
  });
});
