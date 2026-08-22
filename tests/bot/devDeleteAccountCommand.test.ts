import { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { registerDevResetCommand } from "../../src/bot/commands/devResetCommand";
import type { DevResetService } from "../../src/services/devResetService";

describe("dev delete account command", () => {
  it("requires the explicit destructive confirmation before deleting", async () => {
    const replies: string[] = [];
    const resetEntireAccount = vi.fn().mockResolvedValue({ state: "deleted" });
    const bot = testBot(replies, {
      isEnabled: () => true,
      resetEntireAccount
    });

    await bot.handleUpdate(commandUpdate("/dev_delete_account"));

    expect(resetEntireAccount).not.toHaveBeenCalled();
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("Дія незворотна");
    expect(replies[0]).toContain("/dev_delete_account ПІДТВЕРДЖУЮ");
  });

  it("deletes only the invoking Telegram account after exact confirmation", async () => {
    const replies: string[] = [];
    const resetEntireAccount = vi.fn().mockResolvedValue({ state: "deleted" });
    const bot = testBot(replies, {
      isEnabled: () => true,
      resetEntireAccount
    });

    await bot.handleUpdate(commandUpdate("/dev_delete_account ПІДТВЕРДЖУЮ"));

    expect(resetEntireAccount).toHaveBeenCalledOnce();
    expect(resetEntireAccount).toHaveBeenCalledWith(42n);
    expect(replies).toEqual([
      "Акаунт і весь пов’язаний локальний стан видалено. Наступний /start зустріне вас як цілком нового гравця."
    ]);
  });

  it("does not register, show, or mutate through the command in production", async () => {
    const replies: string[] = [];
    const resetEntireAccount = vi.fn().mockResolvedValue({ state: "deleted" });
    const bot = testBot(replies, {
      isEnabled: () => false,
      resetEntireAccount
    });

    await bot.handleUpdate(commandUpdate("/dev_delete_account ПІДТВЕРДЖУЮ"));

    expect(resetEntireAccount).not.toHaveBeenCalled();
    expect(replies).toEqual([]);
  });
});

function testBot(
  replies: string[],
  service: Pick<DevResetService, "isEnabled" | "resetEntireAccount">
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
    return Promise.resolve({ ok: true, result: { message_id: replies.length } });
  });
  registerDevResetCommand(bot, service as DevResetService);
  return bot;
}

function commandUpdate(text: string) {
  const commandLength = text.split(/\s/u, 1)[0]?.length ?? text.length;
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: 42, type: "private" as const },
      from: { id: 42, is_bot: false, first_name: "Тест" },
      text,
      entities: [{ offset: 0, length: commandLength, type: "bot_command" as const }]
    }
  };
}
