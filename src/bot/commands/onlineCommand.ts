import type { Bot, Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import { telegramUserIdFromContext } from "../context";
import { buildNearbyDuelOpenKeyboard } from "../keyboards/nearbyDuelKeyboard";
import { presentOnline } from "../presenters/presencePresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerOnlineCommand(
  bot: Bot,
  presenceService: PresenceService,
  options: { duelEnabled?: boolean } = {}
): void {
  bot.command("online", async (ctx) => {
    await sendOnline(ctx, presenceService, options);
  });
}

export async function sendOnline(
  ctx: Context,
  presenceService: PresenceService,
  options: { duelEnabled?: boolean } = {}
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await ctx.reply(presentOnline({ state: "no-character" }), HTML_MESSAGE_OPTIONS);
    return;
  }

  const snapshot = await presenceService.getOnlineForTelegramUser(telegramUserId);
  await ctx.reply(presentOnline(snapshot), {
    ...HTML_MESSAGE_OPTIONS,
    ...(options.duelEnabled && canOpenNearbyDuel(snapshot, telegramUserId)
      ? { reply_markup: buildNearbyDuelOpenKeyboard() }
      : {})
  });
}

function canOpenNearbyDuel(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint
): boolean {
  return (
    snapshot.state === "ready" &&
    snapshot.location.people.active.some((person) => person.telegramUserId !== telegramUserId)
  );
}
