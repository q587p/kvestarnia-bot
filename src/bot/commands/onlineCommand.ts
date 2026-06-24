import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import { telegramUserIdFromContext } from "../context";
import { makeItemGiftOpenCallbackData } from "../callbacks/itemGiftCallbackData";
import { makeNearbyDuelOpenCallbackData } from "../callbacks/nearbyDuelCallbackData";
import { presentOnline } from "../presenters/presencePresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export interface OnlineCommandOptions {
  duelEnabled?: boolean;
  itemGiftEnabled?: boolean;
}

export function registerOnlineCommand(
  bot: Bot,
  presenceService: PresenceService,
  options: OnlineCommandOptions = {}
): void {
  bot.command("online", async (ctx) => {
    await sendOnline(ctx, presenceService, options);
  });
}

export async function sendOnline(
  ctx: Context,
  presenceService: PresenceService,
  options: OnlineCommandOptions = {}
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await ctx.reply(presentOnline({ state: "no-character" }), HTML_MESSAGE_OPTIONS);
    return;
  }

  const snapshot = await presenceService.getOnlineForTelegramUser(telegramUserId);
  const nearbyActionsKeyboard = buildNearbyActionsKeyboard(snapshot, telegramUserId, options);

  await ctx.reply(presentOnline(snapshot), {
    ...HTML_MESSAGE_OPTIONS,
    ...(nearbyActionsKeyboard
      ? { reply_markup: nearbyActionsKeyboard }
      : {})
  });
}

function buildNearbyActionsKeyboard(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint,
  options: OnlineCommandOptions
): InlineKeyboard | null {
  if (!hasOtherActiveNearby(snapshot, telegramUserId)) {
    return null;
  }

  const keyboard = new InlineKeyboard();
  let hasActions = false;

  if (options.duelEnabled) {
    keyboard.text("🥊 Кинути виклик присутнім", makeNearbyDuelOpenCallbackData()).row();
    hasActions = true;
  }

  if (options.itemGiftEnabled) {
    keyboard.text("🎁 Подарувати манатку", makeItemGiftOpenCallbackData()).row();
    hasActions = true;
  }

  return hasActions ? keyboard : null;
}

function hasOtherActiveNearby(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint
): boolean {
  return (
    snapshot.state === "ready" &&
    snapshot.location.people.active.some((person) => person.telegramUserId !== telegramUserId)
  );
}
