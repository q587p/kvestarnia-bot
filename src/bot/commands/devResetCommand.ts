import type { Bot } from "grammy";
import type { AdventureService } from "../../services/adventureService";
import type { DevResetService } from "../../services/devResetService";
import { playerFromContext } from "../context";
import { buildDevResetKeyboard } from "../keyboards/mainMenuKeyboard";
import {
  presentDevAdventureResetResult,
  presentDevResetDisabled,
  presentDevResetPrompt
} from "../presenters/devResetPresenter";

export function registerDevResetCommand(
  bot: Bot,
  devResetService: DevResetService,
  adventureService?: Pick<AdventureService, "resetCurrentPeriodForTelegramUser">
): void {
  bot.command("dev_reset_me", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    await ctx.reply(presentDevResetPrompt(), {
      reply_markup: buildDevResetKeyboard()
    });
  });

  bot.command("dev_adventure_reset", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    if (!adventureService) {
      await ctx.reply(presentDevAdventureResetResult("unavailable"));
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

    if (!telegramUserId) {
      await ctx.reply(presentDevAdventureResetResult("no-character"));
      return;
    }

    const result = await adventureService.resetCurrentPeriodForTelegramUser(telegramUserId);

    await ctx.reply(presentDevAdventureResetResult(result.state));
  });
}
