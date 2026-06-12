import type { Bot } from "grammy";
import type { DevResetService } from "../../services/devResetService";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentHelp } from "../presenters/helpPresenter";

export function registerHelpCommand(bot: Bot, devResetService: DevResetService): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(presentHelp(devResetService.isEnabled()), {
      reply_markup: buildMainMenuKeyboard()
    });
  });
}
