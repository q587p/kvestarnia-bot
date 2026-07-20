import type { Bot, Context, Keyboard } from "grammy";
import type { DevResetService } from "../../services/devResetService";
import type { DevGrantService } from "../../services/devGrantService";
import type { PartySessionService } from "../../services/partySessionService";
import type { PartyRaidChatService } from "../../services/partyRaidChatService";
import type { TavernGameService } from "../../services/tavernGameService";
import type { FightingCornerQuestService } from "../../services/fightingCornerQuestService";
import type { HealthRecoveryNotificationService } from "../../services/healthRecoveryNotificationService";
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
    partySessionService?: Pick<PartySessionService, "areDevHelpersEnabled"> | undefined;
    partyRaidChatService?: Pick<PartyRaidChatService, "areDevHelpersEnabled"> | undefined;
    tavernGameService?: Pick<TavernGameService, "isEnabled"> | undefined;
    fightingCornerQuestService?: Pick<FightingCornerQuestService, "isDevHelperEnabled"> | undefined;
    healthRecoveryNotificationService?: Pick<HealthRecoveryNotificationService, "areDevHelpersEnabled"> | undefined;
  } = {}
): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(presentHelp({
      includeDevReset: devResetService.isEnabled(),
      includeDevGrant: devGrantService?.isEnabled() ?? false,
      includePartySessions: options.partySessionService?.areDevHelpersEnabled() ?? false,
      includeRaidChat: options.partyRaidChatService?.areDevHelpersEnabled() ?? false,
      includeTavernGames: options.tavernGameService?.isEnabled() ?? false,
      includeFightingCornerQuest: options.fightingCornerQuestService?.isDevHelperEnabled() ?? false,
      includeHpRecovery: options.healthRecoveryNotificationService?.areDevHelpersEnabled() ?? false
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
      includePartySessions: options.partySessionService?.areDevHelpersEnabled() ?? false,
      includeRaidChat: options.partyRaidChatService?.areDevHelpersEnabled() ?? false,
      includeFightingCornerQuest: options.fightingCornerQuestService?.isDevHelperEnabled() ?? false,
      includeHpRecovery: options.healthRecoveryNotificationService?.areDevHelpersEnabled() ?? false
    }));
  });
}
