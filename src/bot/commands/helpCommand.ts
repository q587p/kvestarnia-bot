import type { Bot, Context, Keyboard } from "grammy";
import type { DevResetService } from "../../services/devResetService";
import type { DevGrantService } from "../../services/devGrantService";
import type { PartySessionService } from "../../services/partySessionService";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentDevHelp, presentHelp } from "../presenters/helpPresenter";

export interface HelpCommandOptions {
  buildMainMenuKeyboard?: (ctx: Context) => Promise<Keyboard>;
}

export function registerHelpCommand(
  bot: Bot,
  devResetService: DevResetService,
  devGrantService?: Pick<DevGrantService, "isEnabled">,
  options: HelpCommandOptions & {
    partySessionService?: Pick<PartySessionService, "isEnabled"> | undefined;
  } = {}
): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(presentHelp({
      includeDevReset: devResetService.isEnabled(),
      includeDevGrant: devGrantService?.isEnabled() ?? false,
      includePartySessions: options.partySessionService?.isEnabled() ?? false
    }), {
      reply_markup: options.buildMainMenuKeyboard
        ? await options.buildMainMenuKeyboard(ctx)
        : buildMainMenuKeyboard()
    });
  });

  bot.command("dev_help", async (ctx) => {
    await ctx.reply(presentDevHelp({
      includeDevReset: devResetService.isEnabled(),
      includeDevGrant: devGrantService?.isEnabled() ?? false,
      includePartySessions: options.partySessionService?.isEnabled() ?? false
    }));
  });
}
