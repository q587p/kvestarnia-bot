import type { Bot, Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import { telegramUserIdFromContext } from "../context";
import { presentLook } from "../presenters/presencePresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerLookCommand(bot: Bot, presenceService: PresenceService): void {
  bot.command("look", async (ctx) => {
    await sendLook(ctx, presenceService);
  });
}

export async function sendLook(ctx: Context, presenceService: PresenceService): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await ctx.reply(presentLook({ state: "no-character" }), HTML_MESSAGE_OPTIONS);
    return;
  }

  const snapshot = await presenceService.getLookForTelegramUser(telegramUserId);
  await ctx.reply(presentLook(snapshot), HTML_MESSAGE_OPTIONS);
}
