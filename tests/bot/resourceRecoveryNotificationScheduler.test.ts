import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { createResourceRecoveryNotificationScheduler } from "../../src/bot/resourceRecoveryNotificationScheduler";
import type { ResourceRecoveryNotificationService } from "../../src/services/resourceRecoveryNotificationService";

describe("resource recovery notification scheduler", () => {
  it("sends a full-health notice when the service resolves one", async () => {
    const service = {
      resolveDueHpFullNotifications: vi.fn(() =>
        Promise.resolve([
          {
            telegramUserId: 42n,
            notice: {
              type: "hp-full" as const,
              hpCurrent: 70,
              hpMax: 70
            }
          }
        ])
      )
    };
    const sendMessage = vi.fn(() => Promise.resolve({ message_id: 587 }));
    const bot = {
      api: {
        sendMessage
      }
    } as unknown as Bot;
    const scheduler = createResourceRecoveryNotificationScheduler(
      service as unknown as ResourceRecoveryNotificationService,
      bot,
      { intervalMs: 60_000 }
    );

    scheduler.start();

    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalled());
    scheduler.stop();

    expect(service.resolveDueHpFullNotifications).toHaveBeenCalledWith({});
    expect(sendMessage).toHaveBeenCalledWith(
      "42",
      expect.stringContaining("70/70"),
      { parse_mode: "HTML" }
    );
  });
});
