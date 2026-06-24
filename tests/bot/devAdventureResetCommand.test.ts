import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import { registerDevResetCommand } from "../../src/bot/commands/devResetCommand";
import type { AdventureService } from "../../src/services/adventureService";
import type { DevResetService } from "../../src/services/devResetService";
import type { FightService } from "../../src/services/fightService";
import type { TavernRaidService } from "../../src/services/tavernRaidService";

describe("dev adventure reset command", () => {
  it("resets current adventure period in local environments", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: enabledDevReset(),
      adventure: {
        resetCurrentPeriodForTelegramUser: () => Promise.resolve({ state: "reset", periodToken: "period93" })
      } as unknown as AdventureService
    });

    await bot.handleUpdate(commandUpdate("/dev_adventure_reset"));

    expect(replies).toEqual([
      "Поточний вибір пригоди скинуто. Стіл зі справами вже перетасував папірці."
    ]);
  });

  it("stays disabled in production", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: disabledDevReset(),
      adventure: {
        resetCurrentPeriodForTelegramUser: () => Promise.resolve({ state: "reset", periodToken: "period93" })
      } as unknown as AdventureService
    });

    await bot.handleUpdate(commandUpdate("/dev_adventure_reset"));

    expect(replies).toEqual(["Ця команда доступна лише в локальній майстерні."]);
  });

  it("stops a pending barrel raid in local environments", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: enabledDevReset(),
      adventure: {
        resetCurrentPeriodForTelegramUser: () => Promise.resolve({ state: "reset", periodToken: "period93" })
      } as unknown as AdventureService,
      tavern: {
        stopPendingFridayBarrelRaidForDev: () =>
          Promise.resolve({
            state: "completed",
            result: {
              state: "completed",
              character: {
                classId: "class.warrior",
                raceId: "race.human-ish",
                path: "boundary"
              },
              reward: {
                xp: 18,
                gold: 8,
                localDate: "2026-06-12T13:23",
                itemGrants: []
              },
              levelChange: {
                oldLevel: 1,
                newLevel: 2,
                leveledUp: true
              }
            }
          })
      } as unknown as TavernRaidService
    });

    await bot.handleUpdate(commandUpdate("/dev_raid_stop"));

    expect(replies).toHaveLength(2);
    expect(replies[0]).toBe("Рейд на Бочку завершено достроково.\nЗараховано: +18 XP, +8 золота.");
    expect(replies[1]).toContain("🎉 Рівень підріс!");
    expect(replies[1]).toContain("✨ <b>1 → 2</b>");
  });

  it("keeps dev raid stop disabled in production", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: disabledDevReset(),
      adventure: {
        resetCurrentPeriodForTelegramUser: () => Promise.resolve({ state: "reset", periodToken: "period93" })
      } as unknown as AdventureService,
      tavern: {
        stopPendingFridayBarrelRaidForDev: () => Promise.resolve({ state: "no-pending", character: {} })
      } as unknown as TavernRaidService
    });

    await bot.handleUpdate(commandUpdate("/dev_raid_stop"));

    expect(replies).toEqual(["Ця команда доступна лише в локальній майстерні."]);
  });
  it("resets the monster rest cooldown in local environments", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: enabledDevReset(),
      adventure: {
        resetCurrentPeriodForTelegramUser: () => Promise.resolve({ state: "reset", periodToken: "period93" })
      } as unknown as AdventureService,
      fight: {
        resetMonsterRestCooldownForDev: () =>
          Promise.resolve({ state: "reset", clearedSessions: 3 })
      } as unknown as FightService
    });

    await bot.handleUpdate(commandUpdate("/dev_reset_monster_rest"));

    expect(replies).toEqual([
      "Перерву монстрів скинуто. Низ знову вдає, що готовий до бою. Зістарено записів: 3."
    ]);
  });

  it("keeps monster rest reset disabled in production", async () => {
    const replies: string[] = [];
    let called = false;
    const bot = createTestBot(replies, {
      devReset: disabledDevReset(),
      adventure: {
        resetCurrentPeriodForTelegramUser: () => Promise.resolve({ state: "reset", periodToken: "period93" })
      } as unknown as AdventureService,
      fight: {
        resetMonsterRestCooldownForDev: () => {
          called = true;
          return Promise.resolve({ state: "reset", clearedSessions: 3 });
        }
      } as unknown as FightService
    });

    await bot.handleUpdate(commandUpdate("/dev_reset_monster_rest"));

    expect(called).toBe(false);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("локаль");
  });

  it("records the active two-enemy fight card for timeout edits", async () => {
    const replies: string[] = [];
    const recorded: Array<[bigint, string, { chatId: string; messageId: number }]> = [];
    const bot = createTestBot(replies, {
      devReset: enabledDevReset(),
      adventure: {
        resetCurrentPeriodForTelegramUser: () => Promise.resolve({ state: "reset", periodToken: "period93" })
      } as unknown as AdventureService,
      fight: {
        getOrStartPersistentFightForTelegramUser: () =>
          Promise.resolve({
            state: "persistent-active",
            started: true,
            character: {
              name: "Тест",
              pronoun: "they",
              pronounLabel: "Вони",
              path: "boundary",
              raceId: "race.human-ish",
              raceName: "Людисько",
              classId: "class.warrior",
              className: "Воїн",
              title: "Тестер",
              level: 3,
              xp: 25,
              nextLevelXp: 50,
              xpToNextLevel: 25,
              gold: 0,
              hpCurrent: 30,
              hpMax: 30,
              manaCurrent: 10,
              manaMax: 10,
              stats: {
                strength: 10,
                dexterity: 6,
                intelligence: 6,
                charisma: 6,
                luck: 6
              },
              levelBonus: {
                hpMax: 6,
                manaMax: 3,
                primaryStat: {
                  stat: "strength",
                  bonus: 2
                }
              }
            },
            session: {
              id: "session-two-enemies",
              characterId: "character-42",
              monsterId: "monster.deadline-spider",
              status: "active",
              turn: 1,
              reward: null,
              createdAt: new Date("2026-06-12T10:30:00.000Z"),
              updatedAt: new Date("2026-06-12T10:30:00.000Z"),
              expiresAt: new Date("2026-06-12T10:40:00.000Z"),
              state: {
                id: "session-two-enemies",
                source: "normal",
                turn: 1,
                status: "active",
                turnExpiresAt: "2026-06-12T10:30:23.000Z",
                hero: { hp: 30, hpMax: 30, mana: 10, manaMax: 10 },
                monster: { id: "monster.deadline-spider", hp: 12, hpMax: 12 },
                enemies: [
                  { enemyId: "enemy:1", id: "monster.deadline-spider", hp: 12, hpMax: 12 },
                  { enemyId: "enemy:2", id: "monster.preapproval-dragonling", hp: 10, hpMax: 10 }
                ]
              }
            },
            monster: {
              id: "monster.deadline-spider",
              name: "Павук дедлайнів",
              description: "Тестовий монстр.",
              level: 2,
              tags: ["beast"]
            },
            questProgress: null
          }),
        recordPersistentFightMessageReference: (
          telegramUserId: bigint,
          sessionId: string,
          reference: { chatId: string; messageId: number }
        ) => {
          recorded.push([telegramUserId, sessionId, reference]);
          return Promise.resolve();
        },
        resetMonsterRestCooldownForDev: () => Promise.resolve({ state: "no-cooldown" })
      } as unknown as FightService
    });

    await bot.handleUpdate(commandUpdate("/dev_two_enemies"));

    expect(replies).toHaveLength(2);
    expect(recorded).toEqual([
      [42n, "session-two-enemies", { chatId: "42", messageId: 2 }]
    ]);
  });
});

function createTestBot(
  replies: string[],
  services: {
    devReset: Pick<DevResetService, "isEnabled" | "resetCurrentUser">;
    adventure: Pick<AdventureService, "resetCurrentPeriodForTelegramUser">;
    tavern?: Pick<TavernRaidService, "stopPendingFridayBarrelRaidForDev">;
    fight?: Pick<
      FightService,
      "getOrStartPersistentFightForTelegramUser" | "recordPersistentFightMessageReference" | "resetMonsterRestCooldownForDev"
    >;
  }
): Bot {
  const bot = new Bot("test-token", {
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: "Квестарня",
      username: "kvestarnia_bot"
    }
  });
  bot.api.config.use((_prev, method, payload) => {
    if (method === "sendMessage") {
      replies.push(String(payload.text));
    }

    return Promise.resolve({
      ok: true,
      result: { message_id: replies.length }
    });
  });
  registerDevResetCommand(
    bot,
    services.devReset as DevResetService,
    services.adventure,
    services.tavern,
    services.fight
  );
  return bot;
}

function enabledDevReset(): Pick<DevResetService, "isEnabled" | "resetCurrentUser"> {
  return {
    isEnabled: () => true,
    resetCurrentUser: () => Promise.resolve({ state: "no-character" })
  };
}

function disabledDevReset(): Pick<DevResetService, "isEnabled" | "resetCurrentUser"> {
  return {
    isEnabled: () => false,
    resetCurrentUser: () => Promise.resolve({ state: "disabled" })
  };
}

function commandUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: {
        id: 42,
        type: "private"
      },
      from: {
        id: 42,
        is_bot: false,
        first_name: "Тест"
      },
      text,
      entities: [
        {
          offset: 0,
          length: text.length,
          type: "bot_command"
        }
      ]
    }
  };
}
