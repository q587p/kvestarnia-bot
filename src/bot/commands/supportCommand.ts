import type { Bot, Context } from "grammy";
import type { SupportJarStatus } from "../../config/env";
import { buildMainMenuKeyboard } from "../keyboards/mainMenuKeyboard";
import { presentSupportJar } from "../presenters/supportPresenter";

export function registerSupportCommand(
  bot: Bot,
  supportJarUrl: string | undefined,
  supportJarStatus: SupportJarStatus | undefined
): void {
  bot.command("support", async (ctx) => {
    await sendSupport(ctx, supportJarUrl, supportJarStatus);
  });
}

export async function sendSupport(
  ctx: Context,
  supportJarUrl: string | undefined,
  supportJarStatus: SupportJarStatus | undefined
): Promise<void> {
  await ctx.reply(presentSupportJar(supportJarUrl, supportJarStatus), {
    reply_markup: buildMainMenuKeyboard()
  });
}
