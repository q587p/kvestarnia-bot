import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import { telegramUserIdFromContext } from "../context";
import { makeItemGiftOpenCallbackData } from "../callbacks/itemGiftCallbackData";
import { makeItemPostalOpenCallbackData } from "../callbacks/itemPostalCallbackData";
import { makeNearbyDuelOpenCallbackData } from "../callbacks/nearbyDuelCallbackData";
import type { PartySessionService } from "../../services/partySessionService";
import { makeShynokBardPerformanceStartCallbackData } from "../callbacks/shynokCallbackData";
import { presentOnline } from "../presenters/presencePresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export interface OnlineCommandOptions {
  bardPerformanceEnabled?: boolean;
  duelEnabled?: boolean;
  itemGiftEnabled?: boolean;
  partySessions?: PartySessionService | undefined;
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
  const nearbyActionsKeyboard = await buildNearbyActionsKeyboard(snapshot, telegramUserId, options);

  await ctx.reply(presentOnline(snapshot), {
    ...HTML_MESSAGE_OPTIONS,
    ...(nearbyActionsKeyboard
      ? { reply_markup: nearbyActionsKeyboard }
      : {})
  });
}

async function buildNearbyActionsKeyboard(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint,
  options: OnlineCommandOptions
): Promise<InlineKeyboard | null> {
  if (!hasOtherActiveNearby(snapshot, telegramUserId)) {
    return null;
  }

  const keyboard = new InlineKeyboard();
  let hasActions = false;

  if (await hasLiveParty(options.partySessions, telegramUserId)) {
    keyboard.text("🧭 Покликати у ватагу", makeNearbyDuelOpenCallbackData()).row();
    hasActions = true;
  }

  if (options.duelEnabled) {
    keyboard.text("🥊 Кинути виклик присутнім", makeNearbyDuelOpenCallbackData()).row();
    hasActions = true;
  }

  if (options.bardPerformanceEnabled && isEligibleNearbyBard(snapshot, telegramUserId)) {
    keyboard.text("🎶 Виступити", makeShynokBardPerformanceStartCallbackData()).row();
    hasActions = true;
  }

  if (options.itemGiftEnabled) {
    keyboard.text("🎁 Подарувати манатку", makeItemGiftOpenCallbackData()).row();
    keyboard.text("📮 Пошта Квестарні", makeItemPostalOpenCallbackData()).row();
    hasActions = true;
  }

  return hasActions ? keyboard : null;
}

async function hasLiveParty(
  service: PartySessionService | null | undefined,
  telegramUserId: bigint
): Promise<boolean> {
  return Boolean(await service?.getLiveRecruitingByTelegramUser(telegramUserId));
}

function isEligibleNearbyBard(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint
): boolean {
  if (snapshot.state !== "ready") {
    return false;
  }

  const self = [...snapshot.location.people.active, ...snapshot.location.people.idle]
    .find((person) => person.telegramUserId === telegramUserId);

  return self?.classId === "class.bard" && (self.level ?? 0) >= 3;
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
