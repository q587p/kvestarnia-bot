import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { sendBestiaryMonster } from "../../src/bot/commands/bestiaryCommand";

describe("bestiary command", () => {
  it.each(["/bestiary", "/monsters"])("renders %s as read-only monster notes", async (command) => {
    const calls = await captureCommandCalls(command);
    const message = calls.find((call) => call.method === "sendMessage");

    expect(String(message?.payload.text)).toContain("📖 Бестіарій Квестарні");
    expect(String(message?.payload.text)).toContain("Польові нотатки");
    expect(message?.payload.parse_mode).toBe("HTML");
    expect(JSON.stringify(message?.payload.reply_markup)).toContain(makeQuestCallbackData("hunt"));
  });

  it("renders monster detail with back and hunt-board buttons", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendBestiaryMonster(makeContext(replies), "reply", "monster.deadline-spider", 1);

    expect(replies[0]?.text).toContain("Павук дедлайнів");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬅️ До списку", callback_data: "v1:bst:list:1" }],
          [{ text: "🏹 До дошки", callback_data: "v1:quest:hunt" }]
        ]
      }
    });
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

async function captureCommandCalls(command: string): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", servicesWith());
  const calls: ApiCall[] = [];

  bot.api.config.use((_prev, method, payload) => {
    calls.push({
      method,
      payload
    });

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

    return Promise.resolve({
      ok: true,
      result: true
    });
  });

  await bot.init();
  await bot.handleUpdate(messageUpdate(command));

  return calls;
}

function makeContext(replies: Array<{ text: string; options: unknown }>): Context {
  return {
    reply: (text: string, options: unknown) => {
      replies.push({ text, options });
      return Promise.resolve({});
    }
  } as unknown as Context;
}

function servicesWith(): BotServices {
  return {
    adventure: {
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    cellarErrand: {
      getForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      complete: () => Promise.resolve({ state: "no-character" })
    },
    fight: {
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    hunt: {
      getHuntBoardForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeHuntContract: () => Promise.resolve({ state: "no-character" })
    },
    onboarding: {},
    hero: {},
    equipment: {},
    inventory: {},
    presence: {
      markAction: () => Promise.resolve(),
      getRaidParticipantsForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      getAdventureParticipantsForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    devReset: {
      isEnabled: () => false
    },
    restart: {},
    tavern: {
      getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      getActivePendingFridayBarrelRaidForTelegramUser: () => Promise.resolve({ state: "none" })
    }
  } as unknown as BotServices;
}

function messageUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: {
        id: 42,
        type: "private" as const,
        first_name: "Тест"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      text,
      entities: [
        {
          type: "bot_command" as const,
          offset: 0,
          length: text.length
        }
      ]
    }
  };
}
