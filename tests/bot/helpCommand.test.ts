import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import { registerHelpCommand } from "../../src/bot/commands/helpCommand";
import type { DevGrantService } from "../../src/services/devGrantService";
import type { DevResetService } from "../../src/services/devResetService";
import type { PartySessionService } from "../../src/services/partySessionService";
import type { TavernGameService } from "../../src/services/tavernGameService";

describe("help command", () => {
  it("shows public commands through /help", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: { isEnabled: () => true },
      devGrant: { isEnabled: () => true },
      partySessions: { areDevHelpersEnabled: () => true },
      tavernGames: { isEnabled: () => true }
    });

    await bot.handleUpdate(commandUpdate("/help"));

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("📖 Допомога Квестарні");
    expect(replies[0]).toContain("/start");
    expect(replies[0]).toContain("/help");
    expect(replies[0]).toContain("/support");
    expect(replies[0]).toContain("Останні події");
    expect(replies[0]).toContain("Перекази");
    expect(replies[0]).toContain("Пошта Квестарні");
    expect(replies[0]).toContain("🎲 Ігри за столом");
    expect(replies[0]).toContain("/games");
    expect(replies[0]).not.toContain("/dev_help");
    expect(replies[0]).not.toContain("/dev_party");
    expect(replies[0]).not.toContain("/dev_add_xp");
  });

  it("shows local dev commands through /dev_help", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: { isEnabled: () => true },
      devGrant: { isEnabled: () => true },
      partySessions: { areDevHelpersEnabled: () => true }
    });

    await bot.handleUpdate(commandUpdate("/dev_help"));

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("🧰 Dev-довідка Квестарні");
    expect(replies[0]).toContain("/dev_party");
    expect(replies[0]).toContain("/dev_raid_stop");
    expect(replies[0]).toContain("/dev_reset_korchma_round");
    expect(replies[0]).toContain("/dev_add_xp");
    expect(replies[0]).toContain("/dev_add_bandage");
    expect(replies[0]).toContain("/dev_add_dense_bandage");
    expect(replies[0]).toContain("/dev_add_field_kit");
    expect(replies[0]).toContain("/dev_reset_yeger_bandage");
  });

  it("hides party dev help when party runtime is enabled without dev helpers", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: { isEnabled: () => false },
      partySessions: { areDevHelpersEnabled: () => false }
    });

    await bot.handleUpdate(commandUpdate("/dev_help"));

    expect(replies).toHaveLength(1);
    expect(replies[0]).not.toContain("/dev_party");
    expect(replies[0]).toBe("Dev-команди тут не ввімкнені. Корчмар сховав викрутку.");
  });
});

function createTestBot(
  replies: string[],
  services: {
    devReset: Pick<DevResetService, "isEnabled">;
    devGrant?: Pick<DevGrantService, "isEnabled">;
    partySessions?: Pick<PartySessionService, "areDevHelpersEnabled">;
    tavernGames?: Pick<TavernGameService, "isEnabled">;
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
  registerHelpCommand(
    bot,
    services.devReset as DevResetService,
    services.devGrant,
    {
      partySessionService: services.partySessions,
      tavernGameService: services.tavernGames
    }
  );
  return bot;
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
