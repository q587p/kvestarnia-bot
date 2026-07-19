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
PRESENCE_LOCATION_KORCHMA_YARD,
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
import { sendEquipment } from "../commands/equipmentCommand";
import {
sendHuntBoard
} from "../commands/huntCommand";
import { shouldShowYegerFieldKitHelp } from "../commands/yegerFieldKitHelp";
import { sendInventory } from "../commands/inventoryCommand";
import { sendOnline } from "../commands/onlineCommand";
import {
sendQuestHub,
sendQuestOverview
} from "../commands/questHubCommand";
import {
buildKorchmaBarOptions,
sendKorchmaBar,
sendKorchmaDeepClosed,
sendKorchmaFightingCorner,
sendKorchmaFront,
sendKorchmaNewsCorner,
sendKorchmaYard,
sendTavern,
sendTavernBarrel
} from "../commands/tavernCommand";
import { playerFromContext } from "../context";
import { parseFightCallbackData } from "../callbacks/fightCallbackData";
import { parseOnboardingCallbackData } from "../callbacks/onboardingCallbackData";
import { parseYegerCallbackData, type YegerCallback } from "../callbacks/yegerCallbackData";
import {
buildMainMenuKeyboard,
getMainMenuLocationButtonPresenceId,
getMainMenuLocationButtonText,
mainMenuButtons,
mainMenuQuestButtonTexts,
mainMenuLocationButtonTexts,
type MainMenuKeyboardOptions
} from "../keyboards/mainMenuKeyboard";
import {
buildDailyKorchmaRoundSceneKeyboard
} from "../keyboards/dailyKorchmaRoundKeyboard";
import {
presentDailyKorchmaRoundScene
} from "../presenters/dailyKorchmaRoundPresenter";
import { presentDevHelp, presentHelp } from "../presenters/helpPresenter";

import {
showActivePassageSearchIfNeeded
} from "./passageSearchGuard";
import {
presenceLocationToPersistentFightPassage,
sendPersistentFightPassagePreview
} from "./persistentFightNavigation";
import { buildQuestHubCommandOptions } from "./questHubOptions";
import { markScenePresence } from "./scenePresence";
import { buildQuestMarkerSnapshotForTelegramUser } from "../questMarkerSnapshot";

type MainMenuRouteOptions = {
  botUsername?: string | undefined;
};

export function registerMainMenuKeyboard(
  bot: Bot,
  services: BotServices,
  options: MainMenuRouteOptions = {}
): void {
  const includeAdmin = shouldIncludeAdminMainMenu(services);

  bot.hears(mainMenuButtons.hero, async (ctx) => {
    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "reply"))) {
      return;
    }

    await sendHero(ctx, services.hero, "reply", {
      mainMenuKeyboard: await buildCurrentMainMenuKeyboardWithQuestMarkers(ctx, services, { includeAdmin })
    });
  });

  bot.hears([...mainMenuLocationButtonTexts], async (ctx) => {
    await sendCurrentLocation(ctx, services, options);
  });

  bot.hears([...mainMenuQuestButtonTexts], async (ctx) => {
    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "reply"))) {
      return;
    }

    await sendQuestOverview(
      ctx,
      buildQuestHubCommandOptions(services),
      "reply"
    );
  });

  bot.hears(mainMenuButtons.equipment, async (ctx) => {
    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "reply"))) {
      return;
    }

    await sendEquipment(ctx, services.equipment, "reply");
  });

  bot.hears(mainMenuButtons.inventory, async (ctx) => {
    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "reply"))) {
      return;
    }

    await sendInventory(ctx, services.inventory, "reply", 0, null, services.equipment);
  });

  bot.hears(mainMenuButtons.participants, async (ctx) => {
    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "reply"))) {
      return;
    }

    await sendOnline(ctx, services.presence, {
      bardPerformance: services.bardPerformance,
      classNoncombatEnabled: Boolean(services.classNoncombat),
      duelEnabled: Boolean(services.duel),
      itemGiftEnabled: Boolean(services.itemTransfers),
      partySessions: services.partySessions,
      tavernGames: services.tavernGames
    });
  });

  bot.hears(mainMenuButtons.help, async (ctx) => {
    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "reply"))) {
      return;
    }

    const replyMarkup = await buildCurrentMainMenuKeyboardWithQuestMarkers(ctx, services, { includeAdmin });

    await ctx.reply(presentHelp({
      includeDevReset: services.devReset.isEnabled(),
      includeDevGrant: services.devGrant?.isEnabled() ?? false,
      includePartySessions: services.partySessions?.areDevHelpersEnabled() ?? false,
      includeTavernGames: services.tavernGames?.isEnabled() ?? false,
      includeFightingCornerQuest: services.fightingCornerQuest?.isDevHelperEnabled() ?? false,
      includeHpRecovery: services.healthRecoveryNotifications?.areDevHelpersEnabled() ?? false
    }), {
      reply_markup: replyMarkup
    });
  });

  bot.hears(mainMenuButtons.admin, async (ctx) => {
    if (!includeAdmin) {
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "reply"))) {
      return;
    }

    await ctx.reply(presentDevHelp({
      includeDevReset: services.devReset.isEnabled(),
      includeDevGrant: services.devGrant?.isEnabled() ?? false,
      includePartySessions: services.partySessions?.areDevHelpersEnabled() ?? false,
      includeFightingCornerQuest: services.fightingCornerQuest?.isDevHelperEnabled() ?? false,
      includeHpRecovery: services.healthRecoveryNotifications?.areDevHelpersEnabled() ?? false
    }), {
      reply_markup: await buildCurrentMainMenuKeyboardWithQuestMarkers(ctx, services, { includeAdmin })
    });
  });
}

export function shouldIncludeAdminMainMenu(
  services: Pick<
    BotServices,
    "devReset" | "devGrant" | "partySessions" | "fightingCornerQuest" | "healthRecoveryNotifications"
  >
): boolean {
  return services.devReset.isEnabled()
    || (services.devGrant?.isEnabled() ?? false)
    || (services.partySessions?.areDevHelpersEnabled() ?? false)
    || (services.fightingCornerQuest?.isDevHelperEnabled() ?? false)
    || (services.healthRecoveryNotifications?.areDevHelpersEnabled() ?? false);
}

export async function buildCurrentMainMenuKeyboard(
  ctx: Context,
  presenceService: PresenceService,
  options: Pick<MainMenuKeyboardOptions, "includeAdmin" | "questMarkers"> = {}
): Promise<ReturnType<typeof buildMainMenuKeyboard>> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    return buildMainMenuKeyboard(options);
  }

  const place = await presenceService.getCurrentPlaceForTelegramUser(telegramUserId);

  return buildMainMenuKeyboard({
    locationId: place.state === "ready" ? place.locationId : null,
    ...(options.questMarkers === undefined ? {} : { questMarkers: options.questMarkers }),
    ...(options.includeAdmin === undefined ? {} : { includeAdmin: options.includeAdmin })
  });
}

async function buildCurrentMainMenuKeyboardWithQuestMarkers(
  ctx: Context,
  services: BotServices,
  options: Pick<MainMenuKeyboardOptions, "includeAdmin"> = {}
): Promise<ReturnType<typeof buildMainMenuKeyboard>> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
  const questMarkers = telegramUserId
    ? await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services)
    : null;

  return buildCurrentMainMenuKeyboard(ctx, services.presence, {
    ...options,
    ...(questMarkers ? { questMarkers } : {})
  });
}

interface CallbackMainMenuLocationRefreshState {
  previousLocationId: string | null;
  handled: boolean;
}

const callbackMainMenuLocationRefreshState = new WeakMap<Context, CallbackMainMenuLocationRefreshState>();

export function registerCallbackMainMenuLocationRefresh(bot: Bot, presenceService: PresenceService): void {
  bot.on("callback_query:data", async (ctx, next) => {
    const isPlaceCallback = parsePlaceCallbackData(ctx.callbackQuery.data).ok;
    if (isPlaceCallback) {
      await next();
      return;
    }
    const isOnboardingCallback = parseOnboardingCallbackData(ctx.callbackQuery.data).ok;
    if (isOnboardingCallback) {
      await next();
      return;
    }
    const fightCallback = parseFightCallbackData(ctx.callbackQuery.data);
    const yegerCallback = parseYegerCallbackData(ctx.callbackQuery.data);
    const suppressMovementNotice =
      (fightCallback.ok &&
        (fightCallback.value.type === "passage" ||
          fightCallback.value.type === "turn" ||
          fightCallback.value.type === "item" ||
          fightCallback.value.type === "gear")) ||
      (yegerCallback.ok && suppressYegerCornerMovementNotice(yegerCallback.value.type));

    const previousLocationId = await getCurrentMainMenuLocationId(ctx, presenceService);

    if (previousLocationId !== undefined) {
      callbackMainMenuLocationRefreshState.set(ctx, {
        previousLocationId,
        handled: false
      });
    }

    await next();

    if (previousLocationId === undefined) {
      return;
    }

    const refreshState = callbackMainMenuLocationRefreshState.get(ctx);

    if (!suppressMovementNotice && refreshState?.handled !== true) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, presenceService, {
        previousLocationId
      });
    }
  });
}

export async function getCallbackPreviousMainMenuLocationId(
  ctx: Context,
  presenceService: PresenceService
): Promise<string | null | undefined> {
  const refreshState = callbackMainMenuLocationRefreshState.get(ctx);

  return refreshState
    ? refreshState.previousLocationId
    : getCurrentMainMenuLocationId(ctx, presenceService);
}

export async function refreshCallbackMainMenuLocationBeforeReplies(
  ctx: Context,
  locationId: string | null,
  previousLocationId: string | null | undefined
): Promise<void> {
  const refreshState = callbackMainMenuLocationRefreshState.get(ctx);
  if (refreshState) {
    refreshState.handled = true;
  }

  if (previousLocationId === undefined) {
    return;
  }

  await refreshMainMenuLocationKeyboard(ctx, locationId, {
    previousLocationId
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
  targetLocationId: string,
  options: { text?: string | undefined } = {}
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

  await ctx.reply(options.text ?? getLocationMovementNoticeText(normalizedTargetLocationId, previousLocationId), {
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
    case PRESENCE_LOCATION_KORCHMA_YARD:
      return "Ви зайшли в задвірок корчми.";
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

function suppressYegerCornerMovementNotice(type: YegerCallback["type"]): boolean {
  return type !== "outside" && type !== "track";
}

export async function sendCurrentLocation(
  ctx: Context,
  services: BotServices,
  options: MainMenuRouteOptions = {}
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
  const requestedLocationId = getMainMenuLocationButtonPresenceId(ctx.message?.text?.trim());

  if (!telegramUserId) {
    await sendTavern(ctx, services.tavern, services.presence, "reply", {
      playerHintService: services.playerHints
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await sendTavern(ctx, services.tavern, services.presence, "reply", {
      playerHintService: services.playerHints
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "reply")) {
    return;
  }

  const locationId = normalizePresenceLocationId(requestedLocationId ?? place.locationId);
  const previousLocationId = normalizePresenceLocationId(place.locationId);

  if (
    requestedLocationId &&
    locationId !== previousLocationId &&
    locationId !== PRESENCE_LOCATION_KORCHMA_RANGER_CORNER
  ) {
    await refreshMainMenuLocationKeyboard(ctx, locationId, {
      previousLocationId
    });
  }

  if (await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, locationId, services)) {
    if (locationId !== PRESENCE_LOCATION_KORCHMA_RANGER_CORNER) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    }
    return;
  }

  await sendCurrentPresenceLocation(ctx, locationId, services, options);
  await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
}

export async function sendDailyKorchmaRoundSceneAtLocation(
  ctx: Context,
  telegramUserId: bigint,
  locationId: string,
  services: BotServices
): Promise<boolean> {
  if (!services.dailyKorchmaRound) {
    return false;
  }

  const current = await services.dailyKorchmaRound.getExistingForTelegramUser(telegramUserId);

  if (current.state !== "ready" && current.state !== "turn-in-ready") {
    return false;
  }

  const sceneIndex = current.offer.scenes.findIndex(
    (scene) =>
      scene.locationId === locationId &&
      !current.offer.completedSceneIds.includes(scene.id) &&
      current.offer.omittedSceneId !== scene.id
  );

  if (sceneIndex < 0) {
    return false;
  }

  const result = await services.dailyKorchmaRound.openScene(telegramUserId, {
    dayToken: current.offer.dayToken,
    sceneIndex
  });

  if (result.state !== "scene") {
    return false;
  }

  await markScenePresence(ctx, services.presence, {
    locationId: result.scene.locationId,
    currentRaidId: null,
    currentAdventureId: null
  });
  await ctx.reply(presentDailyKorchmaRoundScene(result), {
    parse_mode: "HTML",
    reply_markup: buildDailyKorchmaRoundSceneKeyboard(result)
  });

  return true;
}

async function sendCurrentPresenceLocation(
  ctx: Context,
  locationId: string,
  services: BotServices,
  options: MainMenuRouteOptions = {}
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
  const questMarkers = telegramUserId
    ? await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services)
    : null;

  if (locationId === PRESENCE_LOCATION_KORCHMA_FRONT) {
    await sendKorchmaFront(ctx, services.tavern, services.presence, "reply", services.yeger, {
      playerHintService: services.playerHints,
      ...(questMarkers ? { questMarkers } : {})
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_YARD) {
    await sendKorchmaYard(ctx, services.tavern, services.presence, "reply", {
      ...(questMarkers ? { questMarkers } : {})
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_HALL) {
    await sendTavern(ctx, services.tavern, services.presence, "reply", {
      playerHintService: services.playerHints,
      ...(questMarkers ? { questMarkers } : {})
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_QUEST_TABLE) {
    await sendQuestHub(ctx, buildQuestHubCommandOptions(services), "reply");
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_BAR) {
    await sendKorchmaBar(
      ctx,
      services.tavern,
      services.presence,
      "reply",
      services.cellarGrownup,
      services.fight,
      services.tavernGames,
      buildKorchmaBarOptions(services, {
        ...(questMarkers ? { questMarkers } : {})
      })
    );
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_CELLAR) {
    await sendCellarErrandRouted(ctx, services.cellarErrand, services.presence, "reply", {
      tavernRaid: services.tavern,
      ...(services.cellarGrownup ? { grownupQuest: services.cellarGrownup } : {}),
      ...(questMarkers ? { questMarkers } : {})
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_BARREL) {
    await sendTavernBarrel(ctx, services.tavern, services.presence, "reply", {
      botUsername: options.botUsername,
      partyBoss: services.partyBoss,
      partySessions: services.partySessions,
      ...(questMarkers ? { questMarkers } : {})
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_NEWS_CORNER) {
    await sendKorchmaNewsCorner(ctx, services.tavern, services.presence, "reply");
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_RANGER_CORNER) {
    await sendHuntBoard(ctx, services.yeger, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      resolveFieldKitHelp: (telegramUserId) => shouldShowYegerFieldKitHelp(telegramUserId, services),
      ...(questMarkers ? { questMarkers } : {})
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER) {
    await sendKorchmaFightingCorner(ctx, services.tavern, services.presence, "reply", {
      ...(services.duelTournaments ? { tournamentService: services.duelTournaments } : {})
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP) {
    await sendKorchmaDeepClosed(ctx, services.tavern, services.presence, "reply", {
      passageSearch: services.passageSearch
    });
    return;
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1) {
    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      passageSearch: services.passageSearch,
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

  await sendTavern(ctx, services.tavern, services.presence, "reply", {
    playerHintService: services.playerHints
  });
}
