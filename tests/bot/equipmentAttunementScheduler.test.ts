import { describe, expect, it, vi } from "vitest";
import type { Bot } from "grammy";
import { createEquipmentAttunementScheduler } from "../../src/bot/equipmentAttunementScheduler";

describe("equipment attunement scheduler", () => {
  it("sends due attunement notifications and marks them notified", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T08:13:00.000Z"));
    const equipment = {
      listDueAttunementNotifications: vi.fn(() => Promise.resolve([
        {
          actionId: "action-1",
          characterId: "character-1",
          telegramUserId: 42n,
          itemId: "item.pan-of-persuasion.plus-1",
          itemName: "Пательня переконання +1",
          strength: "weak" as const,
          readyAt: new Date("2026-07-08T08:13:00.000Z")
        }
      ])),
      markAttunementNotified: vi.fn(() => Promise.resolve(true))
    };
    const sendMessage = vi.fn(() => Promise.resolve(true));
    const bot = {
      api: {
        sendMessage
      }
    } as unknown as Bot;

    try {
      const scheduler = createEquipmentAttunementScheduler(equipment, bot);
      const sent = await scheduler.tick();

      expect(sent).toBe(1);
      expect(sendMessage).toHaveBeenCalledWith(
        "42",
        expect.stringContaining("Налаштування завершено"),
        { parse_mode: "HTML" }
      );
      expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Пательня переконання +1");
      expect(String(sendMessage.mock.calls[0]?.[1])).toContain("Ефект: +3 до удару.");
      expect(equipment.markAttunementNotified).toHaveBeenCalledWith(
        "action-1",
        new Date("2026-07-08T08:13:00.000Z")
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
