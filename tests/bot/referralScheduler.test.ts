import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "grammy";
import { createReferralScheduler } from "../../src/bot/referralScheduler";
import type { ReferralService } from "../../src/services/referralService";

describe("referral scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reconciles rewards and marks a valid durable notification sent", async () => {
    const notification = {
      id: "notice-1",
      claimToken: "claim-1",
      kind: "REFERRAL_JOINED" as const,
      telegramUserId: 42n,
      payload: { inviteeName: "Прибула" },
      attemptCount: 1
    };
    const markNotificationSent = vi.fn().mockResolvedValue(true);
    const rescheduleNotification = vi.fn().mockResolvedValue(true);
    const service = {
      reconcileDue: vi.fn().mockResolvedValue({ due: 4, granted: 3 }),
      reconcileReferralAchievements: vi.fn().mockResolvedValue({ due: 1, reconciled: 1 }),
      reconcileArrivalChronicles: vi.fn().mockResolvedValue({ due: 1, recorded: 1 }),
      claimNextNotification: vi.fn()
        .mockResolvedValueOnce(notification)
        .mockResolvedValueOnce(null),
      markNotificationSent,
      rescheduleNotification
    } as unknown as ReferralService;
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const scheduler = createReferralScheduler(service, { api: { sendMessage } } as unknown as Bot);

    await expect(scheduler.tick()).resolves.toEqual({
      dueAchievementProjections: 1,
      reconciledAchievementProjections: 1,
      dueArrivalChronicles: 1,
      recordedArrivalChronicles: 1,
      dueRewards: 4,
      grantedRewards: 3,
      claimedNotifications: 1,
      sentNotifications: 1,
      retriedNotifications: 0
    });
    expect(sendMessage).toHaveBeenCalledWith(42, expect.stringContaining("Новий поклик прийнято"), { parse_mode: "HTML" });
    expect(markNotificationSent).toHaveBeenCalledWith(notification);
    expect(rescheduleNotification).not.toHaveBeenCalled();
  });

  it("reschedules both corrupt payloads and Telegram failures without losing the outbox row", async () => {
    const corrupt = {
      id: "notice-corrupt", claimToken: "claim-a", kind: "REFERRAL_PAYOUT_GRANTED" as const,
      telegramUserId: 42n, payload: { gold: 50 }, attemptCount: 1
    };
    const retry = {
      id: "notice-retry", claimToken: "claim-b", kind: "REFERRAL_JOINED" as const,
      telegramUserId: 43n, payload: { inviteeName: "Іра" }, attemptCount: 2
    };
    const markNotificationSent = vi.fn().mockResolvedValue(true);
    const rescheduleNotification = vi.fn().mockResolvedValue(true);
    const service = {
      reconcileDue: vi.fn().mockResolvedValue({ due: 0, granted: 0 }),
      reconcileReferralAchievements: vi.fn().mockResolvedValue({ due: 0, reconciled: 0 }),
      reconcileArrivalChronicles: vi.fn().mockResolvedValue({ due: 0, recorded: 0 }),
      claimNextNotification: vi.fn()
        .mockResolvedValueOnce(corrupt)
        .mockResolvedValueOnce(retry),
      markNotificationSent,
      rescheduleNotification
    } as unknown as ReferralService;
    const scheduler = createReferralScheduler(service, {
      api: { sendMessage: vi.fn().mockRejectedValue(new Error("Telegram unavailable")) }
    } as unknown as Bot, { limit: 2 });

    await expect(scheduler.tick()).resolves.toMatchObject({
      claimedNotifications: 2,
      sentNotifications: 0,
      retriedNotifications: 2
    });
    expect(rescheduleNotification).toHaveBeenNthCalledWith(1, corrupt);
    expect(rescheduleNotification).toHaveBeenNthCalledWith(2, retry);
    expect(markNotificationSent).not.toHaveBeenCalled();
  });

  it("runs immediately, never overlaps, and waits for the active tick during stop", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const reconcileDue = vi.fn().mockImplementation(() => new Promise<{ due: number; granted: number }>((resolve) => {
      finish = () => resolve({ due: 0, granted: 0 });
    }));
    const service = {
      reconcileDue,
      reconcileReferralAchievements: vi.fn().mockResolvedValue({ due: 0, reconciled: 0 }),
      reconcileArrivalChronicles: vi.fn().mockResolvedValue({ due: 0, recorded: 0 }),
      claimNextNotification: vi.fn().mockResolvedValue(null),
      onWorkAvailable: vi.fn(() => vi.fn())
    } as unknown as ReferralService;
    const scheduler = createReferralScheduler(service, { api: { sendMessage: vi.fn() } } as unknown as Bot, {
      intervalMs: 1_000
    });

    scheduler.start();
    await Promise.resolve();
    expect(reconcileDue).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(3_000);
    expect(reconcileDue).toHaveBeenCalledOnce();

    let stopped = false;
    const stop = scheduler.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish?.();
    await stop;
    expect(stopped).toBe(true);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(reconcileDue).toHaveBeenCalledOnce();
  });

  it("runs a non-overlapping tick immediately when Telegram work becomes available", async () => {
    let wake: (() => void) | undefined;
    const reconcileDue = vi.fn().mockResolvedValue({ due: 1, granted: 1 });
    const service = {
      reconcileDue,
      reconcileReferralAchievements: vi.fn().mockResolvedValue({ due: 0, reconciled: 0 }),
      reconcileArrivalChronicles: vi.fn().mockResolvedValue({ due: 0, recorded: 0 }),
      claimNextNotification: vi.fn().mockResolvedValue(null),
      onWorkAvailable: vi.fn((listener: () => void) => {
        wake = listener;
        return vi.fn();
      })
    } as unknown as ReferralService;
    const scheduler = createReferralScheduler(
      service,
      { api: { sendMessage: vi.fn() } } as unknown as Bot,
      { intervalMs: 93_000 }
    );

    scheduler.start();
    await vi.waitFor(() => expect(reconcileDue).toHaveBeenCalledOnce());
    wake?.();
    await vi.waitFor(() => expect(reconcileDue).toHaveBeenCalledTimes(2));
    await scheduler.stop();
  });
});
