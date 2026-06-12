import { describe, expect, it } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makeAdventureCallbackData } from "../../src/bot/callbacks/adventureCallbackData";
import { makeFightCallbackData } from "../../src/bot/callbacks/fightCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("scene callback HTML options", () => {
  it.each([
    {
      name: "tavern raid",
      callbackData: makeTavernCallbackData("raid"),
      services: servicesWith({
        tavern: {
          completeFridayBarrelRaid: () => Promise.resolve({
            state: "already-completed",
            character,
            reward: {
              xp: 7,
              gold: 5,
              localDate: "12026-06-12",
              itemGrants: []
            },
            levelChange: null
          })
        }
      })
    },
    {
      name: "adventure",
      callbackData: makeAdventureCallbackData("poke"),
      services: servicesWith({
        adventure: {
          completeMimicShawarma: () => Promise.resolve({
            state: "completed",
            action: "poke",
            character,
            reward: {
              xp: 8,
              gold: 4,
              localDate: "12026-06-12",
              itemGrants: [{ name: "Підозрілий лавашний доказ", quantity: 1 }]
            },
            levelChange: noLevelChange
          })
        }
      })
    },
    {
      name: "fight",
      callbackData: makeFightCallbackData("attack"),
      services: servicesWith({
        fight: {
          completeMimicShawarma: () => Promise.resolve({
            state: "completed",
            action: "attack",
            character,
            combat: {
              action: "attack",
              playerDamage: 5,
              enemyDamage: 2,
              playerHpPreview: 18,
              playerHpMaxPreview: 20,
              enemyHpPreview: 9,
              enemyHpMaxPreview: 14
            },
            reward: {
              xp: 9,
              gold: 3,
              localDate: "12026-06-12",
              itemGrants: [{ name: "Підозрілий лавашний доказ", quantity: 1 }]
            },
            levelChange: noLevelChange
          })
        }
      })
    }
  ])("edits $name callback results with Telegram HTML parse mode", async ({ callbackData, services }) => {
    const calls = await captureApiCalls(callbackData, services);
    const edit = calls.find((call) => call.method === "editMessageText");

    expect(edit?.payload).toMatchObject({
      parse_mode: "HTML"
    });
    expect(String(edit?.payload.text)).toMatch(/<b>|<i>/);
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічні Герої",
  level: 1,
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

const noLevelChange = {
  leveledUp: false,
  oldLevel: 1,
  newLevel: 1
};

function servicesWith(overrides: Partial<BotServices>): BotServices {
  return {
    adventure: {
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    fight: {
      getMimicShawarmaForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeMimicShawarma: () => Promise.resolve({ state: "no-character" })
    },
    onboarding: {},
    hero: {},
    inventory: {},
    presence: {
      markAction: () => Promise.resolve(),
      getRaidParticipantsForTelegramUser: () =>
        Promise.resolve({ state: "no-character" }),
      getAdventureParticipantsForTelegramUser: () =>
        Promise.resolve({ state: "no-character" }),
      getOnlineForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      getLookForTelegramUser: () => Promise.resolve({ state: "no-character" })
    },
    devReset: {
      isEnabled: () => false
    },
    restart: {},
    tavern: {
      getTavernForTelegramUser: () => Promise.resolve({ state: "no-character" }),
      completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" })
    },
    ...overrides
  } as unknown as BotServices;
}

async function captureApiCalls(callbackData: string, services: BotServices): Promise<ApiCall[]> {
  const bot = createBot("123456:test-token", services);
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
