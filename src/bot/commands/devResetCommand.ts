import type { Bot } from "grammy";
import type { AdventureService } from "../../services/adventureService";
import type { DevResetService } from "../../services/devResetService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { playerFromContext } from "../context";
import { buildDevResetKeyboard } from "../keyboards/mainMenuKeyboard";
import {
  presentDevAdventureResetResult,
  presentDevRaidStopResult,
  presentDevResetDisabled,
  presentDevResetPrompt
} from "../presenters/devResetPresenter";
import { presentLevelUpCelebration } from "../presenters/levelGrowthPresenter";

export function registerDevResetCommand(
  bot: Bot,
  devResetService: DevResetService,
  adventureService?: Pick<AdventureService, "resetCurrentPeriodForTelegramUser">,
  tavernRaidService?: Pick<TavernRaidService, "stopPendingFridayBarrelRaidForDev">
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

  bot.command("dev_raid_stop", async (ctx) => {
    if (!devResetService.isEnabled()) {
      await ctx.reply(presentDevResetDisabled());
      return;
    }

    if (!tavernRaidService) {
      await ctx.reply(presentDevRaidStopResult({ state: "unavailable" }));
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

    if (!telegramUserId) {
      await ctx.reply(presentDevRaidStopResult({ state: "no-character" }));
      return;
    }

    const result = await tavernRaidService.stopPendingFridayBarrelRaidForDev(telegramUserId);

    await ctx.reply(presentDevRaidStopResult(result));
    if (result.state === "completed") {
      const levelUpText = presentLevelUpCelebration(
        result.result.levelChange,
        result.result.character.classId,
        {
          raceId: result.result.character.raceId,
          path: result.result.character.path
        }
      );

      if (levelUpText) {
        await ctx.reply(levelUpText, { parse_mode: "HTML" });
      }
    }
  });
}
