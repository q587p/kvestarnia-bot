import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import { registerDevResetCommand } from "../../src/bot/commands/devResetCommand";
import type { AdventureService } from "../../src/services/adventureService";
import type { DevResetService } from "../../src/services/devResetService";
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
});

function createTestBot(
  replies: string[],
  services: {
    devReset: Pick<DevResetService, "isEnabled" | "resetCurrentUser">;
    adventure: Pick<AdventureService, "resetCurrentPeriodForTelegramUser">;
    tavern?: Pick<TavernRaidService, "stopPendingFridayBarrelRaidForDev">;
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
    services.tavern
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
