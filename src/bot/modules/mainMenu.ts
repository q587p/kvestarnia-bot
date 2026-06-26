import { type Bot,type Context } from "grammy";
import {
PRESENCE_LOCATION_KORCHMA_BAR,
PRESENCE_LOCATION_KORCHMA_BARREL,
PRESENCE_LOCATION_KORCHMA_CELLAR,
PRESENCE_LOCATION_KORCHMA_DEEP,
PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
PRESENCE_LOCATION_KORCHMA_FRONT,
PRESENCE_LOCATION_KORCHMA_HALL,
PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
normalizePresenceLocationId,
type PresenceService
} from "../../services/presenceService";
import type { BotServices } from "../botServices";
import { parsePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
sendCellarErrandRouted
} from "../commands/cellarCommand";
import { sendFight } from "../commands/fightCommand";
import { sendHero } from "../commands/heroCommand";
import {
sendHuntBoard
} from "../commands/huntCommand";
import { sendInventory } from "../commands/inventoryCommand";
import { sendNewsList } from "../commands/newsCommand";
import { sendOnline } from "../commands/onlineCommand";
import {
sendQuestHub
} from "../commands/questHubCommand";
import {
sendKorchmaBar,
sendKorchmaDeepClosed,
sendKorchmaFightingCorner,
sendKorchmaFront,
sendTavern,
sendTavernBarrel
} from "../commands/tavernCommand";
import { playerFromContext } from "../context";
import { parseFightCallbackData } from "../callbacks/fightCallbackData";
import {
buildMainMenuKeyboard,
getMainMenuLocationButtonPresenceId,
getMainMenuLocationButtonText,
mainMenuButtons,
mainMenuLocationButtonTexts
} from "../keyboards/mainMenuKeyboard";
import { presentHelp } from "../presenters/helpPresenter";

import {
presenceLocationToPersistentFightPassage,
sendPersistentFightPassagePreview
} from "./persistentFightNavigation";
import { buildQuestHubCommandOptions } from "./questHubOptions";
import { markScenePresence } from "./scenePresence";

export function registerMainMenuKeyboard(bot: Bot, services: BotServices): void {
  bot.hears(mainMenuButtons.hero, async (ctx) => {
    await sendHero(ctx, services.hero, "reply", {
      mainMenuKeyboard: await buildCurrentMainMenuKeyboard(ctx, services.presence)
    });
  });

  bot.hears([...mainMenuLocationButtonTexts], async (ctx) => {
    await sendCurrentLocation(ctx, services);
  });

  bot.hears([mainMenuButtons.quest, "🗺️ Квест"], async (ctx) => {
    await sendQuestHub(
      ctx,
      buildQuestHubCommandOptions(services),
      "reply"
    );
  });

  bot.hears(mainMenuButtons.inventory, async (ctx) => {
    await sendInventory(ctx, services.inventory, "reply");
  });

  bot.hears(mainMenuButtons.participants, async (ctx) => {
    await sendOnline(ctx, services.presence, {
      duelEnabled: Boolean(services.duel),
      itemGiftEnabled: Boolean(services.itemTransfers)
    });
  });

  bot.hears(mainMenuButtons.help, async (ctx) => {
    const replyMarkup = await buildCurrentMainMenuKeyboard(ctx, services.presence);

    await ctx.reply(presentHelp({
      includeDevReset: services.devReset.isEnabled(),
      includeDevGrant: services.devGrant?.isEnabled() ?? false
    }), {
      reply_markup: replyMarkup
    });
  });
}

export async function buildCurrentMainMenuKeyboard(
  ctx: Context,
  presenceService: PresenceService
): Promise<ReturnType<typeof buildMainMenuKeyboard>> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    return buildMainMenuKeyboard();
  }

  const place = await presenceService.getCurrentPlaceForTelegramUser(telegramUserId);

  return buildMainMenuKeyboard({
    locationId: place.state === "ready" ? place.locationId : null
  });
}

export function registerCallbackMainMenuLocationRefresh(bot: Bot, presenceService: PresenceService): void {
  bot.on("callback_query:data", async (ctx, next) => {
    const isPlaceCallback = parsePlaceCallbackData(ctx.callbackQuery.data).ok;
    if (isPlaceCallback) {
      await next();
      return;
    }
    const fightCallback = parseFightCallbackData(ctx.callbackQuery.data);
    const suppressMovementNotice = fightCallback.ok &&
      (fightCallback.value.type === "passage" ||
        fightCallback.value.type === "turn" ||
        fightCallback.value.type === "item");

    const previousLocationId = await getCurrentMainMenuLocationId(ctx, presenceService);

    await next();

    if (previousLocationId === undefined) {
      return;
    }

    if (!suppressMovementNotice) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, presenceService, {
        previousLocationId
      });
    }
  });
}

export async function refreshCurrentMainMenuLocationKeyboard(
  ctx: Context,
  presenceService: PresenceService,
  options: { previousLocationId?: string | null } = {}
): Promise<void> {
  if (options.previousLocationId === undefined) {
    return;
  }

  const locationId = await getCurrentMainMenuLocationId(ctx, presenceService);

  if (locationId === undefined) {
    return;
  }

  await refreshMainMenuLocationKeyboard(ctx, locationId, options);
}

async function getCurrentMainMenuLocationId(
  ctx: Context,
  presenceService: PresenceService
): Promise<string | null | undefined> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    return undefined;
  }

  if (typeof presenceService.getCurrentPlaceForTelegramUser !== "function") {
    return undefined;
  }

  const place = await presenceService.getCurrentPlaceForTelegramUser(telegramUserId);

  return place.state === "ready" ? normalizePresenceLocationId(place.locationId) : null;
}

export async function refreshMainMenuLocationKeyboard(
  ctx: Context,
  locationId: string | null,
  options: { previousLocationId?: string | null } = {}
): Promise<void> {
  if (options.previousLocationId === undefined) {
    return;
  }

  const previousLocationId =
    options.previousLocationId === null ? null : normalizePresenceLocationId(options.previousLocationId);
  const normalizedLocationId = locationId === null ? null : normalizePresenceLocationId(locationId);

  if (previousLocationId === normalizedLocationId) {
    return;
  }

  await ctx.reply(getLocationMovementNoticeText(normalizedLocationId, previousLocationId), {
    reply_markup: buildMainMenuKeyboard({
      locationId: normalizedLocationId
    })
  });
}

export async function sendPlaceMovementNotice(
  ctx: Context,
  presenceService: PresenceService,
  targetLocationId: string
): Promise<void> {
  const previousLocationId = await getCurrentMainMenuLocationId(ctx, presenceService);
  const normalizedTargetLocationId = normalizePresenceLocationId(targetLocationId);

  if (
    previousLocationId !== undefined &&
    previousLocationId !== null &&
    normalizePresenceLocationId(previousLocationId) === normalizedTargetLocationId
  ) {
    return;
  }

  await ctx.reply(getLocationMovementNoticeText(normalizedTargetLocationId, previousLocationId), {
    reply_markup: buildMainMenuKeyboard({
      locationId: normalizedTargetLocationId
    })
  });
}

function getLocationMovementNoticeText(
  locationId: string | null,
  previousLocationId?: string | null
): string {
  if (!locationId) {
    return "Ви озирнулися до корчми.";
  }

  const normalizedLocationId = normalizePresenceLocationId(locationId);
  const normalizedPreviousLocationId =
    previousLocationId === undefined || previousLocationId === null
      ? previousLocationId
      : normalizePresenceLocationId(previousLocationId);

  switch (normalizedLocationId) {
    case PRESENCE_LOCATION_KORCHMA_HALL:
      return "Ви повернулися до зали корчми.";
    case PRESENCE_LOCATION_KORCHMA_FRONT:
      return "Ви вийшли надвір.";
    case PRESENCE_LOCATION_KORCHMA_QUEST_TABLE:
      return "Ви підійшли до столу зі справами.";
    case PRESENCE_LOCATION_KORCHMA_BAR:
      return "Ви зайшли до шинку.";
    case PRESENCE_LOCATION_KORCHMA_BARREL:
      return "Ви підійшли до Бочки Пінного Міражу.";
    case PRESENCE_LOCATION_KORCHMA_CELLAR:
      return "Ви спустилися до льоху корчми.";
    case PRESENCE_LOCATION_KORCHMA_NEWS_CORNER:
      return "Ви підійшли до дошки вістей.";
    case PRESENCE_LOCATION_KORCHMA_RANGER_CORNER:
      return "Ви підійшли до єгерського кутка.";
    case PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER:
      return "Ви рушили до бійцівського кутка.";
    case PRESENCE_LOCATION_KORCHMA_DEEP:
      if (isKorchmaDeepLowerLocationId(normalizedPreviousLocationId)) {
        return "Ви піднялися до спуску до Низу.";
      }

      return "Ви пішли до Низу.";
    case PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1:
      return "Ви спустилися до Сутеренів Корчми.";
    case PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT:
      return "Ви пішли у лівий прохід.";
    case PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT:
      return "Ви пішли у прямий прохід.";
    case PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT:
      return "Ви пішли у правий прохід.";
    default:
      return `Ви рушили: ${getMainMenuLocationButtonText(normalizedLocationId)}.`;
  }
}

function isKorchmaDeepLowerLocationId(locationId: string | null | undefined): boolean {
  return (
    locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1 ||
    locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT ||
    locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT ||
    locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT
  );
}

export async function sendCurrentLocation(ctx: Context, services: BotServices): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
  const requestedLocationId = getMainMenuLocationButtonPresenceId(ctx.message?.text?.trim());

  if (!telegramUserId) {
    await sendTavern(ctx, services.tavern, services.presence, "reply");
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await sendTavern(ctx, services.tavern, services.presence, "reply");
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  await sendCurrentPresenceLocation(
    ctx,
    normalizePresenceLocationId(requestedLocationId ?? place.locationId),
    services
  );
  await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
}

async function sendCurrentPresenceLocation(
  ctx: Context,
  locationId: string,
  services: BotServices
): Promise<void> {
  if (locationId === PRESENCE_LOCATION_KORCHMA_FRONT) {
    await sendKorchmaFront(ctx, services.tavern, services.presence, "reply", services.yeger, {
      playerHintService: services.playerHints
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_HALL) {
    await sendTavern(ctx, services.tavern, services.presence, "reply");
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE) {
    await sendQuestHub(ctx, buildQuestHubCommandOptions(services), "reply");
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_BAR) {
    await sendKorchmaBar(ctx, services.tavern, services.presence, "reply", services.cellarGrownup, services.fight);
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_CELLAR) {
    await sendCellarErrandRouted(ctx, services.cellarErrand, services.presence, "reply", {
      tavernRaid: services.tavern,
      ...(services.cellarGrownup ? { grownupQuest: services.cellarGrownup } : {})
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_BARREL) {
    await sendTavernBarrel(ctx, services.tavern, services.presence, "reply");
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_NEWS_CORNER) {
    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
      currentRaidId: null,
      currentAdventureId: null
    });
    await sendNewsList(ctx, 0, "reply");
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_RANGER_CORNER) {
    await sendHuntBoard(ctx, services.yeger, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER) {
    await sendKorchmaFightingCorner(ctx, services.tavern, services.presence, "reply");
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP) {
    await sendKorchmaDeepClosed(ctx, services.tavern, services.presence, "reply");
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1) {
    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: true,
      openDifficulty: true
    });
    return;
  }

  const passageFight = presenceLocationToPersistentFightPassage(locationId);

  if (passageFight) {
    await sendPersistentFightPassagePreview(ctx, services, passageFight, "reply");
    return;
  }

  await sendTavern(ctx, services.tavern, services.presence, "reply");
}
