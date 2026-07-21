import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import { registerHelpCommand } from "../../src/bot/commands/helpCommand";
import type { DevGrantService } from "../../src/services/devGrantService";
import type { DevResetService } from "../../src/services/devResetService";
import type { PartySessionService } from "../../src/services/partySessionService";
import type { PartyRaidChatService } from "../../src/services/partyRaidChatService";
import type { TavernGameService } from "../../src/services/tavernGameService";
import type { HealthRecoveryNotificationService } from "../../src/services/healthRecoveryNotificationService";

describe("help command", () => {
  it("shows the compact section menu through /help", async () => {
    const replies: string[] = [];
    const replyMarkups: unknown[] = [];
    const bot = createTestBot(replies, {
      devReset: { isEnabled: () => true },
      devGrant: { isEnabled: () => true },
      partySessions: { areDevHelpersEnabled: () => true },
      partyRaidChat: { areDevHelpersEnabled: () => true },
      tavernGames: { isEnabled: () => true }
    }, replyMarkups);

    await bot.handleUpdate(commandUpdate("/help"));

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("📖 Допомога Квестарні");
    expect(replies[0]).toContain("👤 Персонаж");
    expect(replies[0]).toContain("⚔️ Пригоди й бої");
    expect(replies[0]).toContain("🎒 Манатки");
    expect(replies[0]).toContain("🍺 Корчма й люди");
    expect(replies[0]).toContain("📰 Довідки й вісті");
    expect(replies[0]).not.toContain("/start");
    expect(replies[0]).not.toContain("/games");
    expect(replies[0]).not.toContain("/dev_help");
    expect(replies[0]).not.toContain("/dev_party");
    expect(replies[0]).not.toContain("/dev_add_xp");
    expect(JSON.stringify(replyMarkups[0])).toContain("v1:help:adventures");
  });

  it("shows local dev commands through /dev_help", async () => {
    const replies: string[] = [];
    const replyMarkups: unknown[] = [];
    const bot = createTestBot(replies, {
      devReset: { isEnabled: () => true },
      devGrant: { isEnabled: () => true },
      partySessions: { areDevHelpersEnabled: () => true },
      partyRaidChat: { areDevHelpersEnabled: () => true },
      healthRecoveryNotifications: { areDevHelpersEnabled: () => true }
    }, replyMarkups);

    await bot.handleUpdate(commandUpdate("/dev_help"));

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("🧰 Dev-довідка Квестарні");
    expect(replies[0]).toContain("🧰 Загальне — персонаж і довідка.");
    expect(replies[0]).toContain("⚔️ Бої й ватага — сутички, рейди й гурт.");
    expect(replies[0]).toContain("🎒 Ресурси й манатки — рівні, HP, мана й речі.");
    expect(replies[0]).toContain("🗺️ Справи й очікування — квести, кулдауни й повтори.");
    expect(replies[0]).not.toContain("/dev_party");
    expect(replies[0]).not.toContain("/dev_add_xp");
    expect(JSON.stringify(replyMarkups[0])).toContain("v1:dh:combat");
    expect(JSON.stringify(replyMarkups[0])).toContain("v1:dh:resources");
  });

  it("does not register dev help when all non-production gates are closed", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: { isEnabled: () => false },
      partySessions: { areDevHelpersEnabled: () => false }
    });

    await bot.handleUpdate(commandUpdate("/dev_help"));

    expect(replies).toEqual([]);
  });
});

function createTestBot(
  replies: string[],
  services: {
    devReset: Pick<DevResetService, "isEnabled">;
    devGrant?: Pick<DevGrantService, "isEnabled">;
    partySessions?: Pick<PartySessionService, "areDevHelpersEnabled">;
    partyRaidChat?: Pick<PartyRaidChatService, "areDevHelpersEnabled">;
    tavernGames?: Pick<TavernGameService, "isEnabled">;
    healthRecoveryNotifications?: Pick<HealthRecoveryNotificationService, "areDevHelpersEnabled">;
  },
  replyMarkups: unknown[] = []
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
      replyMarkups.push(payload.reply_markup);
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
      partyRaidChatService: services.partyRaidChat,
      tavernGameService: services.tavernGames,
      healthRecoveryNotificationService: services.healthRecoveryNotifications
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
