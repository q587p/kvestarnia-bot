import type { Bot, Context } from "grammy";
import type { HeroService } from "../../services/heroService";
import { telegramUserIdFromContext } from "../context";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentHero, presentHeroMissing } from "../presenters/heroPresenter";
import {
  prefixResourceRecoveryNotice,
  presentResourceRecoveryNotice
} from "../presenters/resourceRecoveryPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

export function registerHeroCommand(bot: Bot, heroService: HeroService): void {
  bot.command(["hero", "profile", "me"], async (ctx) => {
    await sendHero(ctx, heroService, "reply");
  });
}

export async function sendHero(
  ctx: Context,
  heroService: HeroService,
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await heroService.findByTelegramUserId(telegramUserId);

  if (result.state === "existing-character") {
    const heroText = presentHero(result.character, { inventoryGoldValue: result.inventoryGoldValue });

    if (result.recoveryNotice && mode === "reply") {
      await sendText(ctx, "reply", presentResourceRecoveryNotice(result.recoveryNotice));
    }

    await sendText(
      ctx,
      mode,
      mode === "edit"
        ? prefixResourceRecoveryNotice(heroText, result.recoveryNotice)
        : heroText,
      true
    );
    return;
  }

  await sendText(ctx, mode, presentHeroMissing(), false);
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  includeMenu = false
): Promise<void> {
  if (mode === "edit") {
    await safeEditMessageText(ctx, text, {
      parse_mode: "HTML" as const
    });
    return;
  }

  await ctx.reply(text, {
    parse_mode: "HTML" as const,
    ...(includeMenu ? { reply_markup: buildMainMenuKeyboard() } : {})
  });
}
