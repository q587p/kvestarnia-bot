import type { Bot } from "grammy";
import type { DevResetService } from "../../services/devResetService";
import { buildDevResetKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentDevResetDisabled, presentDevResetPrompt } from "../presenters/devResetPresenter";

export function registerDevResetCommand(bot: Bot, devResetService: DevResetService): void {
  bot.command("dev_reset_me", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    await ctx.reply(presentDevResetPrompt(), {
      reply_markup: buildDevResetKeyboard()
    });
  });
}
