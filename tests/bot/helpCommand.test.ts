import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import { registerHelpCommand } from "../../src/bot/commands/helpCommand";
import type { DevGrantService } from "../../src/services/devGrantService";
import type { DevResetService } from "../../src/services/devResetService";

describe("help command", () => {
  it("shows local dev commands through /dev_help", async () => {
    const replies: string[] = [];
    const bot = createTestBot(replies, {
      devReset: { isEnabled: () => true },
      devGrant: { isEnabled: () => true }
    });

    await bot.handleUpdate(commandUpdate("/dev_help"));

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("🧰 Dev-довідка Квестарні");
    expect(replies[0]).toContain("/dev_raid_stop");
    expect(replies[0]).toContain("/dev_add_xp");
  });
});

function createTestBot(
  replies: string[],
  services: {
    devReset: Pick<DevResetService, "isEnabled">;
    devGrant?: Pick<DevGrantService, "isEnabled">;
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
    services.devGrant
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
