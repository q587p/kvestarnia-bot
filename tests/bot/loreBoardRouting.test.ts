import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import { registerCoreBotModule } from "../../src/bot/modules/core";
import type { BotServices } from "../../src/bot/botServices";
import {
  makeLoreCategoryCallbackData,
  makeLoreCategoryRandomCallbackData,
  makeLoreEntryCallbackData,
  makeLoreGroupCallbackData
} from "../../src/bot/callbacks/loreBoardCallbackData";

describe("lore board callback routing", () => {
  it("answers and edits lore callbacks through the core module", async () => {
    const calls = await captureCoreCallbackCalls(makeLoreCategoryCallbackData("places"));
    const editCall = calls.find((call) => call.method === "editMessageText");

    expect(calls.find((call) => call.method === "answerCallbackQuery")).toBeDefined();
    expect(editCall?.payload.parse_mode).toBe("HTML");
    expect(String(editCall?.payload.text)).toContain("🪧 Місцини корчми");
  });

  it("renders stale lore entry callbacks as a safe fallback", async () => {
    const calls = await captureCoreCallbackCalls(makeLoreEntryCallbackData("stale-entry"));
    const editCall = calls.find((call) => call.method === "editMessageText");

    expect(calls.find((call) => call.method === "answerCallbackQuery")).toBeDefined();
    expect(editCall?.payload.parse_mode).toBe("HTML");
    expect(String(editCall?.payload.text)).toContain("дірка від цвяха");
  });

  it("renders stale category-random callbacks as a safe fallback", async () => {
    const calls = await captureCoreCallbackCalls(makeLoreCategoryRandomCallbackData("stale-category"));
    const editCall = calls.find((call) => call.method === "editMessageText");

    expect(calls.find((call) => call.method === "answerCallbackQuery")).toBeDefined();
    expect(editCall?.payload.parse_mode).toBe("HTML");
    expect(String(editCall?.payload.text)).toContain("Цю теку переклали");
  });

  it("answers and edits lore group callbacks through the core module", async () => {
    const calls = await captureCoreCallbackCalls(makeLoreGroupCallbackData("nyz"));
    const editCall = calls.find((call) => call.method === "editMessageText");

    expect(calls.find((call) => call.method === "answerCallbackQuery")).toBeDefined();
    expect(editCall?.payload.parse_mode).toBe("HTML");
    expect(String(editCall?.payload.text)).toContain("⬇️ Низ");
    expect(JSON.stringify(editCall?.payload.reply_markup)).toContain(makeLoreEntryCallbackData("place-deep"));
  });

  it("answers malformed lore callbacks with the invalid fallback without editing a lore page", async () => {
    const calls = await captureCoreCallbackCalls("v1:lore:e:bad:id");
    const answerCall = calls.find((call) => call.method === "answerCallbackQuery");

    expect(answerCall?.payload.show_alert).toBe(true);
    expect(String(answerCall?.payload.text)).toContain("втратила магію");
    expect(calls.find((call) => call.method === "editMessageText")).toBeUndefined();
  });
});

async function captureCoreCallbackCalls(callbackData: string): Promise<Array<{
  method: string;
  payload: Record<string, unknown>;
}>> {
  const bot = new Bot("123456:test-token");
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: toRecord(payload) });

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

    return Promise.resolve({ ok: true, result: true });
  });

  registerCoreBotModule(bot, {
    services: coreServices(),
    options: {}
  });
  await bot.init();
  await bot.handleUpdate({
    update_id: 1,
    callback_query: {
      id: "callback-1",
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      chat_instance: "chat-instance",
      data: callbackData,
      message: {
        message_id: 10,
        date: 0,
        chat: {
          id: 42,
          type: "private",
          first_name: "Тест"
        },
        text: "old"
      }
    }
  });

  return calls;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return {};
}

function coreServices(): BotServices {
  return {
    presence: {
      markAction: () => Promise.resolve(),
      getCurrentPlaceForTelegramUser: () =>
        Promise.resolve({
          state: "ready",
          locationId: "location.korchma.news_corner",
          locationName: "Дошка корчми",
          insideKorchma: true
        }),
      getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    devReset: {
      isEnabled: () => false
    },
    tavern: {
      getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    hero: {},
    inventory: {}
  } as unknown as BotServices;
}
