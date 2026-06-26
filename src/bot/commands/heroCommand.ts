import { InlineKeyboard, type Bot, type Context, type Keyboard } from "grammy";
import type { HeroService } from "../../services/heroService";
import { makeItemUseRestoreToFullCallbackData } from "../callbacks/itemUseCallbackData";
import { telegramUserIdFromContext } from "../context";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentHero, presentHeroMissing } from "../presenters/heroPresenter";
import {
  prefixResourceRecoveryNotice,
  presentResourceRecoveryNotice
} from "../presenters/resourceRecoveryPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

export interface HeroCommandOptions {
  buildMainMenuKeyboard?: (ctx: Context) => Promise<Keyboard>;
}

export interface SendHeroOptions {
  mainMenuKeyboard?: Keyboard;
}

export function registerHeroCommand(
  bot: Bot,
  heroService: HeroService,
  options: HeroCommandOptions = {}
): void {
  bot.command(["hero", "profile", "me"], async (ctx) => {
    await sendHero(ctx, heroService, "reply", {
      ...(options.buildMainMenuKeyboard
        ? { mainMenuKeyboard: await options.buildMainMenuKeyboard(ctx) }
        : {})
    });
  });
}

export async function sendHero(
  ctx: Context,
  heroService: HeroService,
  mode: "reply" | "edit",
  options: SendHeroOptions = {}
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, "Квестарня не впізнала мандрівника. Спробуйте ще раз.");
    return;
  }

  const result = await heroService.findByTelegramUserId(telegramUserId);

  if (result.state === "existing-character") {
    const heroText = presentHero(result.character, {
      activeDrink: result.activeDrink,
      inventoryGoldValue: result.inventoryGoldValue
    });

    if (result.recoveryNotice && mode === "reply") {
      await sendText(ctx, "reply", presentResourceRecoveryNotice(result.recoveryNotice));
    }

    const restoreKeyboard = result.restoreToFullItemId
      ? buildHeroRestoreToFullKeyboard(result.restoreToFullItemId)
      : undefined;

    await sendText(
      ctx,
      mode,
      mode === "edit"
        ? prefixResourceRecoveryNotice(heroText, result.recoveryNotice)
        : heroText,
      true,
      restoreKeyboard ?? options.mainMenuKeyboard
    );
    return;
  }

  await sendText(ctx, mode, presentHeroMissing(), false);
}

function buildHeroRestoreToFullKeyboard(itemId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("❤️ До відновлення", makeItemUseRestoreToFullCallbackData(itemId));
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  includeMenu = false,
  replyMarkup?: InlineKeyboard | Keyboard
): Promise<void> {
  if (mode === "edit") {
    await safeEditMessageText(ctx, text, {
      parse_mode: "HTML" as const,
      ...(replyMarkup instanceof InlineKeyboard ? { reply_markup: replyMarkup } : {})
    });
    return;
  }

  await ctx.reply(text, {
    parse_mode: "HTML" as const,
    ...(includeMenu ? { reply_markup: replyMarkup ?? buildMainMenuKeyboard() } : {})
  });
}
