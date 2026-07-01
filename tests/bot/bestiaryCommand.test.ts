import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import {
  makeBestiaryListCallbackData,
  makeBestiaryMonsterCallbackData,
  makeBestiaryRandomCallbackData,
  makeBestiarySpecialCallbackData
} from "../../src/bot/callbacks/bestiaryCallbackData";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makeLoreMenuCallbackData } from "../../src/bot/callbacks/loreBoardCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import {
  sendBestiaryMonster,
  sendBestiarySpecial,
  sendRandomBestiaryRecord
} from "../../src/bot/commands/bestiaryCommand";
import { bestiarySpecialRecords, monsters } from "../../src/content";
import { BESTIARY_PAGE_SIZE } from "../../src/bot/presenters/bestiaryPresenter";

describe("bestiary command", () => {
  it.each(["/bestiary", "/monsters"])("renders %s as read-only monster notes", async (command) => {
    const calls = await captureCommandCalls(command, { level: 3 });
    const message = calls.find((call) => call.method === "sendMessage");

    expect(String(message?.payload.text)).toContain("📖 Бестіарій Квестарні");
    expect(String(message?.payload.text)).toContain("Польові нотатки");
    expect(message?.payload.parse_mode).toBe("HTML");
    expect(JSON.stringify(message?.payload.reply_markup)).toContain(makeQuestCallbackData("hunt"));
  });

  it("keeps bestiary hidden before level three", async () => {
    const calls = await captureCommandCalls("/bestiary", { level: 2 });
    const message = calls.find((call) => call.method === "sendMessage");

    expect(String(message?.payload.text)).toContain("📖 Бестіарій поки під серветкою.");
    expect(String(message?.payload.text)).toContain("до 3 рівня");
    expect(String(message?.payload.text)).not.toContain("Мімік-шаурма");
    expect(message?.payload.reply_markup).toBeUndefined();
  });

  it("asks players to create a character before reading the bestiary", async () => {
    const calls = await captureCommandCalls("/bestiary", { noCharacter: true });
    const message = calls.find((call) => call.method === "sendMessage");

    expect(String(message?.payload.text)).toContain("Спершу створіть пригодника через /start");
    expect(String(message?.payload.text)).not.toContain("Мімік-шаурма");
  });

  it("renders monster detail with back and hunt-board buttons", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendBestiaryMonster(makeContext(replies), "reply", "monster.deadline-spider", 1);

    expect(replies[0]?.text).toContain("Павук дедлайнів");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    expect(JSON.stringify(replies[0]?.options)).toContain(makeBestiaryListCallbackData(1));
    expect(JSON.stringify(replies[0]?.options)).toContain(makeBestiaryRandomCallbackData());
    expect(JSON.stringify(replies[0]?.options)).toContain(makeQuestCallbackData("hunt"));
    expect(JSON.stringify(replies[0]?.options)).toContain("⏮️ Перший");
    expect(JSON.stringify(replies[0]?.options)).toContain("Останній ⏭️");
  });

  it("renders special Barrel records at the end without monster levels", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];
    const specialPage = Math.floor(monsters.length / BESTIARY_PAGE_SIZE);

    await sendBestiarySpecial(makeContext(replies), "reply", "special.big-barrel-brother", specialPage);

    expect(replies[0]?.text).toContain("Старший Брат Бочки");
    expect(replies[0]?.text).toContain("Рівень: особливий запис");
    expect(replies[0]?.text).toContain("без сталого рівня");
    expect(replies[0]?.text).not.toContain("Можливі трофеї");
    expect(replies[0]?.options).toMatchObject({
      parse_mode: "HTML"
    });
    expect(JSON.stringify(replies[0]?.options)).toContain(makeBestiaryListCallbackData(specialPage));
    expect(JSON.stringify(replies[0]?.options)).toContain(makeBestiaryRandomCallbackData());
    expect(JSON.stringify(replies[0]?.options)).toContain(makeQuestCallbackData("hunt"));
    expect(JSON.stringify(replies[0]?.options)).toContain("⏮️ Перший");
  });

  it("renders lore-source detail with lore return buttons and source-aware navigation", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendBestiaryMonster(makeContext(replies), "reply", "monster.deadline-spider", 1, "lore");

    const markup = JSON.stringify(replies[0]?.options);

    expect(replies[0]?.text).toContain("Павук дедлайнів");
    expect(markup).toContain(makeBestiaryListCallbackData(1, "lore"));
    expect(markup).toContain(makeBestiaryRandomCallbackData("lore"));
    expect(markup).toContain(makeBestiaryMonsterCallbackData("monster.mimic-shawarma", 0, "lore"));
    expect(markup).toContain(makeLoreMenuCallbackData());
    expect(markup).toContain(makePlaceCallbackData("news-corner"));
    expect(markup).toContain("⬅️ До переказів");
    expect(markup).not.toContain(makeQuestCallbackData("hunt"));
  });

  it("renders a deterministic random bestiary record", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendRandomBestiaryRecord(makeContext(replies), "reply", "quest", () => 0.999);

    expect(replies[0]?.text).toContain("Старший Брат Бочки");
    expect(replies[0]?.text).toContain("Рівень: особливий запис");
    expect(JSON.stringify(replies[0]?.options)).toContain(makeBestiaryRandomCallbackData());
  });

  it("routes bestiary pagination and monster detail callbacks through the bot path", async () => {
    const specialPage = Math.floor(monsters.length / BESTIARY_PAGE_SIZE);
    const calls = await captureCallbackCalls([
      makeBestiaryListCallbackData(2),
      makeBestiaryMonsterCallbackData("monster.report-jellyfish", 2),
      makeBestiaryListCallbackData(specialPage),
      makeBestiarySpecialCallbackData("special.friday-barrel", specialPage),
      makeBestiaryRandomCallbackData()
    ], { level: 3 });
    const edits = calls.filter((call) => call.method === "editMessageText");

    expect(String(edits[0]?.payload.text)).toContain("Сторінка 3/");
    expect(String(edits[0]?.payload.text)).toContain("Медузка звітности");
    expect(String(edits[0]?.payload.text)).not.toContain("paperwork");
    expect(String(edits[0]?.payload.text)).not.toContain("jellyfish");
    expect(JSON.stringify(edits[0]?.payload.reply_markup)).toContain("⏮️ Початок");
    expect(JSON.stringify(edits[0]?.payload.reply_markup)).toContain("Кінець ⏭️");
    expect(JSON.stringify(edits[0]?.payload.reply_markup)).toContain(makeBestiaryRandomCallbackData());

    expect(String(edits[1]?.payload.text)).toContain("<b>Медузка звітности</b>");
    expect(String(edits[1]?.payload.text)).toContain("Польова нотатка");
    expect(String(edits[1]?.payload.text)).not.toContain("paperwork");
    expect(edits[1]?.payload.parse_mode).toBe("HTML");
    expect(JSON.stringify(edits[1]?.payload.reply_markup)).toContain(makeBestiaryListCallbackData(2));
    expect(JSON.stringify(edits[1]?.payload.reply_markup)).toContain(makeBestiaryRandomCallbackData());
    expect(JSON.stringify(edits[1]?.payload.reply_markup)).toContain("⏮️ Перший");
    expect(JSON.stringify(edits[1]?.payload.reply_markup)).toContain("Останній ⏭️");

    expect(String(edits[2]?.payload.text)).toContain("Бочка Пінного Міражу");
    expect(String(edits[2]?.payload.text)).toContain("Старший Брат Бочки");
    expect(JSON.stringify(edits[2]?.payload.reply_markup)).toContain(
      makeBestiarySpecialCallbackData(bestiarySpecialRecords[0].id, specialPage)
    );

    expect(String(edits[3]?.payload.text)).toContain("<b>Бочка Пінного Міражу</b>");
    expect(String(edits[3]?.payload.text)).toContain("особливий запис");
    expect(edits[3]?.payload.parse_mode).toBe("HTML");

    expect(String(edits[4]?.payload.text)).toContain("📖 <b>");
    expect(edits[4]?.payload.parse_mode).toBe("HTML");
  });

  it("routes lore-source bestiary callbacks while preserving lore return navigation", async () => {
    const calls = await captureCallbackCalls([
      makeBestiaryListCallbackData(1, "lore"),
      makeBestiaryMonsterCallbackData("monster.report-jellyfish", 2, "lore"),
      makeBestiaryRandomCallbackData("lore")
    ], { level: 3 });
    const edits = calls.filter((call) => call.method === "editMessageText");

    expect(String(edits[0]?.payload.text)).toContain("Сторінка 2/");
    expect(JSON.stringify(edits[0]?.payload.reply_markup)).toContain(makeBestiaryListCallbackData(0, "lore"));
    expect(JSON.stringify(edits[0]?.payload.reply_markup)).toContain(makeBestiaryRandomCallbackData("lore"));
    expect(JSON.stringify(edits[0]?.payload.reply_markup)).toContain(makeLoreMenuCallbackData());
    expect(JSON.stringify(edits[0]?.payload.reply_markup)).not.toContain(makeQuestCallbackData("hunt"));

    expect(String(edits[1]?.payload.text)).toContain("<b>Медузка звітности</b>");
    expect(JSON.stringify(edits[1]?.payload.reply_markup)).toContain(makeBestiaryListCallbackData(2, "lore"));
    expect(JSON.stringify(edits[1]?.payload.reply_markup)).toContain(makeBestiaryRandomCallbackData("lore"));
    expect(JSON.stringify(edits[1]?.payload.reply_markup)).toContain("⬅️ До переказів");
    expect(JSON.stringify(edits[1]?.payload.reply_markup)).toContain("Останній ⏭️");

    expect(String(edits[2]?.payload.text)).toContain("📖 <b>");
    expect(JSON.stringify(edits[2]?.payload.reply_markup)).toContain(makeBestiaryRandomCallbackData("lore"));
    expect(JSON.stringify(edits[2]?.payload.reply_markup)).toContain(makeLoreMenuCallbackData());
  });

  it("answers malformed bestiary source callbacks with the invalid fallback", async () => {
    const calls = await captureCallbackCalls(["v1:bst:list:0:x"], { level: 3 });
    const answerCall = calls.find((call) => call.method === "answerCallbackQuery");

    expect(answerCall?.payload.show_alert).toBe(true);
    expect(String(answerCall?.payload.text)).toContain("втратила магію");
    expect(calls.find((call) => call.method === "editMessageText")).toBeUndefined();
  });

  it("gates old bestiary callbacks before level three", async () => {
    const calls = await captureCallbackCalls([
      makeBestiaryListCallbackData(0),
      makeBestiaryMonsterCallbackData("monster.mimic-shawarma", 0),
      makeBestiaryRandomCallbackData()
    ], { level: 1 });
    const edits = calls.filter((call) => call.method === "editMessageText");

    expect(String(edits[0]?.payload.text)).toContain("📖 Бестіарій поки під серветкою.");
    expect(String(edits[1]?.payload.text)).toContain("📖 Бестіарій поки під серветкою.");
    expect(String(edits[0]?.payload.text)).not.toContain("Мімік-шаурма");
    expect(String(edits[1]?.payload.text)).not.toContain("Мімік-шаурма");
    expect(String(edits[2]?.payload.text)).toContain("📖 Бестіарій поки під серветкою.");
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

async function captureCommandCalls(
  command: string,
  options: BestiaryTestOptions = {}
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", servicesWith(options));
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

async function captureCallbackCalls(
  callbacks: string[],
  options: BestiaryTestOptions = {}
): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", servicesWith(options));
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

  for (const [index, callbackData] of callbacks.entries()) {
    await bot.handleUpdate(callbackUpdate(callbackData, index + 1));
  }

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

interface BestiaryTestOptions {
  level?: number;
  noCharacter?: boolean;
}

function servicesWith(options: BestiaryTestOptions = {}): BotServices {
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
    hero: {
      findByTelegramUserId: () =>
        Promise.resolve(
          options.noCharacter
            ? { state: "no-character" }
            : {
                state: "existing-character",
                character: characterAtLevel(options.level ?? 3),
                inventoryGoldValue: 0
              }
        )
    },
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

function characterAtLevel(level: number) {
  return {
    name: "Мандрівник",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пересічні Пригодники",
    level,
    xp: 0,
    nextLevelXp: 10,
    xpToNextLevel: 10,
    gold: 0,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    stats: {
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      primaryStat: {
        stat: "strength",
        bonus: 0
      }
    }
  };
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

function callbackUpdate(data: string, updateId: number) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      chat_instance: "test-chat-instance",
      data,
      message: {
        message_id: 10 + updateId,
        date: 0,
        chat: {
          id: 42,
          type: "private" as const,
          first_name: "Тест"
        },
        text: "старий бестіарій"
      }
    }
  };
}
