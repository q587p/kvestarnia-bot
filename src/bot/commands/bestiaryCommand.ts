import type { Bot, Context } from "grammy";
import { buildBestiaryListKeyboard, buildBestiaryMonsterKeyboard } from "../keyboards/bestiaryKeyboard";
import { presentBestiaryList, presentBestiaryMonster } from "../presenters/bestiaryPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

export function registerBestiaryCommand(bot: Bot): void {
  bot.command("bestiary", async (ctx) => {
    await sendBestiaryList(ctx, "reply", 0);
  });
  bot.command("monsters", async (ctx) => {
    await sendBestiaryList(ctx, "reply", 0);
  });
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
  replyMarkup: ReturnType<typeof buildBestiaryListKeyboard>
): Promise<void> {
  const options = {
    parse_mode: "HTML" as const,
    reply_markup: replyMarkup
  };

  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}
