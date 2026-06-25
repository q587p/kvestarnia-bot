import { type Bot,type Context } from "grammy";
import type {
CellarGrownupQuestAction,
CellarGrownupQuestResult
} from "../../services/cellarGrownupQuestService";
import {
PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
PRESENCE_LOCATION_KORCHMA_BAR,
PRESENCE_LOCATION_KORCHMA_BARREL,
PRESENCE_LOCATION_KORCHMA_CELLAR,
PRESENCE_LOCATION_KORCHMA_DEEP,
PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
PRESENCE_LOCATION_KORCHMA_FRONT,
PRESENCE_LOCATION_KORCHMA_HALL,
PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
PRESENCE_RAID_FRIDAY_BARREL
} from "../../services/presenceService";
import type { ShynokRoundConfirmResult } from "../../services/shynokService";
import type { BotServices } from "../botServices";
import { parseCellarCallbackData,type CellarCallback } from "../callbacks/cellarCallbackData";
import { parseMemorialCallbackData,type MemorialCallback } from "../callbacks/memorialCallbackData";
import { parsePlaceCallbackData,type PlaceCallback } from "../callbacks/placeCallbackData";
import { parseShynokCallbackData,type ShynokCallback } from "../callbacks/shynokCallbackData";
import { parseTavernCallbackData,type TavernCallback } from "../callbacks/tavernCallbackData";
import {
registerCellarCommand,
sendCellarErrandRouted
} from "../commands/cellarCommand";
import { sendFight } from "../commands/fightCommand";
import {
sendHuntBoard,
sendYegerCorner
} from "../commands/huntCommand";
import { sendNewsList } from "../commands/newsCommand";
import {
sendQuestHub
} from "../commands/questHubCommand";
import {
registerTavernCommand,
sendDuelWinnersBoard,
sendKorchmaArrivalBoard,
sendKorchmaBar,
sendKorchmaDeepClosed,
sendKorchmaFightingCorner,
sendKorchmaFront,
sendKorchmaMemorialBoard,
sendKorchmaRemortMilestoneBoard,
sendTavern,
sendTavernBarrel
} from "../commands/tavernCommand";
import { playerFromContext } from "../context";
import {
buildCellarGrownupKeyboard,
buildCellarParticipantsKeyboard,
buildCellarResultKeyboard
} from "../keyboards/cellarKeyboard";
import {
buildBackToShynokKeyboard,
buildShynokDrinkMenuKeyboard,
buildShynokDrinkPreviewKeyboard,
buildShynokDrinkResultKeyboard,
buildShynokOverviewKeyboard,
buildShynokRoundOfferNotificationKeyboard,
buildShynokRoundOfferResponseKeyboard,
buildShynokRoundPreviewKeyboard,
buildShynokRoundResultKeyboard,
buildShynokSaleSelectionKeyboard
} from "../keyboards/shynokKeyboard";
import {
buildBackToKorchmaHallKeyboard,
buildBackToTavernRaidKeyboard,
buildKorchmaBarKeyboard,
buildKorchmaRoundOfferKeyboard,
buildKorchmaRoundResultKeyboard,
buildTavernParticipantsKeyboard,
buildTavernResultKeyboard
} from "../keyboards/tavernKeyboard";
import { editPendingRaidBlockIfNeeded } from "../middleware/pendingRaidGuard";
import {
presentCellarGrownupQuest,
presentCellarGrownupResult,
presentCellarLevelLocked,
presentCellarLevelRetired,
presentCellarNoCharacter,
presentCellarResult
} from "../presenters/cellarPresenter";
import {
presentInvalidCallback
} from "../presenters/onboardingPresenter";
import { presentParticipants } from "../presenters/presencePresenter";
import {
presentShynokDrinkConfirmResult,
presentShynokDrinkMenu,
presentShynokDrinkPreview,
presentShynokGate,
presentShynokOverview,
presentShynokRoundConfirm,
presentShynokRoundOfferNotification,
presentShynokRoundOfferResponse,
presentShynokRoundPreview,
presentShynokSaleConfirm,
presentShynokSaleSelection
} from "../presenters/shynokPresenter";
import {
presentKorchmaDeepLevelLocked,
presentTavernNoCharacter,
presentTavernRaidResult,
presentTavernRoundLeaderboard,
presentTavernRoundOffer,
presentTavernRoundResult
} from "../presenters/tavernPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

import { barrelRaidCompletionScheduler } from "./barrelRaidCompletionScheduler";
import { sendLevelUpCelebration } from "./levelUp";
import {
refreshCurrentMainMenuLocationKeyboard,
sendCurrentLocation,
sendPlaceMovementNotice
} from "./mainMenu";
import {
placeCallbackToPersistentFightPassage,
sendPersistentFightPassagePreview
} from "./persistentFightNavigation";
import { buildQuestHubCommandOptions } from "./questHubOptions";
import { markScenePresence } from "./scenePresence";
import type { BotModuleDependencies } from "./types";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export function registerTavernBotModule(
  bot: Bot,
  { services }: BotModuleDependencies
): void {
  registerCellarCommand(
    bot,
    services.cellarErrand,
    services.presence,
    services.tavern,
    services.cellarGrownup
  );
  registerTavernCommand(bot, services.tavern, services.presence);

  bot.callbackQuery(/^v1:sh:/, async (ctx) => {
    const parsed = parseShynokCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleShynokCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:tavern:/, async (ctx) => {
    const parsed = parseTavernCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleTavernCallback(ctx, parsed.value, services, bot);
  });

  bot.callbackQuery(/^v1:place:/, async (ctx) => {
    const parsed = parsePlaceCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handlePlaceCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:mem:/, async (ctx) => {
    const parsed = parseMemorialCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleMemorialCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v[12]:cellar:/, async (ctx) => {
    const parsed = parseCellarCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleCellarCallback(ctx, parsed.value, services);
  });
}

async function handleShynokCallback(
  ctx: Context,
  action: ShynokCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (!services.shynok) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    await safeEditMessageText(ctx, presentShynokGate({ state: "invalid-token" }), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildBackToShynokKeyboard()
    });
    return;
  }

  if (action.type === "overview") {
    const result = await services.shynok.getOverviewForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "ready" });
    await safeEditMessageText(ctx, presentShynokOverview(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: result.state === "ready" ? buildShynokOverviewKeyboard(result) : buildBackToShynokKeyboard()
    });
    return;
  }

  if (action.type === "drinks") {
    const result = await services.shynok.getDrinkMenuForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "ready" });
    await safeEditMessageText(ctx, presentShynokDrinkMenu(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: result.state === "ready" ? buildShynokDrinkMenuKeyboard() : buildBackToShynokKeyboard()
    });
    return;
  }

  if (action.type === "drink-preview") {
    const result = await services.shynok.createSelfDrinkOrderForTelegramUser(telegramUserId, action.drinkKey);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "preview" });
    await safeEditMessageText(ctx, presentShynokDrinkPreview(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokDrinkPreviewKeyboard(result)
    });
    return;
  }

  if (action.type === "drink-confirm") {
    const result = await services.shynok.confirmSelfDrinkOrderForTelegramUser(telegramUserId, action.token);
    await safeAnswerCallbackQuery(ctx, result.state === "completed"
      ? { text: "Налито.", show_alert: false }
      : { show_alert: result.state !== "replayed" });
    await safeEditMessageText(ctx, presentShynokDrinkConfirmResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokDrinkResultKeyboard()
    });
    return;
  }

  if (action.type === "round-preview" || action.type === "barrel-round-preview") {
    if (action.type === "barrel-round-preview") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_BAR,
        currentRaidId: null,
        currentAdventureId: null
      });
    }

    const result = await services.shynok.createRoundOrderForTelegramUser(telegramUserId, action.tier);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "preview" });
    await safeEditMessageText(ctx, presentShynokRoundPreview(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokRoundPreviewKeyboard(result)
    });
    return;
  }

  if (action.type === "round-confirm") {
    const result = await services.shynok.confirmRoundOrderForTelegramUser(
      telegramUserId,
      action.token,
      action.tier
    );
    await safeAnswerCallbackQuery(ctx, result.state === "completed"
      ? { text: "Кухлі поставлено.", show_alert: false }
      : { show_alert: result.state !== "replayed" });
    if (result.state === "completed") {
      await notifyShynokRoundRecipients(ctx, result);
    }
    await safeEditMessageText(ctx, presentShynokRoundConfirm(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokRoundResultKeyboard(result)
    });
    return;
  }

  if (
    action.type === "round-accept" ||
    action.type === "round-decline" ||
    action.type === "round-replace-confirm"
  ) {
    const result = await services.shynok.respondToRoundOfferForTelegramUser(
      telegramUserId,
      action.offerId,
      action.type === "round-accept"
        ? "accept"
        : action.type === "round-decline"
          ? "decline"
          : "confirm-replacement",
      action.type === "round-replace-confirm" ? action.replacementGuard : undefined
    );
    await safeAnswerCallbackQuery(ctx, result.state === "accepted"
      ? { text: "Кухоль ваш.", show_alert: false }
      : {
          show_alert:
            result.state !== "replayed" &&
            result.state !== "declined" &&
            result.state !== "replacement-preview"
        });
    await safeEditMessageText(ctx, presentShynokRoundOfferResponse(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokRoundOfferResponseKeyboard(result)
    });
    return;
  }

  if (action.type === "sale-open") {
    const result = await services.shynok.startSaleForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "selection" });
    await safeEditMessageText(ctx, presentShynokSaleSelection(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokSaleSelectionKeyboard(result)
    });
    return;
  }

  if (
    action.type === "sale-page" ||
    action.type === "sale-add" ||
    action.type === "sale-remove" ||
    action.type === "sale-all" ||
    action.type === "sale-clear"
  ) {
    const result =
      action.type === "sale-page"
        ? await services.shynok.getSaleSelectionForTelegramUser(telegramUserId, action.token, action.page)
        : await services.shynok.updateSaleSelectionForTelegramUser(telegramUserId, {
            token: action.token,
            page: action.page,
            action:
              action.type === "sale-add"
                ? "add"
                : action.type === "sale-remove"
                  ? "remove"
                  : action.type === "sale-all"
                    ? "all"
                    : "clear",
            ...("index" in action ? { index: action.index } : {})
          });
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentShynokSaleSelection(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokSaleSelectionKeyboard(result)
    });
    return;
  }

  const result =
    action.type === "sale-cancel"
      ? await services.shynok.cancelSaleForTelegramUser(telegramUserId, action.token)
      : await services.shynok.confirmSaleForTelegramUser(telegramUserId, action.token);

  await safeAnswerCallbackQuery(ctx, result.state === "sold"
    ? { text: "Продано.", show_alert: false }
    : { show_alert: result.state !== "replayed" && result.state !== "cancelled" });
  await safeEditMessageText(ctx, presentShynokSaleConfirm(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildBackToShynokKeyboard()
  });
}

async function notifyShynokRoundRecipients(
  ctx: Context,
  result: ShynokRoundConfirmResult
): Promise<void> {
  if (result.state !== "completed") {
    return;
  }

  await Promise.allSettled(result.recipients.map((recipient) =>
    ctx.api.sendMessage(
      Number(recipient.telegramUserId),
      presentShynokRoundOfferNotification(result.character.name, recipient),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildShynokRoundOfferNotificationKeyboard(recipient.offer.id)
      }
    )
  ));
}

async function handlePlaceCallback(
  ctx: Context,
  action: PlaceCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (
    action !== "barrel" &&
    (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern))
  ) {
    return;
  }

  await safeAnswerCallbackQuery(ctx);

  if (action === "current") {
    await sendCurrentLocation(ctx, services);
    return;
  }

  if (action === "hall") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_HALL);
    await sendTavern(ctx, services.tavern, services.presence, "reply");
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "front") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_FRONT);
    await sendKorchmaFront(ctx, services.tavern, services.presence, "reply", services.yeger);
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "arrivals") {
    await sendKorchmaArrivalBoard(
      ctx,
      services.tavern,
      services.presence,
      "edit"
    );
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "memorial") {
    await sendKorchmaMemorialBoard(
      ctx,
      services.tavern,
      services.presence,
      "edit",
      services.levelMilestones,
      services.remort
    );
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "barrel") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_BARREL);
    await sendTavernBarrel(ctx, services.tavern, services.presence, "reply");
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "bar") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_BAR);
    await sendKorchmaBar(ctx, services.tavern, services.presence, "reply", services.cellarGrownup, services.fight);
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "fighting-corner") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER);
    await sendKorchmaFightingCorner(ctx, services.tavern, services.presence, "reply");
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "duel-winners") {
    if (!services.duel) {
      await safeEditMessageText(ctx, presentInvalidCallback(), HTML_MESSAGE_OPTIONS);
      return;
    }

    await sendDuelWinnersBoard(ctx, services.tavern, services.presence, services.duel, "edit");
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "ranger-corner") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_RANGER_CORNER);
    await sendHuntBoard(ctx, services.yeger, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "quest-table") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_QUEST_TABLE);
    await sendQuestHub(
      ctx,
      buildQuestHubCommandOptions(services),
      "reply"
    );
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "deep") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_DEEP);
    await sendKorchmaDeepClosed(ctx, services.tavern, services.presence, "reply");
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "deep-level1") {
    const gate =
      typeof services.fight.getFightOverviewForTelegramUser === "function"
        ? await services.fight.getFightOverviewForTelegramUser(telegramUserId)
        : await services.fight.getFightForTelegramUser(telegramUserId);

    if ("character" in gate && gate.character.level < 3) {
      await safeEditMessageText(ctx, presentKorchmaDeepLevelLocked(gate.character), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildBackToKorchmaHallKeyboard()
      });
      return;
    }

    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1);
    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: true,
      openDifficulty: true
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  const passageFight = placeCallbackToPersistentFightPassage(action);

  if (passageFight) {
    await sendPlaceMovementNotice(ctx, services.presence, passageFight.locationId);
    await sendPersistentFightPassagePreview(ctx, services, passageFight, "reply");
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "cellar") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_CELLAR);
    await sendCellarErrandRouted(
      ctx,
      services.cellarErrand,
      services.presence,
      "reply",
      {
        tavernRaid: services.tavern,
        ...(services.cellarGrownup ? { grownupQuest: services.cellarGrownup } : {})
      }
    );
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_NEWS_CORNER);
  await markScenePresence(ctx, services.presence, {
    locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
    currentRaidId: null,
    currentAdventureId: null
  });
  await sendNewsList(ctx, 0);
  await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
}

async function handleMemorialCallback(
  ctx: Context,
  action: MemorialCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern)) {
    return;
  }

  await safeAnswerCallbackQuery(ctx);

  await sendKorchmaRemortMilestoneBoard(
    ctx,
    services.tavern,
    services.presence,
    "edit",
    action.remortNumber,
    services.levelMilestones
  );
}

async function handleTavernCallback(
  ctx: Context,
  action: TavernCallback,
  services: BotServices,
  bot: Bot
): Promise<void> {
  const tavernRaidService = services.tavern;
  const yegerQuestService = services.yeger;
  const presenceService = services.presence;
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (action === "raid-news") {
    await safeAnswerCallbackQuery(ctx);
    await sendNewsList(ctx, 0, "edit", { source: "raid" });
    return;
  }

  if (action === "raid-leaderboard") {
    const result = await tavernRaidService.getRoundLeaderboardForTelegramUser(telegramUserId);

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentTavernNoCharacter());
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentTavernRoundLeaderboard(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildBackToTavernRaidKeyboard()
    });
    return;
  }

  if (action === "participants") {
    const snapshot = await presenceService.getRaidParticipantsForTelegramUser(
      telegramUserId,
      PRESENCE_RAID_FRIDAY_BARREL
    );

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentParticipants(snapshot), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildTavernParticipantsKeyboard()
    });
    return;
  }

  if (action === "ranger") {
    await safeAnswerCallbackQuery(ctx);
    await sendYegerCorner(ctx, yegerQuestService, "edit", {
      presence: presenceService,
      tavernRaid: tavernRaidService,
      requireKorchmaInterior: false
    });
    return;
  }

  if (action === "round") {
    const result = await tavernRaidService.getRoundOfferForTelegramUser(telegramUserId);

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentTavernNoCharacter());
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentTavernRoundOffer(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildKorchmaRoundOfferKeyboard(result)
    });
    return;
  }

  if (action === "round-simple" || action === "round-fine") {
    const result = await tavernRaidService.buyRoundForTelegramUser(
      telegramUserId,
      action === "round-fine" ? "fine" : "simple"
    );

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentTavernNoCharacter());
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentTavernRoundResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildKorchmaRoundResultKeyboard(result)
    });
    return;
  }

  const result = await tavernRaidService.advanceFridayBarrelRaid(telegramUserId);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentTavernNoCharacter());
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentTavernRaidResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildTavernResultKeyboard(result.state)
  });

  if (result.state === "pending-started") {
    const chatId = ctx.callbackQuery?.message?.chat.id ?? ctx.chat?.id;
    const notification = services.barrelRaidNotifications && chatId !== undefined
      ? await services.barrelRaidNotifications.upsertPendingForTelegramUser(telegramUserId, {
          chatId: BigInt(chatId),
          periodId: result.periodId,
          availableAt: result.availableAt,
          now: result.now
        })
      : null;

    barrelRaidCompletionScheduler.schedule({
      bot,
      chatId,
      telegramUserId,
      periodId: result.periodId,
      availableAt: result.availableAt,
      now: result.now,
      tavernRaidService,
      ...(services.barrelRaidNotifications && notification
        ? {
            notifications: services.barrelRaidNotifications,
            notificationId: notification.id
          }
        : {})
    });
  }

  if (result.state === "completed") {
    await sendLevelUpCelebration(ctx, result);
  }
}

async function handleCellarCallback(
  ctx: Context,
  callback: CellarCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern)) {
    return;
  }

  const lookup = await services.cellarErrand.getForTelegramUser(telegramUserId);

  if (lookup.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentCellarNoCharacter());
    return;
  }

  if (lookup.state === "level-locked") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentCellarLevelLocked(lookup), HTML_MESSAGE_OPTIONS);
    return;
  }

  if (lookup.state === "level-retired") {
    if (services.cellarGrownup) {
      if (callback.type === "grownup") {
        await handleCellarGrownupCallback(ctx, callback.action, services);
        return;
      }

      const grownup = await services.cellarGrownup.getForTelegramUser(telegramUserId);

      if (grownup.state === "no-character") {
        await safeAnswerCallbackQuery(ctx);
        await safeEditMessageText(ctx, presentCellarNoCharacter());
        return;
      }

      if (grownup.state === "too-young") {
        await safeAnswerCallbackQuery(ctx);
        await safeEditMessageText(
          ctx,
          presentCellarLevelLocked({
            state: "level-locked",
            character: grownup.character,
            requiredLevel: grownup.requiredLevel
          }),
          HTML_MESSAGE_OPTIONS
        );
        return;
      }

      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
      });
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentCellarGrownupQuest(grownup), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildCellarGrownupKeyboard(grownup.state)
      });
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentCellarLevelRetired(lookup), HTML_MESSAGE_OPTIONS);
    return;
  }

  if (callback.type === "participants") {
    const snapshot = await services.presence.getAdventureParticipantsForTelegramUser(
      telegramUserId,
      PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    );

    if (snapshot.state !== "no-character") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentParticipants(snapshot), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildCellarParticipantsKeyboard()
    });
    return;
  }

  if (callback.type === "grownup") {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await services.cellarErrand.complete(
    telegramUserId,
    callback.type === "method"
      ? { type: "method", methodId: callback.methodId }
      : { type: "legacy-action", action: callback.action }
  );

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentCellarNoCharacter());
    return;
  }

  if (result.state === "level-locked") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentCellarLevelLocked(result), HTML_MESSAGE_OPTIONS);
    return;
  }

  if (result.state === "level-retired") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentCellarLevelRetired(result), HTML_MESSAGE_OPTIONS);
    return;
  }

  await markScenePresence(ctx, services.presence, {
    locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
  });

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentCellarResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildCellarResultKeyboard(
      result.state === "insufficient-gold" || result.state === "stale" ? "ready" : result.state,
      result.character
    )
  });
  if (result.state === "completed") {
    await sendLevelUpCelebration(ctx, result);
  }
}

async function handleCellarGrownupCallback(
  ctx: Context,
  action: CellarGrownupQuestAction,
  services: BotServices
): Promise<void> {
  if (!services.cellarGrownup) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  let result: CellarGrownupQuestResult;

  if (action === "grownup-buy-seal") {
    result = await services.cellarGrownup.buySeal(telegramUserId);
  } else if (action === "grownup-roleplay") {
    result = await services.cellarGrownup.attemptRoleplay(telegramUserId);
  } else if (action === "grownup-show-seal") {
    result = await services.cellarGrownup.showSeal(telegramUserId);
  } else {
    result = await services.cellarGrownup.complete(
      telegramUserId,
      action === "grownup-turn-in" ? "turn-in" : "keep"
    );
  }

  if (result.state !== "no-character" && result.state !== "too-young") {
    await markScenePresence(ctx, services.presence, {
      locationId: action === "grownup-turn-in" ? PRESENCE_LOCATION_KORCHMA_BAR : PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: action === "grownup-turn-in" ? null : PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    });
  }

  await safeAnswerCallbackQuery(ctx);
  const grownupKeyboardState = getCellarGrownupKeyboardState(result);

  await safeEditMessageText(ctx, presentCellarGrownupResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    ...(action === "grownup-turn-in"
      ? {
          reply_markup: buildKorchmaBarKeyboard()
        }
      : grownupKeyboardState
        ? {
            reply_markup: buildCellarGrownupKeyboard(grownupKeyboardState, {
              includeKeptBottle: shouldShowCellarGrownupKeptBottleButton(result)
            })
          }
      : {})
  });

  if (result.state === "completed") {
    await sendLevelUpCelebration(ctx, result);
  }
}

function getCellarGrownupKeyboardState(
  result: CellarGrownupQuestResult
): Parameters<typeof buildCellarGrownupKeyboard>[0] | null {
  if (result.state === "seal-purchased" || result.state === "seal-already-owned") {
    return "has-seal";
  }

  if (result.state === "roleplay-cooldown" || result.state === "roleplay-failed") {
    return "roleplay-cooldown";
  }

  if (result.state === "bottle-obtained") {
    return "bottle-obtained";
  }

  if (result.state === "completed" || result.state === "already-completed") {
    return "completed";
  }

  if (result.state === "insufficient-gold" || result.state === "missing-seal" || result.state === "missing-bottle") {
    return "insufficient";
  }

  return null;
}

function shouldShowCellarGrownupKeptBottleButton(result: CellarGrownupQuestResult): boolean {
  return (
    (result.state === "completed" || result.state === "already-completed") &&
    result.ending === "keep"
  );
}
