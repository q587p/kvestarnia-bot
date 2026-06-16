import type { Bot, Context } from "grammy";
import type { SupportBarrelStatus } from "../../config/env";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentSupportBarrel } from "../presenters/supportPresenter";

export function registerSupportCommand(
  bot: Bot,
  supportBarrelUrl: string | undefined,
  supportBarrelStatus: SupportBarrelStatus | undefined
): void {
  bot.command("support", async (ctx) => {
    await sendSupport(ctx, supportBarrelUrl, supportBarrelStatus);
  });
}

export async function sendSupport(
  ctx: Context,
  supportBarrelUrl: string | undefined,
  supportBarrelStatus: SupportBarrelStatus | undefined
): Promise<void> {
  await ctx.reply(presentSupportBarrel(supportBarrelUrl, supportBarrelStatus), {
    reply_markup: buildMainMenuKeyboard()
  });
}
