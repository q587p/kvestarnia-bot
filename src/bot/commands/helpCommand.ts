import type { Bot } from "grammy";
import type { DevResetService } from "../../services/devResetService";
import type { DevGrantService } from "../../services/devGrantService";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentDevHelp, presentHelp } from "../presenters/helpPresenter";

export function registerHelpCommand(
  bot: Bot,
  devResetService: DevResetService,
  devGrantService?: Pick<DevGrantService, "isEnabled">
): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(presentHelp({
      includeDevReset: devResetService.isEnabled(),
      includeDevGrant: devGrantService?.isEnabled() ?? false
    }), {
      reply_markup: buildMainMenuKeyboard()
    });
  });

  bot.command("dev_help", async (ctx) => {
    await ctx.reply(presentDevHelp({
      includeDevReset: devResetService.isEnabled(),
      includeDevGrant: devGrantService?.isEnabled() ?? false
    }));
  });
}
