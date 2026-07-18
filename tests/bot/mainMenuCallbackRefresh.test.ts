import { Bot, type Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  getCallbackPreviousMainMenuLocationId,
  refreshCallbackMainMenuLocationBeforeReplies,
  registerCallbackMainMenuLocationRefresh
} from "../../src/bot/modules/mainMenu";
import {
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  type PresenceService
} from "../../src/services/presenceService";

describe("callback main-menu location refresh", () => {
  it("lets a callback place the movement notice before result cards without a trailing duplicate", async () => {
    let locationId = "location.korchma.hall";
    const presence = {
      getCurrentPlaceForTelegramUser: vi.fn(() => Promise.resolve({
        state: "ready" as const,
        locationId,
        locationName: locationId === PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER
          ? "Бійцівський куток"
          : "Зала корчми",
        insideKorchma: true
      }))
    } as unknown as PresenceService;
    const bot = new Bot("123456:test-token");
    const messages: string[] = [];

    registerCallbackMainMenuLocationRefresh(bot, presence);
    bot.callbackQuery("v1:test:ordered", async (ctx) => {
      const previousLocationId = await getCallbackPreviousMainMenuLocationId(ctx, presence);
      locationId = PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER;
      await refreshCallbackMainMenuLocationBeforeReplies(
        ctx,
        locationId,
        previousLocationId
      );
      await ctx.reply("анонс і порада");
      await ctx.reply("бойова картка");
    });

    bot.api.config.use((_prev, method, payload) => {
      if (method === "getMe") {
        return Promise.resolve({
          ok: true,
          result: {
            id: 123456,
            is_bot: true,
            first_name: "Квестарня",
            username: "kvestarnia_bot"
          }
        });
      }

      if (method === "sendMessage") {
        messages.push(String(payload.text));
        return Promise.resolve({
          ok: true,
          result: {
            message_id: messages.length,
            date: 0,
            chat: {
              id: 42,
              type: "private"
            }
          }
        });
      }

      return Promise.resolve({ ok: true, result: true });
    });

    await bot.init();
    await bot.handleUpdate(makeCallbackUpdate());

    expect(messages).toEqual([
      "Ви рушили до бійцівського кутка.",
      "анонс і порада",
      "бойова картка"
    ]);
  });
});

function makeCallbackUpdate(): Parameters<Bot<Context>["handleUpdate"]>[0] {
  return {
    update_id: 1,
    callback_query: {
      id: "callback-1",
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      chat_instance: "chat-instance",
      data: "v1:test:ordered",
      message: {
        message_id: 10,
        date: 0,
        chat: {
          id: 42,
          type: "private",
          first_name: "Тест"
        },
        text: "старе повідомлення"
      }
    }
  };
}
