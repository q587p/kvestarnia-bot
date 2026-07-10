import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  createHealthRecoveryNotificationScheduler,
  presentHealthRecoveryNotification
} from "../../src/bot/healthRecoveryNotificationScheduler";

describe("health recovery notification scheduler", () => {
  it("sends due HP-full notifications from the server tick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T10:00:00.000Z"));
    const service = {
      listDueHpFullNotifications: vi.fn(() => Promise.resolve([
        {
          telegramUserId: 42n,
          hpCurrent: 40,
          hpMax: 40
        }
      ]))
    };
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const bot = {
      api: {
        sendMessage
      }
    } as unknown as Bot;

    try {
      const scheduler = createHealthRecoveryNotificationScheduler(service, bot);
      const sent = await scheduler.tick();

      expect(sent).toBe(1);
      expect(service.listDueHpFullNotifications).toHaveBeenCalledWith(
        new Date("2026-07-10T10:00:00.000Z"),
        { limit: 50 }
      );
      expect(sendMessage).toHaveBeenCalledWith(
        "42",
        expect.stringContaining("Здоров'я відновилося повністю"),
        { parse_mode: "HTML" }
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the player-facing copy compact", () => {
    expect(presentHealthRecoveryNotification()).toBe(
      "❤️ Здоров'я відновилося повністю.\n\nОрганізм подав заявку на продовження пригод і сам її погодив."
    );
  });
});
