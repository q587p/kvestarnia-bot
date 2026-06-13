import { afterEach, describe, expect, it, vi } from "vitest";
import { createBot, type BotServices } from "../../src/bot/createBot";
import { makeAdventureCallbackData } from "../../src/bot/callbacks/adventureCallbackData";
import { makeCellarCallbackData } from "../../src/bot/callbacks/cellarCallbackData";
import { makeFightCallbackData } from "../../src/bot/callbacks/fightCallbackData";
import { makeTavernCallbackData } from "../../src/bot/callbacks/tavernCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("scene callback HTML options", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    {
      name: "tavern raid",
      callbackData: makeTavernCallbackData("raid"),
      services: servicesWith({
        tavern: {
          advanceFridayBarrelRaid: () => Promise.resolve({
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
      name: "cellar errand",
      callbackData: makeCellarCallbackData("cheese-trap"),
      services: servicesWith({
        cellarErrand: {
          complete: () =>
            Promise.resolve({
              state: "completed",
              action: "cheese-trap",
              character,
              reward: {
                xp: 2,
                gold: 1,
                itemGrants: []
              },
              availableAt: new Date("2026-06-13T10:03:00.000Z"),
              now: new Date("2026-06-13T10:00:00.000Z"),
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

  it("sends level-up celebration as a separate HTML message after the result edit", async () => {
    const calls = await captureApiCalls(
      makeAdventureCallbackData("poke"),
      servicesWith({
        adventure: {
          completeMimicShawarma: () =>
            Promise.resolve({
              state: "completed",
              action: "poke",
              character: {
                ...character,
                classId: "class.rogue"
              },
              reward: {
                xp: 8,
                gold: 4,
                localDate: "12026-06-12",
                itemGrants: [{ name: "Підозрілий лавашний доказ", quantity: 1 }]
              },
              levelChange
            })
        }
      })
    );
    const edit = calls.find((call) => call.method === "editMessageText");
    const celebration = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("🎉 Рівень підріс!")
    );

    expect(String(edit?.payload.text)).not.toContain("Рівень підріс");
    expect(celebration?.payload.parse_mode).toBe("HTML");
    expect(String(celebration?.payload.text)).toContain("✨ <b>2 → 3</b>");
    expect(String(celebration?.payload.text)).toContain(
      "📈 Стало краще: <b>+4 HP · +2 мани · +1 Спритності</b>"
    );
  });

  it("sends an HTML barrel raid completion notification after the pending timer ends", async () => {
    vi.useFakeTimers();

    const calls = await captureApiCalls(
      makeTavernCallbackData("raid"),
      servicesWith({
        tavern: {
          advanceFridayBarrelRaid: () =>
            Promise.resolve({
              state: "pending-started",
              character,
              availableAt: new Date("2026-06-13T10:31:00.000Z"),
              now: new Date("2026-06-13T10:30:00.000Z"),
              periodId: "2026-06-13T10:23"
            }),
          completeFridayBarrelRaid: () =>
            Promise.resolve({
              state: "completed",
              character,
              reward: {
                xp: 7,
                gold: 5,
                localDate: "2026-06-13T10:23",
                itemGrants: [
                  {
                    itemId: "item.wet-hero-ticket",
                    name: "Квиток мокрого пригодника",
                    quantity: 1
                  }
                ]
              },
              levelChange: noLevelChange
            })
        }
      })
    );

    expect(calls.find((call) => call.method === "sendMessage")).toBeUndefined();

    await vi.advanceTimersByTimeAsync(60_000);

    const notification = calls.find(
      (call) => call.method === "sendMessage" && String(call.payload.text).includes("Рейд завершено")
    );

    expect(getParseMode(notification?.payload)).toBe("HTML");
    expect(String(notification?.payload.text)).toContain("<b>+7 XP\n+5 золота</b>");
  });

  it("does not send a barrel raid timer notification after manual completion claims the reward", async () => {
    vi.useFakeTimers();

    let rewardClaimed = false;
    const tavern: Partial<BotServices["tavern"]> = {
      advanceFridayBarrelRaid: () =>
        Promise.resolve({
          state: "pending-started",
          character,
          availableAt: new Date("2026-06-13T10:31:00.000Z"),
          now: new Date("2026-06-13T10:30:00.000Z"),
          periodId: "2026-06-13T10:23"
        }),
      completeFridayBarrelRaid: () => {
        if (rewardClaimed) {
          return Promise.resolve({
            state: "already-completed",
            character,
            reward: {
              xp: 7,
              gold: 5,
              localDate: "2026-06-13T10:23",
              itemGrants: []
            },
            levelChange: noLevelChange
          });
        }

        rewardClaimed = true;
        return Promise.resolve({
          state: "completed",
          character,
          reward: {
            xp: 7,
            gold: 5,
            localDate: "2026-06-13T10:23",
            itemGrants: []
          },
          levelChange: noLevelChange
        });
      }
    };

    const calls = await captureApiCalls(
      makeTavernCallbackData("raid"),
      servicesWith({
        tavern
      })
    );

    await tavern.completeFridayBarrelRaid?.(42n, "2026-06-13T10:23");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(rewardClaimed).toBe(true);
    expect(
      calls.find((call) => call.method === "sendMessage" && String(call.payload.text).includes("Рейд завершено"))
    ).toBeUndefined();
  });
});

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function getParseMode(payload: Record<string, unknown> | undefined): unknown {
  const maybeNested = payload?.other as { parse_mode?: unknown } | undefined;

  return payload?.parse_mode ?? maybeNested?.parse_mode;
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
  title: "Пересічні Пригодники",
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

const levelChange = {
  leveledUp: true,
  oldLevel: 2,
  newLevel: 3
};

function servicesWith(overrides: Partial<BotServices>): BotServices {
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
      completeFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      advanceFridayBarrelRaid: () => Promise.resolve({ state: "no-character" }),
      getActivePendingFridayBarrelRaidForTelegramUser: () =>
        Promise.resolve({ state: "none" })
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
