import type { Bot } from "grammy";
import type { DevResetService } from "../../services/devResetService";
import type { DevGrantService } from "../../services/devGrantService";
import type { PartySessionService } from "../../services/partySessionService";
import type { PartyRaidChatService } from "../../services/partyRaidChatService";
import type { TavernGameService } from "../../services/tavernGameService";
import type { FightingCornerQuestService } from "../../services/fightingCornerQuestService";
import type { HealthRecoveryNotificationService } from "../../services/healthRecoveryNotificationService";
import type { GroupCombatService } from "../../services/groupCombatService";
import type { GuildService } from "../../services/guildService";
import type { ReferralService } from "../../services/referralService";
import { getDevHelpSections } from "../devHelpSections";
import { buildDevHelpKeyboard } from "../keyboards/devHelpKeyboard";
import { buildHelpKeyboard } from "../keyboards/helpKeyboard";
import { presentDevHelp, presentHelp } from "../presenters/helpPresenter";

export function registerHelpCommand(
  bot: Bot,
  devResetService: DevResetService,
  devGrantService?: Pick<DevGrantService, "isEnabled">,
  options: {
    partySessionService?: Pick<PartySessionService, "areDevHelpersEnabled"> | undefined;
    groupCombatService?: Pick<GroupCombatService, "areDevHelpersEnabled"> | undefined;
    partyRaidChatService?: Pick<PartyRaidChatService, "areDevHelpersEnabled"> | undefined;
    tavernGameService?: Pick<TavernGameService, "isEnabled"> | undefined;
    fightingCornerQuestService?: Pick<FightingCornerQuestService, "isDevHelperEnabled"> | undefined;
    healthRecoveryNotificationService?: Pick<HealthRecoveryNotificationService, "areDevHelpersEnabled"> | undefined;
    guildService?: Pick<GuildService, "areDevHelpersEnabled" | "areWeeklyDevHelpersEnabled"> | undefined;
    referralService?: Pick<ReferralService, "isFoundationEnabled" | "areDevHelpersEnabled"> | undefined;
  } = {}
): void {
  const visibility = {
    includeDevReset: devResetService.isEnabled(),
    includeDevGrant: devGrantService?.isEnabled() ?? false,
    includePartySessions: options.partySessionService?.areDevHelpersEnabled() ?? false,
    includeGroupCombat: options.groupCombatService?.areDevHelpersEnabled() ?? false,
    includeRaidChat: options.partyRaidChatService !== undefined,
    includeRaidChatDev: options.partyRaidChatService?.areDevHelpersEnabled() ?? false,
    includeTavernGames: typeof options.tavernGameService?.isEnabled === "function"
      ? options.tavernGameService.isEnabled()
      : false,
    includeFightingCornerQuest: options.fightingCornerQuestService?.isDevHelperEnabled() ?? false,
    includeHpRecovery: options.healthRecoveryNotificationService?.areDevHelpersEnabled() ?? false,
    includeGuild: options.guildService !== undefined,
    includeGuildDev: options.guildService?.areDevHelpersEnabled() ?? false,
    includeGuildWeeklyDev: options.guildService?.areWeeklyDevHelpersEnabled?.() ?? false,
    includeReferral: options.referralService?.isFoundationEnabled() ?? false,
    includeReferralDev: options.referralService?.areDevHelpersEnabled() ?? false
  };

  bot.command("help", async (ctx) => {
    await ctx.reply(presentHelp(visibility), {
      reply_markup: buildHelpKeyboard()
    });
  });

  if (getDevHelpSections(visibility).length === 0) {
    return;
  }

  bot.command("dev_help", async (ctx) => {
    await ctx.reply(presentDevHelp(visibility), {
      reply_markup: buildDevHelpKeyboard(visibility)
    });
  });
}
