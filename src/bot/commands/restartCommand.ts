import type { Bot } from "grammy";
import { buildRestartKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentRestartPrompt } from "../presenters/restartPresenter";

export function registerRestartCommand(bot: Bot): void {
  bot.command("restart", async (ctx) => {
    await ctx.reply(presentRestartPrompt(), {
      reply_markup: buildRestartKeyboard()
    });
  });
}
