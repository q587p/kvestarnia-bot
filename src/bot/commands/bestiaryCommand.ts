import type { Bot, Context } from "grammy";
import { BESTIARY_MIN_LEVEL, meetsActivityLevel } from "../../domain/progression/activityGates";
import type { HeroService } from "../../services/heroService";
import { telegramUserIdFromContext } from "../context";
import { buildBestiaryListKeyboard, buildBestiaryMonsterKeyboard } from "../keyboards/bestiaryKeyboard";
import {
  presentBestiaryLevelLocked,
  presentBestiaryList,
  presentBestiaryMonster,
  presentBestiaryNoCharacter
} from "../presenters/bestiaryPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

export function registerBestiaryCommand(bot: Bot, heroService: HeroService): void {
  bot.command("bestiary", async (ctx) => {
    await sendBestiaryListGated(ctx, heroService, "reply", 0);
  });
  bot.command("monsters", async (ctx) => {
    await sendBestiaryListGated(ctx, heroService, "reply", 0);
  });
}

export async function sendBestiaryListGated(
  ctx: Context,
  heroService: HeroService,
  mode: "reply" | "edit",
  page: number
): Promise<void> {
  if (!(await canReadBestiary(ctx, heroService, mode))) {
    return;
  }

  await sendBestiaryList(ctx, mode, page);
}

export async function sendBestiaryMonsterGated(
  ctx: Context,
  heroService: HeroService,
  mode: "reply" | "edit",
  monsterId: string,
  page: number
): Promise<void> {
  if (!(await canReadBestiary(ctx, heroService, mode))) {
    return;
  }

  await sendBestiaryMonster(ctx, mode, monsterId, page);
}

export async function sendBestiaryList(
  ctx: Context,
  mode: "reply" | "edit",
  page: number
): Promise<void> {
  await sendText(ctx, mode, presentBestiaryList(page), buildBestiaryListKeyboard(page));
}

export async function sendBestiaryMonster(
  ctx: Context,
  mode: "reply" | "edit",
  monsterId: string,
  page: number
): Promise<void> {
  await sendText(ctx, mode, presentBestiaryMonster(monsterId), buildBestiaryMonsterKeyboard(page));
}

async function sendText(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  replyMarkup?: ReturnType<typeof buildBestiaryListKeyboard>
): Promise<void> {
  const options = {
    parse_mode: "HTML" as const,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  };

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

async function canReadBestiary(
  ctx: Context,
  heroService: HeroService,
  mode: "reply" | "edit"
): Promise<boolean> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await sendText(ctx, mode, presentBestiaryNoCharacter(), undefined);
    return false;
  }

  const hero = await heroService.findByTelegramUserId(telegramUserId);

  if (hero.state === "no-character") {
    await sendText(ctx, mode, presentBestiaryNoCharacter(), undefined);
    return false;
  }

  if (!meetsActivityLevel(hero.character.level, BESTIARY_MIN_LEVEL)) {
    await sendText(ctx, mode, presentBestiaryLevelLocked(), undefined);
    return false;
  }

  return true;
}
