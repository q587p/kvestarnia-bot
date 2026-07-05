import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL
} from "../../services/presenceService";
import { telegramUserIdFromContext } from "../context";
import { makeItemGiftOpenCallbackData } from "../callbacks/itemGiftCallbackData";
import { makeItemPostalOpenCallbackData } from "../callbacks/itemPostalCallbackData";
import { makeClassNoncombatOpenCallbackData } from "../callbacks/classNoncombatCallbackData";
import { makeNearbyDuelOpenCallbackData } from "../callbacks/nearbyDuelCallbackData";
import {
  makePartySessionJoinCallbackData,
  makePartySessionNearbyOpenCallbackData
} from "../callbacks/partySessionCallbackData";
import type { PartySessionRecord } from "../../db/repositories/partySessionRepository";
import type { PartySessionService } from "../../services/partySessionService";
import type { TavernGameService } from "../../services/tavernGameService";
import type { TavernGameSessionRecord } from "../../db/repositories/tavernGameRepository";
import {
  makeShynokBardPerformanceStartCallbackData,
  makeShynokGameJoinCallbackData
} from "../callbacks/shynokCallbackData";
import {
  canJoinTavernGameSession,
  formatShynokOpenTableButtonLabel
} from "../keyboards/shynokKeyboard";
import { presentOnline } from "../presenters/presencePresenter";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export interface OnlineCommandOptions {
  bardPerformanceEnabled?: boolean;
  classNoncombatEnabled?: boolean;
  duelEnabled?: boolean;
  itemGiftEnabled?: boolean;
  partySessions?: PartySessionService | undefined;
  tavernGames?: Pick<TavernGameService, "getHub"> | undefined;
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
  const recruitingParties = await getVisibleRecruitingParties(snapshot, options);
  const openTavernGameTables = await getVisibleOpenTavernGameTables(snapshot, options);
  const nearbyActionsKeyboard = await buildNearbyActionsKeyboard(
    snapshot,
    telegramUserId,
    options,
    recruitingParties,
    openTavernGameTables
  );

  await ctx.reply(presentOnline(snapshot, { recruitingParties, openTavernGameTables }), {
    ...HTML_MESSAGE_OPTIONS,
    ...(nearbyActionsKeyboard
      ? { reply_markup: nearbyActionsKeyboard }
      : {})
  });
}

async function buildNearbyActionsKeyboard(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint,
  options: OnlineCommandOptions,
  recruitingParties: readonly PartySessionRecord[] = [],
  openTavernGameTables: readonly TavernGameSessionRecord[] = []
): Promise<InlineKeyboard | null> {
  const hasNearby = hasOtherActiveNearby(snapshot, telegramUserId);
  const canUseClassNoncombat = Boolean(options.classNoncombatEnabled && isEligibleClassNoncombat(snapshot, telegramUserId));

  if (!hasNearby && !canUseClassNoncombat && recruitingParties.length === 0 && openTavernGameTables.length === 0) {
    return null;
  }

  const keyboard = new InlineKeyboard();
  let hasActions = false;

  for (const session of recruitingParties) {
    keyboard.text(
      `🤝 До рейду: ${formatLeaderButton(session.leader.name)}`,
      makePartySessionJoinCallbackData(session.inviteToken)
    ).row();
    hasActions = true;
  }

  for (const table of openTavernGameTables.filter(canJoinTavernGameSession)) {
    keyboard
      .text(
        formatShynokOpenTableButtonLabel(table.gameKey, table.participants.length, table.stakeGold, table.result),
        makeShynokGameJoinCallbackData(table.token)
      )
      .row();
    hasActions = true;
  }

  if (hasNearby && (await hasLiveParty(options.partySessions, telegramUserId))) {
    keyboard.text("🧭 Покликати у ватагу", makePartySessionNearbyOpenCallbackData()).row();
    hasActions = true;
  }

  if (hasNearby && options.duelEnabled) {
    keyboard.text("🥊 Кинути виклик присутнім", makeNearbyDuelOpenCallbackData()).row();
    hasActions = true;
  }

  if (hasNearby && options.bardPerformanceEnabled && isEligibleNearbyBard(snapshot, telegramUserId)) {
    keyboard.text("🎶 Виступити", makeShynokBardPerformanceStartCallbackData()).row();
    hasActions = true;
  }

  if (options.classNoncombatEnabled && isEligibleNearbyPriest(snapshot, telegramUserId)) {
    keyboard.text("✨ Жрецька поміч", makeClassNoncombatOpenCallbackData("priest")).row();
    hasActions = true;
  }

  if (hasNearby && options.classNoncombatEnabled && isEligibleNearbyRogue(snapshot, telegramUserId)) {
    keyboard.text("🗡️ Тиха кишеня", makeClassNoncombatOpenCallbackData("rogue")).row();
    hasActions = true;
  }

  if (hasNearby && options.itemGiftEnabled) {
    keyboard.text("🎁 Подарувати манатку", makeItemGiftOpenCallbackData()).row();
    keyboard.text("📮 Пошта Квестарні", makeItemPostalOpenCallbackData()).row();
    hasActions = true;
  }

  return hasActions ? keyboard : null;
}

async function getVisibleRecruitingParties(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  options: OnlineCommandOptions
): Promise<PartySessionRecord[]> {
  if (snapshot.state !== "ready" || snapshot.location.id !== PRESENCE_LOCATION_KORCHMA_BARREL) {
    return [];
  }

  return options.partySessions?.listRecruitingBigBarrelBrother() ?? [];
}

async function getVisibleOpenTavernGameTables(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  options: OnlineCommandOptions
): Promise<TavernGameSessionRecord[]> {
  if (snapshot.state !== "ready" || snapshot.location.id !== PRESENCE_LOCATION_KORCHMA_BAR) {
    return [];
  }

  const hub = await options.tavernGames?.getHub();

  return hub?.state === "ready" ? [...hub.openTables] : [];
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
  const self = findSelf(snapshot, telegramUserId);
  return self?.classId === "class.bard" && (self.level ?? 0) >= 3;
}

function isEligibleClassNoncombat(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint
): boolean {
  return isEligibleNearbyPriest(snapshot, telegramUserId) || isEligibleNearbyRogue(snapshot, telegramUserId);
}

function isEligibleNearbyPriest(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint
): boolean {
  const self = findSelf(snapshot, telegramUserId);
  return self?.classId === "class.priest" && (self.level ?? 0) >= 3;
}

function isEligibleNearbyRogue(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint
): boolean {
  const self = findSelf(snapshot, telegramUserId);
  return self?.classId === "class.rogue" && (self.level ?? 0) >= 3;
}

function findSelf(
  snapshot: Awaited<ReturnType<PresenceService["getOnlineForTelegramUser"]>>,
  telegramUserId: bigint
) {
  if (snapshot.state !== "ready") {
    return null;
  }

  return [...snapshot.location.people.active, ...snapshot.location.people.idle]
    .find((person) => person.telegramUserId === telegramUserId) ?? null;
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

function formatLeaderButton(name: string): string {
  return name.length > 28 ? `${name.slice(0, 27)}…` : name;
}
