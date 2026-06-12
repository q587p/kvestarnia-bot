import type { Bot, Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import { telegramUserIdFromContext } from "../context";
import { presentOnline } from "../presenters/presencePresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerOnlineCommand(bot: Bot, presenceService: PresenceService): void {
  bot.command("online", async (ctx) => {
    await sendOnline(ctx, presenceService);
  });
}

export async function sendOnline(
  ctx: Context,
  presenceService: PresenceService
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await ctx.reply(presentOnline({ state: "no-character" }), HTML_MESSAGE_OPTIONS);
    return;
  }

  const snapshot = await presenceService.getOnlineForTelegramUser(telegramUserId);
  await ctx.reply(presentOnline(snapshot), HTML_MESSAGE_OPTIONS);
}
