import { describe, expect, it, vi } from "vitest";
import type { Bot } from "grammy";
import { createReferralScheduler } from "../../src/bot/referralScheduler";
import type { ReferralService } from "../../src/services/referralService";

describe("referral scheduler", () => {
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
      claimNextNotification: vi.fn()
        .mockResolvedValueOnce(notification)
        .mockResolvedValueOnce(null),
      markNotificationSent,
      rescheduleNotification
    } as unknown as ReferralService;
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const scheduler = createReferralScheduler(service, { api: { sendMessage } } as unknown as Bot);

    await expect(scheduler.tick()).resolves.toEqual({
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
});
