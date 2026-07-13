import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createHealthRecoveryNotificationScheduler } from "../../src/bot/healthRecoveryNotificationScheduler";
import { presentHealthRecoveryNotification } from "../../src/services/healthRecoveryNotificationService";

const emptyMetrics = { due: 0, claimed: 0, sent: 0, retried: 0, suppressed: 0, errors: 0 };

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

  it("keeps the exact compact Ukrainian notice", () => {
    expect(presentHealthRecoveryNotification()).toBe(
      "❤️ Життя відновилося повністю.\n\nОрганізм подав заявку на продовження пригод і сам її погодив."
    );
  });
});
