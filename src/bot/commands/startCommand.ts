import type { Bot } from "grammy";
import type { OnboardingService } from "../../services/onboardingService";
import { playerFromContext } from "../context";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { buildGenderKeyboard } from "../keyboards/onboardingKeyboard";
import { presentHero } from "../presenters/heroPresenter";
import { presentWelcome } from "../presenters/onboardingPresenter";

export function registerStartCommand(bot: Bot, onboardingService: OnboardingService): void {
  bot.command("start", async (ctx) => {
    const player = playerFromContext(ctx.from);

    if (!player) {
      await ctx.reply("Квестарня не впізнала мандрівника. Спробуйте ще раз із особистого акаунта.");
      return;
    }

    const result = await onboardingService.start(player);

    if (result.state === "existing-character") {
      await ctx.reply(presentHero(result.character), buildExistingCharacterReplyOptions());
      return;
    }

    await ctx.reply(presentWelcome(), {
      parse_mode: "HTML" as const,
      reply_markup: buildGenderKeyboard()
    });
  });
}

export function buildExistingCharacterReplyOptions(): {
  parse_mode: "HTML";
  reply_markup: ReturnType<typeof buildMainMenuKeyboard>;
} {
  return {
    parse_mode: "HTML",
    reply_markup: buildMainMenuKeyboard()
  };
}
