import type { Bot, Context } from "grammy";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentSupportBarrel } from "../presenters/supportPresenter";

export function registerSupportCommand(bot: Bot, supportBarrelUrl: string | undefined): void {
  bot.command("support", async (ctx) => {
    await sendSupport(ctx, supportBarrelUrl);
  });
}

export async function sendSupport(
  ctx: Context,
  supportBarrelUrl: string | undefined
): Promise<void> {
  await ctx.reply(presentSupportBarrel(supportBarrelUrl), {
    reply_markup: buildMainMenuKeyboard()
  });
}
