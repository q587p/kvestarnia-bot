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
PRESENCE_LOCATION_KORCHMA_YARD,
PRESENCE_RAID_FRIDAY_BARREL
} from "../../services/presenceService";
import { getBarrelRaidPeriod } from "../../services/tavernRaidService";
import type { PresentedShynokDrinkState, ShynokRoundConfirmResult } from "../../services/shynokService";
import { isBigBarrelEligible } from "../../domain/partyBoss/partyBoss";
import type { BotServices } from "../botServices";
import { registerParsedCallbackRoute } from "../callbackRoute";
import { parseCellarCallbackData,type CellarCallback } from "../callbacks/cellarCallbackData";
import { parseDuelTournamentCallbackData,type DuelTournamentCallback } from "../callbacks/duelTournamentCallbackData";
import { parseMemorialCallbackData,type MemorialCallback } from "../callbacks/memorialCallbackData";
import { parseLatestEventsCallbackData,type LatestEventsCallback } from "../callbacks/latestEventsCallbackData";
import { parsePlaceCallbackData,type PlaceCallback } from "../callbacks/placeCallbackData";
import { parseShynokCallbackData,type ShynokCallback } from "../callbacks/shynokCallbackData";
import { parseTavernCallbackData,type TavernCallback } from "../callbacks/tavernCallbackData";
import {
registerCellarCommand,
sendCellarErrandRouted
} from "../commands/cellarCommand";
import { registerLatestEventsCommand, sendLatestEvents } from "../commands/latestEventsCommand";
import { sendFight } from "../commands/fightCommand";
import {
sendHuntBoard,
sendYegerCorner
} from "../commands/huntCommand";
import { shouldShowYegerFieldKitHelp } from "../commands/yegerFieldKitHelp";
import { sendNewsList } from "../commands/newsCommand";
import {
sendQuestHub
} from "../commands/questHubCommand";
import {
registerTavernCommand,
sendDuelTournamentBoard,
sendDuelWinnersBoard,
sendKorchmaArrivalBoard,
sendKorchmaBar,
sendKorchmaDeepClosed,
sendKorchmaFightingCorner,
sendKorchmaFront,
sendKorchmaNewsCorner,
sendKorchmaYard,
sendKorchmaMemorialBoard,
sendKorchmaRemortMilestoneBoard,
sendTavern,
sendTavernBarrel
} from "../commands/tavernCommand";
import { playerFromContext } from "../context";
import { buildQuestMarkerSnapshotForTelegramUser } from "../questMarkerSnapshot";
import { getTavernGameButtonOptions } from "../tavernGameButtonOptions";
import {
buildCellarGrownupKeyboard,
buildCellarMethodHelpKeyboard,
buildCellarParticipantsKeyboard,
buildCellarResultKeyboard
} from "../keyboards/cellarKeyboard";
import {
buildBardPerformanceResponseKeyboard,
buildBardPerformanceRespondResultKeyboard,
buildBackToShynokGamesKeyboard,
buildBackToDicePokerKeyboard,
buildBackToCurrentPlaceKeyboard,
buildBackToShynokKeyboard,
buildShynokDrinkMenuKeyboard,
buildShynokDrinkPreviewKeyboard,
buildShynokDrinkResultKeyboard,
buildShynokDicePokerStakeKeyboard,
buildShynokDoppelgangerMenuKeyboard,
buildShynokDoppelgangerStakeKeyboard,
buildShynokGameHubKeyboard,
buildShynokGameInviteShareKeyboard,
buildShynokGameRematchInviteKeyboard,
buildShynokGameRulesKeyboard,
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
buildDuelTournamentKeyboard,
buildKorchmaBarKeyboard,
buildKorchmaRoundOfferKeyboard,
buildKorchmaRoundResultKeyboard,
buildTavernParticipantsKeyboard,
buildTavernResultKeyboard
} from "../keyboards/tavernKeyboard";
import { editPendingRaidBlockIfNeeded } from "../middleware/pendingRaidGuard";
import {
presentAchievementUnlockNotification
} from "../presenters/achievementPresenter";
import {
presentCellarCooldown,
presentCellarGrownupQuest,
presentCellarGrownupResult,
presentCellarLevelLocked,
presentCellarLevelRetired,
presentCellarMethodHelp,
presentCellarNoCharacter,
presentCellarResult,
presentCellarStart
} from "../presenters/cellarPresenter";
import {
presentDevGrantDisabled,
presentDevGrantNoCharacter
} from "../presenters/devGrantPresenter";
import {
presentInvalidCallback
} from "../presenters/onboardingPresenter";
import { presentParticipants } from "../presenters/presencePresenter";
import { escapeHtml } from "../presenters/telegramHtml";
import {
presentBardPerformanceAudienceNotification,
presentBardPerformancePerformerFeedback,
presentBardPerformanceResponseResult,
presentBardPerformanceStartResult,
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
presentTavernGameActionResult,
presentDoppelgangerGameMenu,
presentDoppelgangerStakeMenu,
presentDicePokerRules,
presentDicePokerStakeMenu,
presentTavernGameHub,
presentTavernGameInviteShare,
presentTavernGameLeaderboard,
presentTavernGameRules,
presentTavernGameSession,
getInitialTavernGameInviteTemplateIndex,
getNextTavernGameInviteTemplateIndex
} from "../presenters/tavernGamePresenter";
import {
presentKorchmaDeepLevelLocked,
presentDuelTournamentBoard,
presentTavernNoCharacter,
presentTavernRaidResult,
presentTavernRoundLeaderboard,
presentTavernRoundOffer,
presentTavernRoundResult
} from "../presenters/tavernPresenter";
import { presentBigBarrelApproachNotice } from "../presenters/partySessionPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import {
  buildTavernGameActionKeyboard,
  buildTavernGameInviteUrl,
  notifyTavernGameParticipants
} from "../tavernGameNotifications";

import { barrelRaidCompletionScheduler } from "./barrelRaidCompletionScheduler";
import { sendLevelUpCelebration } from "./levelUp";
import {
refreshCurrentMainMenuLocationKeyboard,
sendDailyKorchmaRoundSceneAtLocation,
sendCurrentLocation,
sendPlaceMovementNotice
} from "./mainMenu";
import {
guardActivePassageSearchCommand,
showActivePassageSearchIfNeeded
} from "./passageSearchGuard";
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
  { services, options }: BotModuleDependencies
): void {
  bot.command(["tavern", "raid", "cellar"], async (ctx, next) => {
    await guardActivePassageSearchCommand(ctx, services, next);
  });
  registerCellarCommand(
    bot,
    services.cellarErrand,
    services.presence,
    services.tavern,
    services.cellarGrownup
  );
  registerTavernCommand(bot, services.tavern, services.presence, {
    botUsername: options.botUsername,
    partyBoss: services.partyBoss,
    partySessions: services.partySessions,
    playerHintService: services.playerHints,
    resolveQuestMarkers: (telegramUserId) => buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services)
  });
  registerLatestEventsCommand(bot, services.activityEvents, services.hero);
  registerBardPerformanceDevResetHandler(bot, services);
  registerPassageSearchDevResetHandler(bot, services);
  if (services.devGrant?.isEnabled()) {
    registerTavernGamesDevResetHandler(bot, services);
  }

  registerParsedCallbackRoute(bot, /^v1:sh:/, parseShynokCallbackData, async (ctx, action) => {
    await handleShynokCallback(ctx, action, services, {
      botUsername: options.botUsername
    });
  });

  registerParsedCallbackRoute(bot, /^v1:tavern:/, parseTavernCallbackData, async (ctx, action) => {
    await handleTavernCallback(ctx, action, services, bot, {
      botUsername: options.botUsername
    });
  });

  registerParsedCallbackRoute(bot, /^v1:place:/, parsePlaceCallbackData, async (ctx, action) => {
    await handlePlaceCallback(ctx, action, services, {
      botUsername: options.botUsername
    });
  });

  registerParsedCallbackRoute(bot, /^v1:tour:/, parseDuelTournamentCallbackData, async (ctx, action) => {
    await handleDuelTournamentCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v1:mem:/, parseMemorialCallbackData, async (ctx, action) => {
    await handleMemorialCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v1:ev:/, parseLatestEventsCallbackData, async (ctx, action) => {
    await handleLatestEventsCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v[12]:cellar:/, parseCellarCallbackData, async (ctx, action) => {
    await handleCellarCallback(ctx, action, services);
  });
}

async function handleDuelTournamentCallback(
  ctx: Context,
  action: DuelTournamentCallback,
  services: BotServices
): Promise<void> {
  if (!services.duelTournaments) {
    await safeEditMessageText(ctx, presentInvalidCallback(), HTML_MESSAGE_OPTIONS);
    return;
  }

  if (action.action === "open") {
    await sendDuelTournamentBoard(
      ctx,
      services.tavern,
      services.presence,
      services.duelTournaments,
      action.period,
      "edit"
    );
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  const player = playerFromContext(ctx.from);
  if (!player) {
    await safeEditMessageText(ctx, presentInvalidCallback(), HTML_MESSAGE_OPTIONS);
    return;
  }

  const result = await services.duelTournaments.claimRewardForTelegramUser(
    player.telegramUserId,
    action.period,
    action.periodKey
  );

  if (result.state === "no-character") {
    await safeEditMessageText(ctx, presentTavernNoCharacter(), HTML_MESSAGE_OPTIONS);
    return;
  }

  if (result.state === "invalid-period") {
    await safeEditMessageText(ctx, presentInvalidCallback(), HTML_MESSAGE_OPTIONS);
    return;
  }

  await safeEditMessageText(ctx, presentDuelTournamentBoard(result.board, result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildDuelTournamentKeyboard({
      period: action.period,
      claim: result.board.claim
    })
  });
  await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
}

async function handleLatestEventsCallback(
  ctx: Context,
  action: LatestEventsCallback,
  services: BotServices
): Promise<void> {
  await safeAnswerCallbackQuery(ctx);
  await sendLatestEvents(ctx, services.activityEvents, "edit", {
    filter: action.filter,
    page: action.page,
    achievementTracker: services.hero
  });
}

async function handleShynokCallback(
  ctx: Context,
  action: ShynokCallback,
  services: BotServices,
  options: { botUsername?: string | undefined } = {}
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

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  const questMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);
  const shynokNavigationOptions = {
    ...(questMarkers ? { questMarkers } : {})
  };

  if (action.type === "overview") {
    const result = await services.shynok.getOverviewForTelegramUser(telegramUserId);
    const tavernGameOptions = await getTavernGameButtonOptions(services.tavernGames);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "ready" });
    await safeEditMessageText(ctx, presentShynokOverview(result, { tavernGames: tavernGameOptions.tavernGames }), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: result.state === "ready"
        ? buildShynokOverviewKeyboard(result, { ...tavernGameOptions, ...shynokNavigationOptions })
        : buildBackToShynokKeyboard(shynokNavigationOptions)
    });
    return;
  }

  if (action.type === "games") {
    if (!services.tavernGames) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const result = await services.tavernGames.getHub(telegramUserId);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "ready" });
    await safeEditMessageText(ctx, presentTavernGameHub(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokGameHubKeyboard(result, shynokNavigationOptions)
    });
    return;
  }

  if (action.type === "game-doppelganger-menu") {
    if (!services.tavernGames) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }
    if (!services.tavernGames.isDoppelgangerAtShynok()) {
      await safeAnswerCallbackQuery(ctx, { show_alert: true });
      await safeEditMessageText(ctx, presentTavernGameActionResult({
        state: "blocked",
        reason: "doppelganger-at-fighting-corner"
      }), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildBackToShynokGamesKeyboard()
      });
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentDoppelgangerGameMenu(services.tavernGames.getMaxStake()), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokDoppelgangerMenuKeyboard({
        tavleiEnabled: services.tavernGames.isTavleiEnabled(),
        kostiEnabled: services.tavernGames.isKostiEnabled()
      })
    });
    return;
  }

  if (action.type === "game-doppelganger-mode") {
    if (!services.tavernGames) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }
    if (!services.tavernGames.isDoppelgangerAtShynok()) {
      await safeAnswerCallbackQuery(ctx, { show_alert: true });
      await safeEditMessageText(ctx, presentTavernGameActionResult({
        state: "blocked",
        reason: "doppelganger-at-fighting-corner"
      }), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildBackToShynokGamesKeyboard()
      });
      return;
    }

    const hub = await services.tavernGames.getHub(telegramUserId);

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(
      ctx,
      presentDoppelgangerStakeMenu(
        action.gameKey,
        services.tavernGames.getMaxStake(),
        hub.state === "ready" ? hub.character?.gold : undefined
      ),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildShynokDoppelgangerStakeKeyboard(action.gameKey, services.tavernGames.getMaxStake())
      }
    );
    return;
  }

  if (action.type === "game-leaderboard") {
    if (!services.tavernGames) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const result = await services.tavernGames.getLeaderboard();
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "ready" });
    await safeEditMessageText(ctx, presentTavernGameLeaderboard(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildBackToShynokGamesKeyboard()
    });
    return;
  }

  if (action.type === "game-rules") {
    if (!services.tavernGames) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const enabled = action.gameKey === "tavlei"
      ? services.tavernGames.isTavleiEnabled()
      : services.tavernGames.isKostiEnabled();
    if (!enabled) {
      await safeAnswerCallbackQuery(ctx, { show_alert: true });
      await safeEditMessageText(ctx, presentTavernGameActionResult({
        state: services.tavernGames.isEnabled() ? "game-disabled" : "disabled",
        gameKey: action.gameKey
      }), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildBackToShynokKeyboard(shynokNavigationOptions)
      });
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(
      ctx,
      presentTavernGameRules(action.gameKey, services.tavernGames.getMaxStake()),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildShynokGameRulesKeyboard(action.gameKey, services.tavernGames.getMaxStake())
      }
    );
    return;
  }

  if (action.type === "game-dice-poker-rules") {
    if (!services.tavernGames) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentDicePokerRules(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: action.token
        ? buildBackToDicePokerKeyboard(action.token)
        : buildShynokGameRulesKeyboard("kosti", services.tavernGames.getMaxStake())
    });
    return;
  }

  if (action.type === "game-dice-poker-mode") {
    if (!services.tavernGames) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentDicePokerStakeMenu(action.mode, services.tavernGames.getMaxStake()), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokDicePokerStakeKeyboard(action.mode, services.tavernGames.getMaxStake())
    });
    return;
  }

  if (action.type === "game-share" || action.type === "game-invite") {
    await handleTavernGameInviteShare(ctx, action, services, telegramUserId, options);
    return;
  }

  if (
    action.type === "game-create" ||
    action.type === "game-dice-poker-create" ||
    action.type === "game-dice-poker-doppelganger-create" ||
    action.type === "game-tavlei-doppelganger-create" ||
    action.type === "game-dice-poker-view" ||
    action.type === "game-dice-poker-toggle" ||
    action.type === "game-dice-poker-roll" ||
    action.type === "game-dice-poker-score" ||
    action.type === "game-dice-poker-cancel" ||
    action.type === "game-rematch" ||
    action.type === "game-join" ||
    action.type === "game-readiness" ||
    action.type === "game-cancel" ||
    action.type === "game-tavlei-decision" ||
    action.type === "game-kosti-decision" ||
    action.type === "game-resolve"
  ) {
    if (!services.tavernGames) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    let result: Parameters<typeof presentTavernGameActionResult>[0] & {
      achievementNotifications?: Array<{
        telegramUserId: bigint;
        unlocks: Parameters<typeof presentAchievementUnlockNotification>[0];
      }>;
      rematchInvitees?: Array<{
        telegramUserId: bigint;
        displayName: string;
      }>;
    };

    if (action.type === "game-create") {
      result = action.gameKey === "kosti"
        ? await services.tavernGames.createDicePokerForTelegramUser(telegramUserId, "quick", action.stakeGold)
        : await services.tavernGames.createForTelegramUser(telegramUserId, action.gameKey, action.stakeGold);
    } else if (action.type === "game-dice-poker-create") {
      result = await services.tavernGames.createDicePokerForTelegramUser(telegramUserId, action.mode, action.stakeGold);
    } else if (action.type === "game-dice-poker-doppelganger-create") {
      result = await services.tavernGames.createDicePokerWithDoppelgangerForTelegramUser(
        telegramUserId,
        action.mode,
        action.stakeGold
      );
    } else if (action.type === "game-tavlei-doppelganger-create") {
      result = await services.tavernGames.createTavleiWithDoppelgangerForTelegramUser(
        telegramUserId,
        action.stakeGold
      );
    } else if (action.type === "game-dice-poker-view") {
      result = await services.tavernGames.viewDicePokerForTelegramUser(telegramUserId, action.token);
    } else if (action.type === "game-dice-poker-toggle") {
      result = await services.tavernGames.toggleDicePokerDieForTelegramUser(telegramUserId, action.token, action.index);
    } else if (action.type === "game-dice-poker-roll") {
      result = await services.tavernGames.rollDicePokerForTelegramUser(telegramUserId, action.token);
    } else if (action.type === "game-dice-poker-score") {
      result = await services.tavernGames.scoreScorecardCategoryForTelegramUser(
        telegramUserId,
        action.token,
        action.category
      );
    } else if (action.type === "game-dice-poker-cancel") {
      result = await services.tavernGames.cancelDicePokerForTelegramUser(telegramUserId, action.token);
    } else if (action.type === "game-rematch") {
      result = await services.tavernGames.createRematchForTelegramUser(telegramUserId, action.token);
    } else if (action.type === "game-join") {
      result = await services.tavernGames.joinByTokenForTelegramUser(telegramUserId, action.token);
    } else if (action.type === "game-readiness") {
      result = await services.tavernGames.setReadinessForTelegramUser(
        telegramUserId,
        action.token,
        action.readiness
      );
    } else if (action.type === "game-cancel") {
      result = await services.tavernGames.cancelForTelegramUser(telegramUserId, action.token);
    } else if (action.type === "game-tavlei-decision") {
      result = await services.tavernGames.submitTavleiDecisionForTelegramUser(telegramUserId, action.token, action.tactic);
    } else if (action.type === "game-kosti-decision") {
      result = await services.tavernGames.submitKostiDecisionForTelegramUser(
        telegramUserId,
        action.token,
        action.style,
        action.sign
      );
    } else {
      result = await services.tavernGames.resolveKostiForTelegramUser(telegramUserId, action.token);
    }

    await safeAnswerCallbackQuery(ctx, {
      show_alert: ![
        "created",
        "joined",
        "decided",
        "resolved",
        "cancelled",
        "replayed",
        "already-joined",
        "already-set",
        "updated",
        "started",
        "saved",
        "completed"
      ].includes(result.state)
    });
    await safeEditMessageText(ctx, presentTavernGameActionResult({ ...result, viewerTelegramUserId: telegramUserId }), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildTavernGameActionKeyboard(result, telegramUserId, {
        ...shynokNavigationOptions,
        inviteUrl: result.session ? buildTavernGameInviteUrl(options.botUsername, result.session.token) : null
      })
    });
    await notifyTavernGameRematchInvitees(ctx, result, telegramUserId);
    await notifyTavernGameParticipants(ctx, result, telegramUserId, options);
    await notifyTavernGameAchievements(ctx, result);
    return;
  }

  if (action.type === "drinks") {
    const result = await services.shynok.getDrinkMenuForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "ready" });
    await safeEditMessageText(ctx, presentShynokDrinkMenu(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: result.state === "ready" ? buildShynokDrinkMenuKeyboard() : buildBackToShynokKeyboard(shynokNavigationOptions)
    });
    return;
  }

  if (action.type === "bard-performance-start") {
    if (!services.bardPerformance) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const result = await services.bardPerformance.startForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx, result.state === "started"
      ? { text: "Виступ почався.", show_alert: false }
      : { show_alert: result.state !== "live" });
    if (result.state === "started") {
      await notifyBardPerformanceAudience(ctx, result.character.name, result.audience);
    }
    await safeEditMessageText(ctx, presentBardPerformanceStartResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildBackToCurrentPlaceKeyboard()
    });
    return;
  }

  if (
    action.type === "bard-performance-applaud" ||
    action.type === "bard-performance-decline" ||
    action.type === "bard-performance-tip"
  ) {
    if (!services.bardPerformance) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const result = await services.bardPerformance.respondForTelegramUser(telegramUserId, {
      reactionId: action.reactionId,
      action: action.type === "bard-performance-applaud"
        ? "applaud"
        : action.type === "bard-performance-decline"
          ? "decline"
          : "tip",
      ...(action.type === "bard-performance-tip" ? { tipGold: action.tipGold } : {})
    });
    await safeAnswerCallbackQuery(ctx, result.state === "applauded" || result.state === "tipped"
      ? { text: result.state === "tipped" ? "Чайові перекинуто." : "Оплески зараховано.", show_alert: false }
      : { show_alert: result.state !== "declined" && result.state !== "replayed" });
    const performerFeedback = presentBardPerformancePerformerFeedback(result);
    if (performerFeedback && "performerTelegramUserId" in result) {
      await ctx.api.sendMessage(Number(result.performerTelegramUserId), performerFeedback, HTML_MESSAGE_OPTIONS)
        .catch(() => undefined);
    }
    await safeEditMessageText(ctx, presentBardPerformanceResponseResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildBardPerformanceRespondResultKeyboard(result)
    });
    return;
  }

  if (action.type === "drink-preview") {
    const result = await services.shynok.createSelfDrinkOrderForTelegramUser(telegramUserId, action.drinkKey);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "preview" });
    await safeEditMessageText(ctx, presentShynokDrinkPreview(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokDrinkPreviewKeyboard(result, shynokNavigationOptions)
    });
    return;
  }

  if (action.type === "drink-confirm") {
    const result = await services.shynok.confirmSelfDrinkOrderForTelegramUser(telegramUserId, action.token);
    let drinkResultNavigationOptions = shynokNavigationOptions;
    if (result.state === "completed" && isBeerDrinkState(result.drink)) {
      await services.barrelBeerTutorial?.markBeerDrunkForTelegramUser(telegramUserId);
      const updatedQuestMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);
      drinkResultNavigationOptions = {
        ...(updatedQuestMarkers ? { questMarkers: updatedQuestMarkers } : {})
      };
    }
    await safeAnswerCallbackQuery(ctx, result.state === "completed"
      ? { text: "Налито.", show_alert: false }
      : { show_alert: result.state !== "replayed" });
    await safeEditMessageText(ctx, presentShynokDrinkConfirmResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokDrinkResultKeyboard(drinkResultNavigationOptions)
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
      reply_markup: buildShynokRoundPreviewKeyboard(result, shynokNavigationOptions)
    });
    return;
  }

  if (action.type === "round-confirm") {
    const result = await services.shynok.confirmRoundOrderForTelegramUser(
      telegramUserId,
      action.token,
      action.tier
    );
    let roundResultNavigationOptions = shynokNavigationOptions;
    if (result.state === "completed") {
      await services.barrelBeerTutorial?.markBeerRoundOfferedForTelegramUser(telegramUserId);
      const updatedQuestMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);
      roundResultNavigationOptions = {
        ...(updatedQuestMarkers ? { questMarkers: updatedQuestMarkers } : {})
      };
    }
    await safeAnswerCallbackQuery(ctx, result.state === "completed"
      ? { text: "Кухлі поставлено.", show_alert: false }
      : { show_alert: result.state !== "replayed" });
    if (result.state === "completed") {
      await notifyShynokRoundRecipients(ctx, result);
    }
    await safeEditMessageText(ctx, presentShynokRoundConfirm(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokRoundResultKeyboard(result, roundResultNavigationOptions)
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
    if (result.state === "accepted" && isBeerDrinkState(result.drink)) {
      await services.barrelBeerTutorial?.markBeerDrunkForTelegramUser(telegramUserId);
    }
    let roundOfferNavigationOptions = shynokNavigationOptions;
    if (result.state === "accepted" && isBeerDrinkState(result.drink)) {
      const updatedQuestMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);
      roundOfferNavigationOptions = {
        ...(updatedQuestMarkers ? { questMarkers: updatedQuestMarkers } : {})
      };
    }
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
      reply_markup: buildShynokRoundOfferResponseKeyboard(result, roundOfferNavigationOptions)
    });
    return;
  }

  if (action.type === "sale-open") {
    const result = await services.shynok.startSaleForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "selection" });
    await safeEditMessageText(ctx, presentShynokSaleSelection(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildShynokSaleSelectionKeyboard(result, shynokNavigationOptions)
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
      reply_markup: buildShynokSaleSelectionKeyboard(result, shynokNavigationOptions)
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
    reply_markup: buildBackToShynokKeyboard(shynokNavigationOptions)
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

async function notifyTavernGameAchievements(
  ctx: Context,
  result: Parameters<typeof presentTavernGameActionResult>[0] & {
    achievementNotifications?: Array<{
      telegramUserId: bigint;
      unlocks: Parameters<typeof presentAchievementUnlockNotification>[0];
    }>;
  }
): Promise<void> {
  if (!result.achievementNotifications) {
    return;
  }

  await Promise.allSettled(result.achievementNotifications.map((notification) => {
    const text = presentAchievementUnlockNotification(notification.unlocks);

    return text
      ? ctx.api.sendMessage(Number(notification.telegramUserId), text, HTML_MESSAGE_OPTIONS)
      : Promise.resolve(undefined);
  }));
}

async function handleTavernGameInviteShare(
  ctx: Context,
  action: Extract<ShynokCallback, { type: "game-share" | "game-invite" }>,
  services: BotServices,
  telegramUserId: bigint,
  options: { botUsername?: string | undefined } = {}
): Promise<void> {
  if (!services.tavernGames) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await services.tavernGames.getInviteViewForTelegramUser(telegramUserId, action.token);
  if (result.state !== "ready") {
    await safeAnswerCallbackQuery(ctx, {
      text: result.state === "not-creator"
        ? "Запрошенням керує той, хто відкрив стіл."
        : "Цей стіл уже не редагує запрошення."
    });
    return;
  }

  const inviteUrl = buildTavernGameInviteUrl(options.botUsername, result.session.token);
  if (!inviteUrl) {
    await safeAnswerCallbackQuery(ctx, { text: "Посилання ще не зібралося: бот не знає свій username." });
    return;
  }

  const templateIndex = action.type === "game-share"
    ? getInitialTavernGameInviteTemplateIndex(result.session.token)
    : getNextTavernGameInviteTemplateIndex(result.session.token, action.templateIndex);
  const text = presentTavernGameInviteShare(result.session, inviteUrl, { templateIndex });
  const replyOptions = {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildShynokGameInviteShareKeyboard(result.session.token, templateIndex)
  };

  await safeAnswerCallbackQuery(ctx);
  if (action.type === "game-share") {
    await ctx.reply(text, replyOptions);
    return;
  }

  await safeEditMessageText(ctx, text, replyOptions);
}

async function notifyTavernGameRematchInvitees(
  ctx: Context,
  result: Parameters<typeof presentTavernGameActionResult>[0] & {
    rematchInvitees?: Array<{
      telegramUserId: bigint;
      displayName: string;
    }>;
  },
  actorTelegramUserId: bigint
): Promise<void> {
  if (result.state !== "created" || !result.session || !result.rematchInvitees?.length) {
    return;
  }

  const session = result.session;

  await Promise.allSettled(result.rematchInvitees
    .filter((invitee) => invitee.telegramUserId !== actorTelegramUserId)
    .map((invitee) =>
      ctx.api.sendMessage(
        Number(invitee.telegramUserId),
        presentTavernGameRematchInvite(session),
        {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildShynokGameRematchInviteKeyboard(session.token)
        }
      )
    ));
}

function presentTavernGameRematchInvite(
  session: Parameters<typeof presentTavernGameActionResult>[0]["session"]
): string {
  if (!session) {
    return "🔁 Реванш уже на столі.";
  }

  return [
    "🔁 Реванш?",
    "",
    `${escapeHtml(session.creator.name)} відкрив новий стіл після вашої партії.`,
    "",
    presentTavernGameSession(session)
  ].join("\n");
}

async function notifyBardPerformanceAudience(
  ctx: Context,
  performerName: string,
  audience: Array<{
    telegramUserId: bigint;
    name: string;
    reaction: { id: string; audienceName: string; status: string; tipGold: number; expiresAt: Date };
  }>
): Promise<void> {
  await Promise.allSettled(audience.map((notice) =>
    ctx.api.sendMessage(
      Number(notice.telegramUserId),
      presentBardPerformanceAudienceNotification(performerName, notice),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildBardPerformanceResponseKeyboard(notice.reaction.id)
      }
    )
  ));
}

function registerBardPerformanceDevResetHandler(bot: Bot, services: BotServices): void {
  bot.command("dev_reset_bard_performance", async (ctx) => {
    if (!services.devGrant?.isEnabled()) {
      await ctx.reply(presentDevGrantDisabled());
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (!telegramUserId) {
      await ctx.reply(presentDevGrantNoCharacter());
      return;
    }

    if (!services.bardPerformance) {
      await ctx.reply("Dev-скидання бардівського виступу недоступне.");
      return;
    }

    const result = await services.bardPerformance.resetForDev(telegramUserId);
    if (result.state === "no-character") {
      await ctx.reply(presentDevGrantNoCharacter());
      return;
    }

    await ctx.reply(`🎶 Бардівський cooldown скинуто локально. Прибрано записів: ${result.deleted}.`);
  });
}

function registerPassageSearchDevResetHandler(bot: Bot, services: BotServices): void {
  bot.command("dev_reset_passage_search", async (ctx) => {
    if (!services.devGrant?.isEnabled()) {
      await ctx.reply(presentDevGrantDisabled());
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (!telegramUserId) {
      await ctx.reply(presentDevGrantNoCharacter());
      return;
    }

    if (!services.passageSearch) {
      await ctx.reply("Dev-скидання пошуку в проходах недоступне.");
      return;
    }

    const result = await services.passageSearch.devReset(telegramUserId);
    if (result.state === "no-character") {
      await ctx.reply(presentDevGrantNoCharacter());
      return;
    }

    if (result.state === "disabled") {
      await ctx.reply("Dev-скидання пошуку в проходах недоступне.");
      return;
    }

    await ctx.reply(`🔎 Пошук у проходах скинуто локально. Збито пошуків: ${result.actions}. Cooldown-ів прибрано: ${result.cooldowns}.`);
  });
}

function registerTavernGamesDevResetHandler(bot: Bot, services: BotServices): void {
  bot.command("dev_reset_tavern_games", async (ctx) => {
    if (!services.devGrant?.isEnabled()) {
      await ctx.reply(presentDevGrantDisabled());
      return;
    }

    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (!telegramUserId) {
      await ctx.reply(presentDevGrantNoCharacter());
      return;
    }

    if (!services.tavernGames) {
      await ctx.reply("Dev-скидання ігор за столом недоступне.");
      return;
    }

    const result = await services.tavernGames.resetCreateCooldownForDev(telegramUserId);
    if (result.state === "no-character") {
      await ctx.reply(presentDevGrantNoCharacter());
      return;
    }
    if (result.state === "disabled") {
      await ctx.reply("Dev-скидання ігор за столом недоступне.");
      return;
    }

    await ctx.reply(`🎲 Столи вже без паузи. Скидати нічого; оновлено столів: ${result.updated}.`);
  });
}

async function handlePlaceCallback(
  ctx: Context,
  action: PlaceCallback,
  services: BotServices,
  options: { botUsername?: string | undefined } = {}
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  if (
    action !== "barrel" &&
    (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern))
  ) {
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  const questMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);

  if (action === "current") {
    await sendCurrentLocation(ctx, services);
    return;
  }

  if (action === "hall") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_HALL);
    if (await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_HALL, services)) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await sendTavern(ctx, services.tavern, services.presence, "reply", {
      playerHintService: services.playerHints,
      ...(questMarkers ? { questMarkers } : {})
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "front") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_FRONT);
    await sendKorchmaFront(ctx, services.tavern, services.presence, "reply", services.yeger, {
      playerHintService: services.playerHints,
      ...(questMarkers ? { questMarkers } : {})
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "yard") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_YARD);
    if (await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_YARD, services)) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await sendKorchmaYard(ctx, services.tavern, services.presence, "reply", {
      ...(questMarkers ? { questMarkers } : {})
    });
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
    await sendBarrelPlaceMovementNotice(ctx, telegramUserId, services);
    await services.barrelBeerTutorial?.markVisitedBarrelForTelegramUser(telegramUserId);
    if (await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_BARREL, services)) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await sendTavernBarrel(ctx, services.tavern, services.presence, "reply", {
      botUsername: options.botUsername,
      partyBoss: services.partyBoss,
      partySessions: services.partySessions,
      ...(questMarkers ? { questMarkers } : {})
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "bar") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_BAR);
    if (await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_BAR, services)) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await sendKorchmaBar(
      ctx,
      services.tavern,
      services.presence,
      "reply",
      services.cellarGrownup,
      services.fight,
      services.tavernGames,
      {
        ...(questMarkers ? { questMarkers } : {})
      }
    );
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "fighting-corner") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER);
    if (
      await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER, services)
    ) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await sendKorchmaFightingCorner(ctx, services.tavern, services.presence, "reply", {
      ...(questMarkers ? { questMarkers } : {})
    });
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
    if (
      await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_RANGER_CORNER, services)
    ) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await sendHuntBoard(ctx, services.yeger, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      ...(questMarkers ? { questMarkers } : {})
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "quest-table") {
    await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_QUEST_TABLE);
    if (
      await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_QUEST_TABLE, services)
    ) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: null
    });
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
    if (await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_DEEP, services)) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await sendKorchmaDeepClosed(ctx, services.tavern, services.presence, "reply", {
      passageSearch: services.passageSearch
    });
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
    if (
      await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1, services)
    ) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      passageSearch: services.passageSearch,
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
    if (await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_CELLAR, services)) {
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }
    await sendCellarErrandRouted(
      ctx,
      services.cellarErrand,
      services.presence,
      "reply",
      {
        tavernRaid: services.tavern,
        ...(services.cellarGrownup ? { grownupQuest: services.cellarGrownup } : {}),
        ...(questMarkers ? { questMarkers } : {})
      }
    );
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_NEWS_CORNER);
  if (await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_NEWS_CORNER, services)) {
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }
  await sendKorchmaNewsCorner(ctx, services.tavern, services.presence, "reply");
  await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
}

async function sendBarrelPlaceMovementNotice(
  ctx: Context,
  telegramUserId: bigint,
  services: BotServices
): Promise<void> {
  const text = await getBigBarrelApproachNoticeForTelegramUser(telegramUserId, services);

  await sendPlaceMovementNotice(ctx, services.presence, PRESENCE_LOCATION_KORCHMA_BARREL, {
    ...(text ? { text } : {})
  });
}

async function getBigBarrelApproachNoticeForTelegramUser(
  telegramUserId: bigint,
  services: BotServices
): Promise<string | null> {
  if (!services.partySessions?.isBigBarrelBrotherEnabled()) {
    return null;
  }

  const result = await services.tavern.getTavernForTelegramUser(telegramUserId);
  if (
    result.state !== "ready" ||
    !isBigBarrelEligible(result.character.level, result.character.remortCount)
  ) {
    return null;
  }

  const period = getBarrelRaidPeriod(new Date());

  return presentBigBarrelApproachNotice(`${telegramUserId.toString()}:${period.id}`);
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
  bot: Bot,
  options: { botUsername?: string | undefined } = {}
): Promise<void> {
  const tavernRaidService = services.tavern;
  const yegerQuestService = services.yeger;
  const presenceService = services.presence;
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
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
    if (
      await sendDailyKorchmaRoundSceneAtLocation(ctx, telegramUserId, PRESENCE_LOCATION_KORCHMA_RANGER_CORNER, services)
    ) {
      return;
    }
    const questMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);
    await sendYegerCorner(ctx, yegerQuestService, "edit", {
      presence: presenceService,
      tavernRaid: tavernRaidService,
      requireKorchmaInterior: false,
      resolveFieldKitHelp: (telegramUserId) => shouldShowYegerFieldKitHelp(telegramUserId, services),
      ...(questMarkers ? { questMarkers } : {})
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

    if (result.state === "simple-round" || result.state === "fine-round") {
      await services.barrelBeerTutorial?.markBeerRoundOfferedForTelegramUser(telegramUserId);
    }
    const roundResultQuestMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);

    await safeAnswerCallbackQuery(ctx);
    const tavernGameOptions = await getTavernGameButtonOptions(services.tavernGames);
    await safeEditMessageText(ctx, presentTavernRoundResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildKorchmaRoundResultKeyboard(result, {
        ...tavernGameOptions,
        ...(roundResultQuestMarkers ? { questMarkers: roundResultQuestMarkers } : {})
      })
    });
    return;
  }

  if (action === "raid" && services.partySessions?.isBigBarrelBrotherEnabled()) {
    const bigHandled = await sendTavernBarrel(ctx, tavernRaidService, presenceService, "edit", {
      botUsername: options.botUsername,
      partyBoss: services.partyBoss,
      partySessions: services.partySessions,
      openBigBarrelRecruiting: true,
      onlyBigBarrelRecruiting: true
    });

    if (bigHandled) {
      await safeAnswerCallbackQuery(ctx);
      return;
    }
  }

  const result = await tavernRaidService.advanceFridayBarrelRaid(telegramUserId);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentTavernNoCharacter());
    return;
  }

  if (result.state === "completed") {
    await services.barrelBeerTutorial?.markVisitedBarrelForTelegramUser(telegramUserId);
    await services.barrelBeerTutorial?.markBarrelRaidCompletedForTelegramUser(telegramUserId);
  }

  const questMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentTavernRaidResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildTavernResultKeyboard(result.state, {
      ...(questMarkers ? { questMarkers } : {})
    })
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
      barrelBeerTutorialService: services.barrelBeerTutorial,
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

function isBeerDrinkState(drink: PresentedShynokDrinkState | null): boolean {
  return drink?.key === "drink.simple-beer" || drink?.key === "drink.fine-beer";
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

  if (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit")) {
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern)) {
    return;
  }

  const lookup = await services.cellarErrand.getForTelegramUser(telegramUserId);
  const questMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);

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
        reply_markup: buildCellarGrownupKeyboard(grownup.state, {
          ...(questMarkers ? { questMarkers } : {})
        })
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

  if (callback.type === "method-help" || callback.type === "method-back") {
    if (lookup.state === "on-cooldown") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentCellarCooldown(lookup), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildCellarResultKeyboard("on-cooldown", lookup.character, {
          ...(questMarkers ? { questMarkers } : {})
        })
      });
      return;
    }

    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    });

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(
      ctx,
      callback.type === "method-help" ? presentCellarMethodHelp(lookup) : presentCellarStart(lookup),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: callback.type === "method-help"
          ? buildCellarMethodHelpKeyboard(lookup.character, {
              ...(questMarkers ? { questMarkers } : {})
            })
          : buildCellarResultKeyboard("ready", lookup.character, {
              ...(questMarkers ? { questMarkers } : {})
            })
      }
    );
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
  const resultQuestMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentCellarResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildCellarResultKeyboard(
      result.state === "insufficient-gold" || result.state === "stale" ? "ready" : result.state,
      result.character,
      resultQuestMarkers ? { questMarkers: resultQuestMarkers } : {}
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
  const tavernGameOptions = await getTavernGameButtonOptions(services.tavernGames);
  const questMarkers = await buildQuestMarkerSnapshotForTelegramUser(telegramUserId, services);

  await safeEditMessageText(ctx, presentCellarGrownupResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    ...(action === "grownup-turn-in"
      ? {
          reply_markup: buildKorchmaBarKeyboard({
            ...tavernGameOptions,
            ...(questMarkers ? { questMarkers } : {})
          })
        }
      : grownupKeyboardState
        ? {
            reply_markup: buildCellarGrownupKeyboard(grownupKeyboardState, {
              includeKeptBottle: shouldShowCellarGrownupKeptBottleButton(result),
              hideRoleplay: shouldHideCellarGrownupRoleplayButton(result),
              ...(questMarkers ? { questMarkers } : {})
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

function shouldHideCellarGrownupRoleplayButton(result: CellarGrownupQuestResult): boolean {
  return (
    result.state === "insufficient-gold" &&
    Boolean(result.roleplayCooldown && result.roleplayCooldown.availableAt > result.roleplayCooldown.now)
  );
}
