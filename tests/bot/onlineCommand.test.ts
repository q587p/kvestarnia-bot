import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { sendOnline } from "../../src/bot/commands/onlineCommand";
import type { PresenceService } from "../../src/services/presenceService";

describe("online command", () => {
  it("shows current online snapshot", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const ctx = {
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      reply: (text: string, options: unknown) => {
        replies.push({ text, options });
        return Promise.resolve({});
      }
    } as unknown as Context;
    const presenceService = {
      getOnlineForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          globalTotal: 1,
          location: {
            id: "location.korchma.hall",
            name: "Зала корчми",
            people: {
              active: [{ telegramUserId: 42n, name: "Тестовий Герой", status: "active" }],
              idle: [],
              total: 1
            }
          },
          activity: null
        })
    } as unknown as PresenceService;

    await sendOnline(ctx, presenceService, { duelEnabled: true });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain("👥 У грі зараз: 1");
    expect(replies[0]?.text).toContain("📍 Зала корчми: тільки ти.");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    expect(JSON.stringify(replies[0]?.options)).toContain("🥊 Кинути виклик присутнім");
    expect(JSON.stringify(replies[0]?.options)).toContain("v1:nd:open");
  });
});
