import type { Bot, Context, Keyboard } from "grammy";
import type { DevResetService } from "../../services/devResetService";
import type { DevGrantService } from "../../services/devGrantService";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentDevHelp, presentHelp } from "../presenters/helpPresenter";

export interface HelpCommandOptions {
  buildMainMenuKeyboard?: (ctx: Context) => Promise<Keyboard>;
}

export function registerHelpCommand(
  bot: Bot,
  devResetService: DevResetService,
  devGrantService?: Pick<DevGrantService, "isEnabled">,
  options: HelpCommandOptions = {}
): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(presentHelp({
      includeDevReset: devResetService.isEnabled(),
      includeDevGrant: devGrantService?.isEnabled() ?? false
    }), {
      reply_markup: options.buildMainMenuKeyboard
        ? await options.buildMainMenuKeyboard(ctx)
        : buildMainMenuKeyboard()
    });
  });

  bot.command("dev_help", async (ctx) => {
    await ctx.reply(presentDevHelp({
      includeDevReset: devResetService.isEnabled(),
      includeDevGrant: devGrantService?.isEnabled() ?? false
    }));
  });
}
