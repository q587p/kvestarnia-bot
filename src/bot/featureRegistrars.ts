import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { BotOptions } from "./botOptions";
import type { BotServices } from "./botServices";
import type {
  CellarGrownupQuestAction,
  CellarGrownupQuestResult
} from "../services/cellarGrownupQuestService";
import type { DevResetService } from "../services/devResetService";
import type {
  FightService,
  PersistentFightDifficultyId,
  PersistentFightTurnResult,
  ProblemQuestIssueNextLookupResult
} from "../services/fightService";
import type { HeroService } from "../services/heroService";
import type { YegerQuestService } from "../services/yegerQuestService";
import { isYegerUnquietTarget } from "../services/yegerQuestService";
import type { ShynokRoundConfirmResult } from "../services/shynokService";
import type { OnboardingService } from "../services/onboardingService";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_ADVENTURE_MIMIC_SHAWARMA,
  PRESENCE_ADVENTURE_CHOICE,
  PRESENCE_ADVENTURE_SOLO_FIGHT,
  PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER,
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
  PRESENCE_RAID_FRIDAY_BARREL,
  normalizePresenceLocationId,
  type PresenceService
} from "../services/presenceService";
import type { RestartService } from "../services/restartService";
import type { RemortService } from "../services/remortService";
import type { TavernRaidService } from "../services/tavernRaidService";
import type { CharacterPath } from "../domain/characters/path";
import { createBarrelRaidCompletionScheduler } from "./barrelRaidCompletionNotifier";
import { getMunchkinLocationAt } from "../domain/levelBarter/munchkinSchedule";
import { parseAdventureCallbackData, type AdventureCallback } from "./callbacks/adventureCallbackData";
import { parseBestiaryCallbackData, type BestiaryCallback } from "./callbacks/bestiaryCallbackData";
import { parseCellarCallbackData, type CellarCallback } from "./callbacks/cellarCallbackData";
import { parseDevResetCallbackData } from "./callbacks/devResetCallbackData";
import { parseDuelCallbackData } from "./callbacks/duelCallbackData";
import { parseFightCallbackData, type FightCallback } from "./callbacks/fightCallbackData";
import { parseHuntCallbackData, type HuntCallback } from "./callbacks/huntCallbackData";
import { parseItemGiftCallbackData } from "./callbacks/itemGiftCallbackData";
import {
  parseLevelBarterCallbackData,
  type LevelBarterCallback
} from "./callbacks/levelBarterCallbackData";
import { parseYegerCallbackData, type YegerCallback } from "./callbacks/yegerCallbackData";
import {
  parseEquipmentCallbackData,
  parseItemCallbackData,
  type EquipmentCallback,
  type ItemCallback
} from "./callbacks/itemCallbackData";
import {
  parseMantokChestCallbackData,
  type MantokChestCallback
} from "./callbacks/mantokChestCallbackData";
import { parseShynokCallbackData, type ShynokCallback } from "./callbacks/shynokCallbackData";
import { parseMemorialCallbackData, type MemorialCallback } from "./callbacks/memorialCallbackData";
import { parseMenuCallbackData } from "./callbacks/menuCallbackData";
import { parseNearbyDuelCallbackData } from "./callbacks/nearbyDuelCallbackData";
import { parseNewsCallbackData } from "./callbacks/newsCallbackData";
import { makePlaceCallbackData, parsePlaceCallbackData, type PlaceCallback } from "./callbacks/placeCallbackData";
import {
  makeQuestCallbackData,
  parseQuestCallbackData,
  questCallbackToPersistentFightDifficulty,
  type QuestCallback
} from "./callbacks/questCallbackData";
import {
  parseTrainingDoppelgangerCallbackData,
  type TrainingDoppelgangerCallback
} from "./callbacks/trainingDoppelgangerCallbackData";
import {
  parseOnboardingCallbackData,
  type OnboardingCallback
} from "./callbacks/onboardingCallbackData";
import { parseRestartCallbackData } from "./callbacks/restartCallbackData";
import { parseRemortCallbackData, type RemortCallback } from "./callbacks/remortCallbackData";
import { parseTavernCallbackData, type TavernCallback } from "./callbacks/tavernCallbackData";
import { registerAdventureCommand, sendAdventure } from "./commands/adventureCommand";
import {
  registerBestiaryCommand,
  sendBestiaryListGated,
  sendBestiaryMonsterGated
} from "./commands/bestiaryCommand";
import {
  registerCellarCommand,
  sendCellarErrandRouted
} from "./commands/cellarCommand";
import { registerDevResetCommand } from "./commands/devResetCommand";
import { registerDevGrantCommands } from "./commands/devGrantCommand";
import { handleDuelCallback, registerDuelCommand } from "./commands/duelCommand";
import { registerEquipmentCommand, sendEquipment } from "./commands/equipmentCommand";
import { registerFightCommand, sendFight } from "./commands/fightCommand";
import { registerHelpCommand } from "./commands/helpCommand";
import { registerHeroCommand, sendHero } from "./commands/heroCommand";
import {
  registerHuntCommand,
  markHuntPresence,
  markYegerCornerPresence,
  sendHuntBoard,
  sendYegerCorner
} from "./commands/huntCommand";
import { registerInventoryCommand, sendInventory } from "./commands/inventoryCommand";
import { handleItemGiftCallback } from "./commands/itemGiftCommand";
import { registerLookCommand } from "./commands/lookCommand";
import { handleNearbyDuelCallback } from "./commands/nearbyDuelCommand";
import { registerNewsCommand, sendNewsEntry, sendNewsList } from "./commands/newsCommand";
import { registerOnlineCommand, sendOnline } from "./commands/onlineCommand";
import { registerPlannedCommands } from "./commands/plannedCommand";
import {
  registerQuestHubCommand,
  sendQuestHub,
  type QuestHubCommandOptions
} from "./commands/questHubCommand";
import { registerRestartCommand } from "./commands/restartCommand";
import { registerRemortCommand } from "./commands/remortCommand";
import { registerStartCommand } from "./commands/startCommand";
import { registerSupportCommand } from "./commands/supportCommand";
import {
  registerTrainingDoppelgangerCommand,
  sendTrainingDoppelganger
} from "./commands/trainingDoppelgangerCommand";
import {
  registerTavernCommand,
  sendKorchmaArrivalBoard,
  sendKorchmaBar,
  sendDuelWinnersBoard,
  sendKorchmaDeepClosed,
  sendKorchmaFightingCorner,
  sendKorchmaFront,
  sendKorchmaMemorialBoard,
  sendKorchmaRemortMilestoneBoard,
  sendTavern,
  sendTavernBarrel
} from "./commands/tavernCommand";
import { registerVersionCommand } from "./commands/versionCommand";
import { playerFromContext } from "./context";
import {
  buildAdventureApproachKeyboard,
  buildAdventureParticipantsKeyboard,
  buildAdventureOfferKeyboard,
  buildAdventureResultKeyboard
} from "./keyboards/adventureKeyboard";
import {
  buildCellarParticipantsKeyboard,
  buildCellarGrownupKeyboard,
  buildCellarResultKeyboard
} from "./keyboards/cellarKeyboard";
import {
  buildFightResultKeyboard,
  buildPersistentFightDifficultyKeyboard,
  buildPersistentFightPassagePreviewKeyboard,
  buildPersistentFightJournalKeyboard,
  buildPersistentFightResultKeyboard,
  resolvePersistentFightPresenceLocation
} from "./keyboards/fightKeyboard";
import { buildTrainingDoppelgangerKeyboard } from "./keyboards/trainingDoppelgangerKeyboard";
import {
  buildEquipItemResultKeyboard,
  buildEquipmentKeyboard,
  buildItemDetailKeyboard
} from "./keyboards/inventoryKeyboard";
import {
  buildLevelBarterOfferKeyboard,
  buildLevelBarterPreviewKeyboard,
  buildLevelBarterResultKeyboard
} from "./keyboards/levelBarterKeyboard";
import {
  buildMantokChestHelpKeyboard,
  buildMantokChestManualSelectionKeyboard,
  buildMantokChestOverviewKeyboard,
  buildMantokChestPreviewKeyboard,
  buildMantokChestResultKeyboard
} from "./keyboards/mantokChestKeyboard";
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
} from "./keyboards/shynokKeyboard";
import {
  buildClassKeyboard,
  buildConfirmationKeyboard,
  buildGenderKeyboard,
  buildRaceKeyboard
} from "./keyboards/onboardingKeyboard";
import {
  buildMainMenuKeyboard,
  getMainMenuLocationButtonText,
  getMainMenuLocationButtonPresenceId,
  mainMenuButtons,
  mainMenuLocationButtonTexts
} from "./keyboards/mainMenuKeyboard";
import {
  buildBackToKorchmaHallKeyboard,
  buildBackToTavernRaidKeyboard,
  buildEnterKorchmaKeyboard,
  buildKorchmaBarKeyboard,
  buildKorchmaRoundOfferKeyboard,
  buildKorchmaRoundResultKeyboard,
  buildTavernParticipantsKeyboard,
  buildTavernResultKeyboard
} from "./keyboards/tavernKeyboard";
import { buildRemortKeyboard, buildRemortResultKeyboard } from "./keyboards/remortKeyboard";
import {
  buildYegerHelpKeyboard,
  buildYegerHuntKeyboard,
  buildYegerKeyboard,
  buildYegerTurnInKeyboard
} from "./keyboards/yegerKeyboard";
import {
  presentAdventureLegacyApproachStale,
  presentAdventureNoCharacter,
  presentAdventureProblem,
  presentAdventureResult,
  presentMimicShawarmaResult
} from "./presenters/adventurePresenter";
import {
  presentCellarGrownupQuest,
  presentCellarGrownupResult,
  presentCellarLevelLocked,
  presentCellarLevelRetired,
  presentCellarNoCharacter,
  presentCellarResult
} from "./presenters/cellarPresenter";
import {
  presentDevResetCancelled,
  presentDevResetDeleted,
  presentDevResetDisabled,
  presentDevResetNoCharacter
} from "./presenters/devResetPresenter";
import {
  presentFightNeedsRest,
  presentFightLevelRetired,
  presentFightMonsterRest,
  presentFightNoCharacter,
  presentFightTrainingActive,
  buildProblemQuestProgressAfterFightEntry,
  type QuestProgressAfterFightEntry,
  presentProblemQuestIssueNext,
  presentProblemQuestTurnIn,
  presentQuestProgressAfterFight,
  presentFightResult,
  presentPersistentFight,
  presentPersistentFightDifficultyChoice,
  presentPersistentFightIntro,
  presentPersistentFightJournal,
  presentPersistentFightPassagePreview,
  presentPersistentFightSnapshot,
  presentPersistentFightTurn
} from "./presenters/fightPresenter";
import {
  presentTrainingDoppelgangerNoCharacter,
  presentTrainingDoppelgangerLevelGate,
  presentTrainingDoppelgangerTurn
} from "./presenters/trainingDoppelgangerPresenter";
import { presentHelp } from "./presenters/helpPresenter";
import {
  presentEquipment,
  presentEquipItemResult,
  presentUnequipSlotResult
} from "./presenters/equipmentPresenter";
import { presentItemDetail } from "./presenters/itemDetailPresenter";
import { presentLevelUpCelebration } from "./presenters/levelGrowthPresenter";
import {
  presentLevelBarterConfirmResult,
  presentLevelBarterOffer,
  presentLevelBarterPreview
} from "./presenters/levelBarterPresenter";
import {
  presentMantokChestHelp,
  presentMantokChestManualSelection,
  presentMantokChestOverview,
  presentMantokChestPreview,
  presentMantokChestRecycleResult
} from "./presenters/mantokChestPresenter";
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
} from "./presenters/shynokPresenter";
import {
  presentCharacterCreated,
  presentClassSelected,
  presentGenderSelected,
  presentInvalidCallback,
  presentRaceSelected,
  presentUnavailableChoice,
  presentWelcome
} from "./presenters/onboardingPresenter";
import { presentKorchmaQuestGate } from "./presenters/questHubPresenter";
import {
  presentRestartCancelled,
  presentRestartDeleted,
  presentRestartNoCharacter
} from "./presenters/restartPresenter";
import { presentRemortConfirm, presentRemortUpdate } from "./presenters/remortPresenter";
import {
  presentYegerHelp,
  presentYegerNoCharacter,
  presentYegerQuest,
  presentYegerStart,
  presentYegerTrackingBlockedByOtherFight,
  presentYegerTrackingNone,
  presentYegerTrackingPending,
  presentYegerTrackingStart,
  presentYegerTurnIn
} from "./presenters/yegerPresenter";
import { presentParticipants } from "./presenters/presencePresenter";
import {
  presentTavernNoCharacter,
  presentKorchmaDeepLevelLocked,
  presentTavernRaidResult,
  presentTavernRoundLeaderboard,
  presentTavernRoundOffer,
  presentTavernRoundResult
} from "./presenters/tavernPresenter";
import { safeAnswerCallbackQuery } from "./safeAnswerCallbackQuery";
import { safeEditMessageText } from "./safeEditMessageText";
import { editPendingRaidBlockIfNeeded } from "./middleware/pendingRaidGuard";
import type { PresenceContext } from "./presence/presenceRouting";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

const barrelRaidCompletionScheduler = createBarrelRaidCompletionScheduler();

interface BotModuleDependencies {
  services: BotServices;
  options: BotOptions;
}

export function registerCoreBotModule(
  bot: Bot,
  { services, options }: BotModuleDependencies
): void {
  registerOnlineCommand(bot, services.presence, {
    duelEnabled: Boolean(services.duel),
    itemGiftEnabled: Boolean(services.itemTransfers)
  });
  registerLookCommand(bot, services.presence);
  registerHelpCommand(bot, services.devReset, services.devGrant, {
    buildMainMenuKeyboard: (ctx) => buildCurrentMainMenuKeyboard(ctx, services.presence)
  });
  registerNewsCommand(bot);
  registerSupportCommand(bot, options.supportJarUrl, options.supportJarStatus);
  registerVersionCommand(bot);
  registerPlannedCommands(bot);
  registerMainMenuKeyboard(bot, services);
  registerCallbackMainMenuLocationRefresh(bot, services.presence);

  bot.callbackQuery(/^v1:menu:/, async (ctx) => {
    const parsed = parseMenuCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleMenuCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:news:/, async (ctx) => {
    const parsed = parseNewsCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await safeAnswerCallbackQuery(ctx);

    if (parsed.value.type === "list") {
      await sendNewsList(ctx, parsed.value.page, "edit", { source: parsed.value.source });
      return;
    }

    await sendNewsEntry(ctx, parsed.value.entryIndex, parsed.value.listPage, { source: parsed.value.source });
  });
}

export function registerCharacterBotModule(
  bot: Bot,
  { services, options }: BotModuleDependencies
): void {
  registerBestiaryCommand(bot, services.hero);
  registerStartCommand(
    bot,
    services.onboarding,
    services.duel
      ? {
          duel: services.duel,
          duelBotUsername: options.botUsername
        }
      : undefined
  );
  registerHeroCommand(bot, services.hero, {
    buildMainMenuKeyboard: (ctx) => buildCurrentMainMenuKeyboard(ctx, services.presence)
  });
  if (services.devGrant?.isEnabled()) {
    registerDevGrantCommands(bot, services.devGrant);
  }
  registerDevResetCommand(bot, services.devReset, services.adventure, services.tavern, services.fight);
  registerRestartCommand(bot);
  if (services.remort) {
    registerRemortCommand(bot, services.remort, services.tavern);
  }

  bot.callbackQuery(/^v1:onb:/, async (ctx) => {
    const parsed = parseOnboardingCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleOnboardingCallback(ctx, parsed.value, services.onboarding);
  });

  bot.callbackQuery(/^v1:bst:/, async (ctx) => {
    const parsed = parseBestiaryCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleBestiaryCallback(ctx, parsed.value, services.hero);
  });

  bot.callbackQuery(/^v1:devreset:/, async (ctx) => {
    const parsed = parseDevResetCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleDevResetCallback(ctx, parsed.value, services.devReset);
  });

  bot.callbackQuery(/^v1:restart:/, async (ctx) => {
    const parsed = parseRestartCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleRestartCallback(ctx, parsed.value, services.restart);
  });

  bot.callbackQuery(/^v1:rm:/, async (ctx) => {
    const parsed = parseRemortCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok || !services.remort) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleRemortCallback(ctx, parsed.value, services.remort, services.tavern);
  });
}

export function registerInventoryBotModule(
  bot: Bot,
  { services }: BotModuleDependencies
): void {
  registerInventoryCommand(bot, services.inventory);
  registerEquipmentCommand(bot, services.equipment);

  bot.callbackQuery(/^v1:equip:/, async (ctx) => {
    const parsed = parseEquipmentCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleEquipmentCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:item:/, async (ctx) => {
    const parsed = parseItemCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleItemCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:chest:/, async (ctx) => {
    const parsed = parseMantokChestCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleMantokChestCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:lvlx:/, async (ctx) => {
    const parsed = parseLevelBarterCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleLevelBarterCallback(ctx, parsed.value, services);
  });
}

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

export function registerQuestBotModule(
  bot: Bot,
  { services }: BotModuleDependencies
): void {
  registerAdventureCommand(bot, services.adventure, {
    cellarErrand: services.cellarErrand,
    presence: services.presence,
    tavernRaid: services.tavern
  });
  registerHuntCommand(bot, services.yeger, {
    presence: services.presence,
    tavernRaid: services.tavern
  });
  registerQuestHubCommand(bot, buildQuestHubCommandOptions(services));

  bot.callbackQuery(/^v[12]:adv:/, async (ctx) => {
    const parsed = parseAdventureCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleAdventureCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:quest:/, async (ctx) => {
    const parsed = parseQuestCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleQuestCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:hunt:/, async (ctx) => {
    const parsed = parseHuntCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleHuntCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:ygr:/, async (ctx) => {
    const parsed = parseYegerCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleYegerCallback(ctx, parsed.value, services);
  });
}

export function registerCombatBotModule(
  bot: Bot,
  { services }: BotModuleDependencies
): void {
  registerFightCommand(bot, services.fight, {
    presence: services.presence,
    tavernRaid: services.tavern
  });
  if (services.trainingDoppelganger) {
    registerTrainingDoppelgangerCommand(bot, services.trainingDoppelganger, {
      presence: services.presence,
      tavernRaid: services.tavern
    });
  }

  bot.callbackQuery(/^v1:spar:/, async (ctx) => {
    const parsed = parseTrainingDoppelgangerCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok || !services.trainingDoppelganger) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleTrainingDoppelgangerCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:fight:/, async (ctx) => {
    const parsed = parseFightCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleFightCallback(ctx, parsed.value, services);
  });
}

export function registerSocialBotModule(
  bot: Bot,
  { services, options }: BotModuleDependencies
): void {
  if (services.duel) {
    registerDuelCommand(bot, services.duel, {
      presence: services.presence,
      tavernRaid: services.tavern,
      botUsername: options.botUsername
    });
  }

  bot.callbackQuery(/^v1:gift:/, async (ctx) => {
    const parsed = parseItemGiftCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok || !services.itemTransfers) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleItemGiftCallback(ctx, parsed.value, services.itemTransfers);
  });

  bot.callbackQuery(/^v1:duel:/, async (ctx) => {
    const parsed = parseDuelCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok || !services.duel) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleDuelCallback(ctx, parsed.value, services.duel, {
      presence: services.presence,
      tavernRaid: services.tavern,
      botUsername: options.botUsername
    });
  });

  bot.callbackQuery(/^v1:nd:/, async (ctx) => {
    const parsed = parseNearbyDuelCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok || !services.duel) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleNearbyDuelCallback(ctx, parsed.value, {
      presence: services.presence,
      duel: services.duel,
      tavernRaid: services.tavern
    });
  });
}

export function resumeBotNotifications(bot: Bot, services: BotServices): void {
  if (services.barrelRaidNotifications) {
    void barrelRaidCompletionScheduler.resumePending({
      bot,
      now: new Date(),
      tavernRaidService: services.tavern,
      notifications: services.barrelRaidNotifications
    }).catch((error) => {
      console.error("Квестарня: бочкові нотифікації після старту не відновились.", error);
    });
  }
}

export function buildQuestHubCommandOptions(services: BotServices): QuestHubCommandOptions {
  return {
    adventure: services.adventure,
    cellarErrand: services.cellarErrand,
    ...(services.cellarGrownup ? { cellarGrownup: services.cellarGrownup } : {}),
    fight: services.fight,
    yeger: services.yeger,
    presence: services.presence,
    tavernRaid: services.tavern
  };
}

async function handleOnboardingCallback(
  ctx: Context,
  callback: OnboardingCallback,
  onboardingService: OnboardingService
): Promise<void> {
  if (callback.type === "gender") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGenderSelected(callback.pronoun), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildRaceKeyboard(callback.pronoun)
    });
    return;
  }

  if (callback.type === "back-to-gender") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentWelcome(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildGenderKeyboard()
    });
    return;
  }

  if (callback.type === "back-to-race") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentGenderSelected(callback.pronoun), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildRaceKeyboard(callback.pronoun)
    });
    return;
  }

  if (callback.type === "back-to-class") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentRaceSelected(callback.pronoun, callback.raceId), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildClassKeyboard(callback.pronoun, callback.raceId)
    });
    return;
  }

  if (callback.type === "unavailable-race") {
    const selectedRace = onboardingService.selectRace(callback.pronoun, callback.raceId);
    const reason =
      selectedRace.ok || selectedRace.error.type !== "unavailable-race"
        ? presentInvalidCallback()
        : presentUnavailableChoice(selectedRace.error.reason);

    await safeAnswerCallbackQuery(ctx, { text: reason, show_alert: true });
    return;
  }

  if (callback.type === "race") {
    const selectedRace = onboardingService.selectRace(callback.pronoun, callback.raceId);

    if (!selectedRace.ok) {
      const text =
        selectedRace.error.type === "unavailable-race"
          ? presentUnavailableChoice(selectedRace.error.reason)
          : presentInvalidCallback();
      await safeAnswerCallbackQuery(ctx, { text, show_alert: true });
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentRaceSelected(callback.pronoun, callback.raceId), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildClassKeyboard(callback.pronoun, callback.raceId)
    });
    return;
  }

  if (callback.type === "unavailable-class") {
    const selectedClass = onboardingService.selectClass(
      callback.pronoun,
      callback.raceId,
      callback.classId
    );
    const reason =
      selectedClass.ok || selectedClass.error.type !== "unavailable-class"
        ? presentInvalidCallback()
        : presentUnavailableChoice(selectedClass.error.reason);

    await safeAnswerCallbackQuery(ctx, { text: reason, show_alert: true });
    return;
  }

  if (callback.type === "class") {
    const selectedClass = onboardingService.selectClass(
      callback.pronoun,
      callback.raceId,
      callback.classId
    );

    if (!selectedClass.ok) {
      const text =
        selectedClass.error.type === "unavailable-class" ||
        selectedClass.error.type === "unavailable-race"
          ? presentUnavailableChoice(selectedClass.error.reason)
          : presentInvalidCallback();
      await safeAnswerCallbackQuery(ctx, { text, show_alert: true });
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(
      ctx,
      presentClassSelected(callback.pronoun, callback.raceId, callback.classId),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildConfirmationKeyboard(callback.pronoun, callback.raceId, callback.classId)
      }
    );
    return;
  }

  const player = playerFromContext(ctx.from);

  if (!player) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await onboardingService.complete(
    player,
    callback.pronoun,
    callback.raceId,
    callback.classId
  );

  if (!result.ok) {
    const text =
      result.error.type === "unavailable-class" || result.error.type === "unavailable-race"
        ? presentUnavailableChoice(result.error.reason)
        : presentInvalidCallback();
    await safeAnswerCallbackQuery(ctx, { text, show_alert: true });
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(
    ctx,
    presentCharacterCreated(result.value.character, result.value.created),
    HTML_MESSAGE_OPTIONS
  );
  await ctx.reply("🍺 Квестарня відчинена.", {
    reply_markup: buildMainMenuKeyboard()
  });
}

async function handleMenuCallback(
  ctx: Context,
  action: "hero" | "help" | "inventory" | "tavern",
  services: BotServices
): Promise<void> {
  await safeAnswerCallbackQuery(ctx);

  if (action === "hero") {
    await sendHero(ctx, services.hero, "edit");
    return;
  }

  if (action === "help") {
    await safeEditMessageText(ctx, presentHelp({
      includeDevReset: services.devReset.isEnabled(),
      includeDevGrant: services.devGrant?.isEnabled() ?? false
    }));
    return;
  }

  if (action === "inventory") {
    await sendInventory(ctx, services.inventory, "edit");
    return;
  }

  await sendTavern(ctx, services.tavern, services.presence, "edit");
}

async function handleItemCallback(
  ctx: Context,
  action: ItemCallback,
  services: BotServices
): Promise<void> {
  if (action.type === "inventory") {
    await safeAnswerCallbackQuery(ctx);
    await sendInventory(ctx, services.inventory, "edit", action.page, action.slot, services.equipment);
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await services.inventory.getItemForTelegramUser(telegramUserId, action.itemId);
  const equipment = await services.equipment.getEquipmentForTelegramUser(telegramUserId);
  const equipPreview = await services.equipment.previewItemEquipForTelegramUser(
    telegramUserId,
    action.itemId
  );
  const equippedSlot =
    equipment.state === "ready"
      ? (equipment.slots.find((slot) => slot.item?.itemId === action.itemId)?.slot ?? null)
      : null;

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentItemDetail(result, { equippedSlot, equipPreview }), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemDetailKeyboard(result, equippedSlot, action.page, action.slot)
  });
}

async function handleEquipmentCallback(
  ctx: Context,
  action: EquipmentCallback,
  services: BotServices
): Promise<void> {
  if (action.type === "view") {
    await safeAnswerCallbackQuery(ctx);
    await sendEquipment(ctx, services.equipment, "edit");
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (action.type === "equip-item") {
    const result = await services.equipment.equipItemForTelegramUser(
      telegramUserId,
      action.itemId
    );

    await safeAnswerCallbackQuery(ctx);

    if (result.state === "equipped") {
      const equipment = await services.equipment.getEquipmentForTelegramUser(telegramUserId);
      await safeEditMessageText(ctx, presentEquipment(equipment), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildEquipmentKeyboard(equipment)
      });
      return;
    }

    await safeEditMessageText(ctx, presentEquipItemResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildEquipItemResultKeyboard()
    });
    return;
  }

  const result = await services.equipment.unequipSlotForTelegramUser(telegramUserId, action.slot);

  await safeAnswerCallbackQuery(ctx, {
    text: presentUnequipSlotResult(result),
    show_alert: result.state === "no-character"
  });

  const equipment =
    result.state === "no-character"
      ? await services.equipment.getEquipmentForTelegramUser(telegramUserId)
      : { state: "ready" as const, slots: result.slots };

  await safeEditMessageText(ctx, presentEquipment(equipment), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildEquipmentKeyboard(equipment)
  });
}

async function handleMantokChestCallback(
  ctx: Context,
  action: MantokChestCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (action.type === "inventory") {
    await safeAnswerCallbackQuery(ctx);
    await sendInventory(ctx, services.inventory, "edit");
    return;
  }

  if (action.type === "help") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMantokChestHelp(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildMantokChestHelpKeyboard()
    });
    return;
  }

  if (action.type === "open") {
    const overview = await services.mantokChest.getOverviewForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMantokChestOverview(overview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "auto") {
    const preview = await services.mantokChest.createAutoPickPreviewForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(
      ctx,
      preview.state === "not-enough-items"
        ? { text: "Скрині треба 5 доступних манаток.", show_alert: true }
        : { show_alert: preview.state === "no-character" }
    );
    await safeEditMessageText(ctx, presentMantokChestPreview(preview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        preview.state === "preview-created"
          ? buildMantokChestPreviewKeyboard(preview.run.token)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "manual") {
    const selection = await services.mantokChest.startManualSelectionForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMantokChestManualSelection(selection), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        selection.state === "selection"
          ? buildMantokChestManualSelectionKeyboard(selection)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "page") {
    const selection = await services.mantokChest.getManualSelectionForTelegramUser(
      telegramUserId,
      action.token,
      action.page
    );

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMantokChestManualSelection(selection), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        selection.state === "selection"
          ? buildMantokChestManualSelectionKeyboard(selection)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "add" || action.type === "remove") {
    const selection =
      action.type === "add"
        ? await services.mantokChest.addManualSelectionUnitForTelegramUser(telegramUserId, action)
        : await services.mantokChest.removeManualSelectionUnitForTelegramUser(telegramUserId, action);

    await safeAnswerCallbackQuery(
      ctx,
      selection.state === "selection" && selection.selectedCount === selection.requiredCount
        ? { text: "На виделці рівно 5 манаток." }
        : undefined
    );
    await safeEditMessageText(ctx, presentMantokChestManualSelection(selection), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        selection.state === "selection"
          ? buildMantokChestManualSelectionKeyboard(selection)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "preview") {
    const preview = await services.mantokChest.getManualPreviewForTelegramUser(
      telegramUserId,
      action.token
    );

    await safeAnswerCallbackQuery(
      ctx,
      preview.state === "selection-incomplete"
        ? { text: "Скрині треба рівно 5 манаток.", show_alert: true }
        : { show_alert: preview.state !== "preview-created" }
    );
    await safeEditMessageText(ctx, presentMantokChestPreview(preview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        preview.state === "preview-created"
          ? buildMantokChestPreviewKeyboard(preview.run.token)
          : buildMantokChestOverviewKeyboard()
    });
    return;
  }

  if (action.type === "cancel") {
    const result = await services.mantokChest.cancelRecycleForTelegramUser(
      telegramUserId,
      action.token
    );

    await safeAnswerCallbackQuery(ctx, {
      text: result.state === "cancelled" ? "Скриня відпустила манатки." : presentInvalidCallback(),
      show_alert: result.state !== "cancelled"
    });

    const overview = await services.mantokChest.getOverviewForTelegramUser(telegramUserId);
    await safeEditMessageText(ctx, presentMantokChestOverview(overview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildMantokChestOverviewKeyboard()
    });
    return;
  }

  const result = await services.mantokChest.confirmRecycleForTelegramUser(
    telegramUserId,
    action.token
  );

  await safeAnswerCallbackQuery(
    ctx,
    result.state === "recycled"
      ? { text: "Скриня хрумкнула." }
      : {
          show_alert:
            result.state === "invalid-token" ||
            result.state === "stale-inputs" ||
            result.state === "expired"
        }
  );
  const outputItem =
    result.state === "recycled" || result.state === "replayed" ? result.outputItem : null;

  await safeEditMessageText(ctx, presentMantokChestRecycleResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildMantokChestResultKeyboard(outputItem)
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

async function handleLevelBarterCallback(
  ctx: Context,
  action: LevelBarterCallback,
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

  const levelBarterReturnOptions = {
    munchkinLocation: getMunchkinLocationAt(new Date())
  };

  if (action.type === "open") {
    const offer = await services.levelBarter.getOfferForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentLevelBarterOffer(offer), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildLevelBarterOfferKeyboard(levelBarterReturnOptions)
    });
    return;
  }

  if (action.type === "auto") {
    const preview = await services.levelBarter.createAutoPreviewForTelegramUser(telegramUserId);

    await safeAnswerCallbackQuery(
      ctx,
      preview.state === "insufficient"
        ? { text: "Манчкінові ще не вистачає добра на рівень.", show_alert: true }
        : { show_alert: preview.state === "no-character" || preview.state === "battle-only-level" }
    );
    await safeEditMessageText(ctx, presentLevelBarterPreview(preview), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildLevelBarterPreviewKeyboard(preview, levelBarterReturnOptions)
    });
    return;
  }

  const result = await services.levelBarter.confirmAutoExchangeForTelegramUser(
    telegramUserId,
    action.token
  );

  await safeAnswerCallbackQuery(
    ctx,
    result.state === "exchanged" || result.state === "replayed"
      ? { text: result.state === "replayed" ? "Цей обмін уже записано." : "Манчкін підкинув рівень." }
      : { show_alert: result.state !== "stale-selection" }
  );
  await safeEditMessageText(ctx, presentLevelBarterConfirmResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildLevelBarterResultKeyboard(levelBarterReturnOptions)
  });
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

function placeCallbackToPersistentFightPassage(action: PlaceCallback): {
  difficulty: PersistentFightDifficultyId;
  locationId: string;
  passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
} | null {
  if (action === "deep-left") {
    return {
      difficulty: "hard",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT,
      passage: action
    };
  }

  if (action === "deep-straight") {
    return {
      difficulty: "normal",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT,
      passage: action
    };
  }

  if (action === "deep-right") {
    return {
      difficulty: "easy",
      locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT,
      passage: action
    };
  }

  return null;
}

async function sendPersistentFightPassagePreview(
  ctx: Context,
  services: BotServices,
  passageFight: {
    difficulty: PersistentFightDifficultyId;
    locationId: string;
    passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
  },
  mode: "reply" | "edit"
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeEditOrReply(ctx, mode, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
    return;
  }

  const preview = await services.fight.previewPersistentFightForTelegramUser(telegramUserId, {
    difficulty: passageFight.difficulty,
    originLocationId: passageFight.locationId
  });

  if ("character" in preview && preview.character.level < 3) {
    await safeEditOrReply(ctx, mode, presentKorchmaDeepLevelLocked(preview.character), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildBackToKorchmaHallKeyboard()
    });
    return;
  }

  if (preview.state !== "persistent-preview") {
    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: false
    });
    return;
  }

  await markScenePresence(ctx, services.presence, {
    locationId: passageFight.locationId,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
  });
  await safeEditOrReply(ctx, mode, presentPersistentFightPassagePreview(preview), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildPersistentFightPassagePreviewKeyboard({
      passage: passageFight.passage,
      encounterToken: preview.encounterToken
    })
  });
}

async function safeEditOrReply(
  ctx: Context,
  mode: "reply" | "edit",
  text: string,
  options?: Parameters<Context["editMessageText"]>[1]
): Promise<void> {
  if (mode === "edit") {
    await safeEditMessageText(ctx, text, options);
    return;
  }

  await ctx.reply(text, options);
}

function presenceLocationToPersistentFightPassage(locationId: string): {
  difficulty: PersistentFightDifficultyId;
  locationId: string;
  passage: Extract<PlaceCallback, "deep-left" | "deep-straight" | "deep-right">;
} | null {
  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT) {
    return {
      difficulty: "hard",
      locationId,
      passage: "deep-left"
    };
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT) {
    return {
      difficulty: "normal",
      locationId,
      passage: "deep-straight"
    };
  }

  if (locationId === PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT) {
    return {
      difficulty: "easy",
      locationId,
      passage: "deep-right"
    };
  }

  return null;
}

function persistentFightDifficultyToPassageLocationId(
  difficulty: PersistentFightDifficultyId
): string {
  if (difficulty === "hard") {
    return PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_LEFT;
  }

  if (difficulty === "easy") {
    return PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_RIGHT;
  }

  return PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1_STRAIGHT;
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

async function handleQuestCallback(
  ctx: Context,
  action: QuestCallback,
  services: BotServices
): Promise<void> {
  await safeAnswerCallbackQuery(ctx);
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (telegramUserId && (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern))) {
    return;
  }

  if (action === "archive" || action === "list") {
    await sendQuestHub(
      ctx,
      buildQuestHubCommandOptions(services),
      "edit",
      action === "archive" ? "archive" : "active"
    );
    return;
  }

  if (action === "adventure") {
    await sendAdventure(ctx, services.adventure, "reply", {
      cellarErrand: services.cellarErrand,
      presence: services.presence,
      tavernRaid: services.tavern,
      fallbackToCellar: false,
      requireKorchmaInterior: true
    });
    return;
  }

  const fightDifficulty = questCallbackToPersistentFightDifficulty(action);

  if (action === "fight" || action === "fight-descend" || fightDifficulty) {
    if (!telegramUserId) {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (!place.insideKorchma) {
      await safeEditMessageText(ctx, presentKorchmaQuestGate(), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildEnterKorchmaKeyboard()
      });
      return;
    }

    const targetLocationId = fightDifficulty
      ? persistentFightDifficultyToPassageLocationId(fightDifficulty)
      : action === "fight-descend"
        ? PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1
        : PRESENCE_LOCATION_KORCHMA_DEEP;

    if (place.locationId !== targetLocationId) {
      await markScenePresence(ctx, services.presence, {
        locationId: targetLocationId,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
      await sendFight(ctx, services.fight, "reply", {
        presence: services.presence,
        requireKorchmaInterior: false,
        ...(action === "fight-descend" ? { openDifficulty: true } : {}),
        ...(fightDifficulty ? { difficulty: fightDifficulty, originLocationId: targetLocationId } : {})
      });
      await refreshMainMenuLocationKeyboard(ctx, targetLocationId);
      return;
    }

    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: true,
      ...(action === "fight-descend" ? { openDifficulty: true } : {}),
      ...(fightDifficulty ? { difficulty: fightDifficulty, originLocationId: targetLocationId } : {})
    });
    await refreshMainMenuLocationKeyboard(ctx, targetLocationId);
    return;
  }

  if (action === "problem" || action === "problem-next") {
    if (!telegramUserId) {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

    if (place.state === "no-character") {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (!place.insideKorchma) {
      await safeEditMessageText(ctx, presentKorchmaQuestGate(), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildEnterKorchmaKeyboard()
      });
      return;
    }

    if (place.locationId !== PRESENCE_LOCATION_KORCHMA_BAR) {
      await sendKorchmaBar(ctx, services.tavern, services.presence, "edit", services.cellarGrownup, services.fight);
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }

    if (action === "problem-next") {
      const result = await services.fight.issueNextProblemQuestForTelegramUser(telegramUserId);

      if (result.state === "no-character") {
        await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
        return;
      }

      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_BAR,
        currentRaidId: null,
        currentAdventureId: null
      });
      await safeEditMessageText(ctx, presentProblemQuestIssueNext(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildKorchmaBarKeyboard(getProblemQuestIssueNextBarKeyboardOptions(result))
      });
      await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
      return;
    }

    const result = await services.fight.turnInProblemQuestForTelegramUser(telegramUserId);

    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
      return;
    }

    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_BAR,
      currentRaidId: null,
      currentAdventureId: null
    });
    await safeEditMessageText(ctx, presentProblemQuestTurnIn(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildKorchmaBarKeyboard({
        ...(result.state === "turned-in" && result.result.nextStage
          ? { problemQuestAction: "next" }
          : {})
      })
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (action === "hunt") {
    await sendYegerCorner(ctx, services.yeger, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: false
    });
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
      ...(services.cellarGrownup ? { grownupQuest: services.cellarGrownup } : {})
    }
  );
  await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
}

function getProblemQuestIssueNextBarKeyboardOptions(
  result: Exclude<ProblemQuestIssueNextLookupResult, { state: "no-character" }>
): Parameters<typeof buildKorchmaBarKeyboard>[0] {
  if (result.state === "issued") {
    if (result.progress.completed && !result.progress.rewardClaimed) {
      return { problemQuestAction: "turn-in" };
    }

    return {};
  }

  if (result.state === "not-available") {
    if (result.progress.completed && !result.progress.rewardClaimed) {
      return { problemQuestAction: "turn-in" };
    }

    if (result.progress.rewardClaimed && result.progress.stageId !== "93") {
      return { problemQuestAction: "next" };
    }
  }

  return {};
}

async function handleTrainingDoppelgangerCallback(
  ctx: Context,
  callback: TrainingDoppelgangerCallback,
  services: BotServices
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId || !services.trainingDoppelganger) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern)) {
    return;
  }

  if (callback.type === "turn") {
    const result = await services.trainingDoppelganger.resolveTurn(telegramUserId, {
      sessionId: callback.sessionId,
      turn: callback.turn,
      action: callback.action
    });

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentTrainingDoppelgangerNoCharacter());
      return;
    }

    if (result.state === "level-gated") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentTrainingDoppelgangerLevelGate(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildTrainingDoppelgangerKeyboard()
      });
      return;
    }

    if (result.state !== "not-found") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentTrainingDoppelgangerTurn(result), {
      ...HTML_MESSAGE_OPTIONS,
      ...(result.state === "not-found"
        ? {}
        : {
            reply_markup: buildTrainingDoppelgangerKeyboard(result.session, result.character)
          })
    });
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await sendTrainingDoppelganger(ctx, services.trainingDoppelganger, "edit", {
    presence: services.presence,
    tavernRaid: services.tavern,
    requireKorchmaInterior: true,
    ...(callback.type === "mode" ? { startMode: callback.mode } : {})
  });
}

function registerMainMenuKeyboard(bot: Bot, services: BotServices): void {
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

async function buildCurrentMainMenuKeyboard(
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

function registerCallbackMainMenuLocationRefresh(bot: Bot, presenceService: PresenceService): void {
  bot.on("callback_query:data", async (ctx, next) => {
    const isPlaceCallback = parsePlaceCallbackData(ctx.callbackQuery.data).ok;
    if (isPlaceCallback) {
      await next();
      return;
    }

    const previousLocationId = await getCurrentMainMenuLocationId(ctx, presenceService);

    await next();

    if (previousLocationId === undefined) {
      return;
    }

    await refreshCurrentMainMenuLocationKeyboard(ctx, presenceService, {
      previousLocationId
    });
  });
}

async function refreshCurrentMainMenuLocationKeyboard(
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

async function refreshMainMenuLocationKeyboard(
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

async function sendPlaceMovementNotice(
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

async function sendCurrentLocation(ctx: Context, services: BotServices): Promise<void> {
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
    await sendKorchmaFront(ctx, services.tavern, services.presence, "reply", services.yeger);
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

async function handleAdventureCallback(
  ctx: Context,
  callback: AdventureCallback,
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

  if (callback.type === "participants") {
    const snapshot = await services.presence.getAdventureParticipantsForTelegramUser(
      telegramUserId,
      PRESENCE_ADVENTURE_CHOICE
    );

    if (snapshot.state !== "no-character") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_CHOICE
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentParticipants(snapshot), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildAdventureParticipantsKeyboard()
    });
    return;
  }

  if (callback.type === "legacy") {
    const result = await services.adventure.completeMimicShawarma(telegramUserId, {
      type: "legacy",
      action: callback.action
    });

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentAdventureNoCharacter());
      return;
    }

    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMimicShawarmaResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildAdventureResultKeyboard(result)
    });

    if (result.state === "completed") {
      await sendLevelUpCelebration(ctx, result);
    }
    return;
  }

  if (callback.type === "method") {
    const result = await services.adventure.completeMimicShawarma(telegramUserId, {
      type: "method",
      methodId: callback.methodId
    });

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentAdventureNoCharacter());
      return;
    }

    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    });

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentMimicShawarmaResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildAdventureResultKeyboard(result)
    });

    if (result.state === "completed") {
      await sendLevelUpCelebration(ctx, result);
    }
    return;
  }

  if (callback.type === "problem") {
    const result = await services.adventure.selectAdventureProblem(telegramUserId, callback);

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentAdventureNoCharacter());
      return;
    }

    if (result.state !== "active-fight") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_CHOICE
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureProblem(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        result.state === "selected"
          ? buildAdventureApproachKeyboard(result)
          : result.state === "stale"
            ? buildAdventureOfferKeyboard(result.offer)
            : result.state === "combat-blocked"
              ? buildAdventureResultKeyboard({ state: "active-fight" })
              : buildAdventureResultKeyboard(result)
    });
    return;
  }

  if (callback.type === "legacy-approach") {
    const result = await services.adventure.selectAdventureProblem(telegramUserId, callback);

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentAdventureNoCharacter());
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureLegacyApproachStale(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup:
        result.state === "selected"
          ? buildAdventureApproachKeyboard(result)
          : result.state === "stale"
            ? buildAdventureOfferKeyboard(result.offer)
            : result.state === "combat-blocked"
              ? buildAdventureResultKeyboard({ state: "active-fight" })
              : buildAdventureResultKeyboard(result)
    });
    return;
  }

  const result = await services.adventure.completeAdventureApproach(telegramUserId, callback);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureNoCharacter());
    return;
  }

  if (result.state === "completed") {
    let complicationFight:
      | Awaited<ReturnType<FightService["getOrStartPersistentFightForTelegramUser"]>>
      | null = null;

    if (result.fightHandoff) {
      complicationFight = await services.fight.getOrStartPersistentFightForTelegramUser(
        telegramUserId,
        {
          source: "adventure",
          originLocationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
          difficulty: "normal",
          ...(result.fightEncounter
            ? { target: { monsterIds: [result.fightEncounter.monsterId] } }
            : {})
        }
      );

      const handoffStarted =
        complicationFight.state === "persistent-active" && complicationFight.started === true;

      if (!handoffStarted) {
        await services.adventure.rollbackCurrentAdventureClaimForTelegramUser(telegramUserId, result.claim);
        await safeAnswerCallbackQuery(ctx);

        if (
          complicationFight.state === "persistent-active" ||
          complicationFight.state === "persistent-terminal"
        ) {
          await markScenePresence(ctx, services.presence, {
            locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
            currentRaidId: null,
            currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
          });
          await safeEditMessageText(ctx, presentPersistentFight(complicationFight), {
            ...HTML_MESSAGE_OPTIONS,
            reply_markup: buildPersistentFightResultKeyboard(
              complicationFight.session,
              complicationFight.character
            )
          });
          return;
        }

        if (complicationFight.state === "training-active") {
          await markScenePresence(ctx, services.presence, {
            locationId: PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
            currentRaidId: null,
            currentAdventureId: PRESENCE_ADVENTURE_TRAINING_DOPPELGANGER
          });
          await safeEditMessageText(ctx, presentFightTrainingActive(complicationFight), {
            ...HTML_MESSAGE_OPTIONS,
            reply_markup: buildTrainingDoppelgangerKeyboard(
              complicationFight.session,
              complicationFight.character
            )
          });
          return;
        }

        if (complicationFight.state === "needs-rest") {
          await safeEditMessageText(
            ctx,
            presentFightNeedsRest(complicationFight),
            HTML_MESSAGE_OPTIONS
          );
          return;
        }

        if (complicationFight.state === "monster-rest") {
          await safeEditMessageText(
            ctx,
            presentFightMonsterRest(complicationFight),
            HTML_MESSAGE_OPTIONS
          );
          return;
        }

        if (complicationFight.state === "level-retired") {
          await safeEditMessageText(
            ctx,
            presentFightLevelRetired(complicationFight),
            HTML_MESSAGE_OPTIONS
          );
          return;
        }

        await safeEditMessageText(ctx, presentFightNoCharacter(), HTML_MESSAGE_OPTIONS);
        return;
      }

      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_DEEP_LEVEL1,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
    } else {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_CHOICE
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureResult(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildAdventureResultKeyboard(result)
    });
    await sendLevelUpCelebration(ctx, result);

    if (complicationFight) {
      if (
        complicationFight.state === "persistent-active" ||
        complicationFight.state === "persistent-terminal"
      ) {
        if (complicationFight.state === "persistent-active" && complicationFight.started) {
          await ctx.reply(presentPersistentFightIntro(complicationFight), HTML_MESSAGE_OPTIONS);
        }

        await ctx.reply(presentPersistentFight(complicationFight), {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPersistentFightResultKeyboard(
            complicationFight.session,
            complicationFight.character
          )
        });
      }
    }
    return;
  }

  if (result.state !== "active-fight") {
    await markScenePresence(ctx, services.presence, {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CHOICE
    });
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentAdventureResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup:
      result.state === "combat-blocked"
        ? buildAdventureResultKeyboard({ state: "active-fight" })
        : buildAdventureResultKeyboard(result)
  });
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

async function handleFightCallback(
  ctx: Context,
  callback: FightCallback,
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

  if (callback.type === "passage") {
    const passageFight = placeCallbackToPersistentFightPassage(callback.passage);

    if (!passageFight) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    const gate =
      typeof services.fight.getFightOverviewForTelegramUser === "function"
        ? await services.fight.getFightOverviewForTelegramUser(telegramUserId)
        : await services.fight.getFightForTelegramUser(telegramUserId);

    if ("character" in gate && gate.character.level < 3) {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentKorchmaDeepLevelLocked(gate.character), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildBackToKorchmaHallKeyboard()
      });
      return;
    }

    const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);
    if (place.state !== "ready" || place.locationId !== passageFight.locationId) {
      await safeAnswerCallbackQuery(ctx);
      const currentPassage = place.state === "ready"
        ? presenceLocationToPersistentFightPassage(place.locationId)
        : null;
      if (currentPassage) {
        await sendPersistentFightPassagePreview(ctx, services, currentPassage, "edit");
        return;
      }
      if (gate.state === "persistent-ready") {
        await safeEditMessageText(ctx, presentPersistentFightDifficultyChoice(gate), {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPersistentFightDifficultyKeyboard()
        });
        return;
      }
      await sendFight(ctx, services.fight, "reply", {
        presence: services.presence,
        tavernRaid: services.tavern,
        requireKorchmaInterior: false
      });
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    const result = await services.fight.attackPersistentPassageEncounterForTelegramUser(
      telegramUserId,
      callback.encounterToken,
      {
        callbackOriginLocationId: passageFight.locationId,
        currentLocationId: place.locationId
      }
    );

    if (result.state === "persistent-preview") {
      const resultPassage = presenceLocationToPersistentFightPassage(result.originLocationId) ?? passageFight;
      await safeEditMessageText(ctx, presentPersistentFightPassagePreview(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightPassagePreviewKeyboard({
          passage: resultPassage.passage,
          encounterToken: result.encounterToken
        })
      });
      return;
    }

    if (result.state === "invalid-preview") {
      const currentPassage = presenceLocationToPersistentFightPassage(place.locationId);
      if (currentPassage) {
        await sendPersistentFightPassagePreview(ctx, services, currentPassage, "edit");
        return;
      }
      if (gate.state === "persistent-ready") {
        await safeEditMessageText(ctx, presentPersistentFightDifficultyChoice(gate), {
          ...HTML_MESSAGE_OPTIONS,
          reply_markup: buildPersistentFightDifficultyKeyboard()
        });
        return;
      }
      await sendFight(ctx, services.fight, "reply", {
        presence: services.presence,
        tavernRaid: services.tavern,
        requireKorchmaInterior: false
      });
      return;
    }

    if (result.state === "persistent-active") {
      await markScenePresence(ctx, services.presence, {
        locationId: resolvePersistentFightPresenceLocation(result.session),
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
    }
    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: false
    });
    await refreshCurrentMainMenuLocationKeyboard(ctx, services.presence);
    return;
  }

  if (callback.type === "view" || callback.type === "journal") {
    const result = await services.fight.getPersistentFightSnapshotForTelegramUser(
      telegramUserId,
      callback.sessionId
    );

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentFightNoCharacter());
      return;
    }

    if (result.state === "not-found") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, [
        "⚔️ Бій не знайшовся.",
        "",
        "Можливо, старий сувій уже прибрали зі столу. Спробуйте /fight ще раз."
      ].join("\n"));
      return;
    }

    if ((result.session.state?.status ?? result.session.status) === "active") {
      await markScenePresence(ctx, services.presence, {
        locationId: resolvePersistentFightPresenceLocation(result.session),
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
    }

    await safeAnswerCallbackQuery(ctx);

    if (callback.type === "journal") {
      await safeEditMessageText(ctx, presentPersistentFightJournal(result, callback.page), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightJournalKeyboard(result.session, callback.page)
      });
      return;
    }

    await safeEditMessageText(ctx, presentPersistentFightSnapshot(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildPersistentFightResultKeyboard(result.session, result.character)
    });
    return;
  }

  if (callback.type === "turn") {
    const yegerBefore = await getYegerProgressSnapshot(services.yeger, telegramUserId);
    const result = await services.fight.resolvePersistentFightTurn(telegramUserId, {
      sessionId: callback.sessionId,
      turn: callback.turn,
      action: callback.action
    });

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentFightNoCharacter());
      return;
    }

    if (result.state !== "not-found" && result.state !== "needs-rest") {
      await markScenePresence(ctx, services.presence, {
        locationId: resolvePersistentFightPresenceLocation(result.session),
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentPersistentFightTurn(result), {
      ...HTML_MESSAGE_OPTIONS,
      ...(result.state === "not-found" || result.state === "needs-rest"
        ? {}
        : {
            reply_markup: buildPersistentFightResultKeyboard(result.session, result.character)
          })
    });
    const progressMessage =
      result.state === "updated" && result.session.state?.status === "won"
        ? await presentWonFightQuestProgressAfterFight(result, services, telegramUserId, yegerBefore)
        : null;

    if (progressMessage) {
      await ctx.reply(progressMessage.text, {
        ...HTML_MESSAGE_OPTIONS,
        ...(progressMessage.replyMarkup ? { reply_markup: progressMessage.replyMarkup } : {})
      });
    }

    if (result.state === "updated" && result.fightReward?.levelChange) {
      await sendLevelUpCelebration(ctx, {
        levelChange: result.fightReward.levelChange,
        character: result.character
      });
    }
    return;
  }

  const result = await services.fight.completeMimicShawarma(telegramUserId, callback.action);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentFightNoCharacter());
    return;
  }

  if (result.state === "level-retired") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentFightLevelRetired(result), HTML_MESSAGE_OPTIONS);
    return;
  }

  await markScenePresence(ctx, services.presence, {
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
  });

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentFightResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildFightResultKeyboard(result.state, result.character)
  });
  if (result.state === "completed") {
    await sendLevelUpCelebration(ctx, result);
  }
}

type YegerProgressSnapshot = { wins: number; target: number } | null;
type FightQuestProgressAfterFightMessage = {
  text: string;
  replyMarkup?: InlineKeyboard;
};

async function getYegerProgressSnapshot(
  yeger: Pick<YegerQuestService, "getForTelegramUser"> | undefined,
  telegramUserId: bigint
): Promise<YegerProgressSnapshot> {
  if (!yeger) {
    return null;
  }

  const result = await yeger.getForTelegramUser(telegramUserId);

  if (result.state !== "in-progress" && result.state !== "turn-in-ready") {
    return null;
  }

  return result.progress;
}

async function presentWonFightQuestProgressAfterFight(
  result: Extract<PersistentFightTurnResult, { state: "updated" }>,
  services: BotServices,
  telegramUserId: bigint,
  yegerBefore: YegerProgressSnapshot
): Promise<FightQuestProgressAfterFightMessage | null> {
  const entries: QuestProgressAfterFightEntry[] = [];
  const problemEntry = buildProblemQuestProgressAfterFightEntry(result.questProgress);

  if (problemEntry) {
    entries.push(problemEntry);
  }

  if (result.monster && isYegerUnquietTarget(result.monster) && yegerBefore) {
    const yegerAfter = await getYegerProgressSnapshot(services.yeger, telegramUserId);

    if (yegerAfter && yegerAfter.wins > yegerBefore.wins) {
      entries.push({
        title: "Неспокійні справи",
        wins: yegerAfter.wins,
        target: yegerAfter.target,
        completed: yegerAfter.wins >= yegerAfter.target,
        ...(yegerAfter.wins >= yegerAfter.target
          ? { readyHint: "Єгер чекає дощечку.", action: "yeger" as const }
          : {})
      });
    }
  }

  const text = presentQuestProgressAfterFight(entries);

  if (!text) {
    return null;
  }

  const replyMarkup = buildQuestProgressAfterFightKeyboard(entries);

  return {
    text,
    ...(replyMarkup ? { replyMarkup } : {})
  };
}

function buildQuestProgressAfterFightKeyboard(
  entries: readonly QuestProgressAfterFightEntry[]
): InlineKeyboard | null {
  const actions = new Set(
    entries
      .filter((entry) => entry.completed && entry.action)
      .map((entry) => entry.action)
  );

  if (actions.size === 0) {
    return null;
  }

  const keyboard = new InlineKeyboard();

  if (actions.has("bar")) {
    keyboard.text("🍻 До шинку", makePlaceCallbackData("bar")).row();
  }

  if (actions.has("yeger")) {
    keyboard.text("🏹 До Єгеря", makeQuestCallbackData("hunt")).row();
  }

  return keyboard;
}

async function handleHuntCallback(
  ctx: Context,
  callback: HuntCallback,
  services: BotServices
): Promise<void> {
  void callback;
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, services.tavern)) {
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await sendHuntBoard(ctx, services.yeger, "edit", {
    presence: services.presence,
    tavernRaid: services.tavern,
    requireKorchmaInterior: false
  });
}

async function handleYegerCallback(
  ctx: Context,
  callback: YegerCallback,
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

  const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentYegerNoCharacter());
    return;
  }

  if (!place.insideKorchma && callback.type !== "outside" && callback.type !== "track") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentKorchmaQuestGate(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildEnterKorchmaKeyboard()
    });
    return;
  }

  if (callback.type === "open") {
    await safeAnswerCallbackQuery(ctx);
    await sendYegerCorner(ctx, services.yeger, "edit", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: false
    });
    return;
  }

  if (callback.type === "quest") {
    await safeAnswerCallbackQuery(ctx);
    const quest = await services.yeger.getForTelegramUser(telegramUserId);

    if (quest.state === "no-character") {
      await safeEditMessageText(ctx, presentYegerNoCharacter());
      return;
    }

    await markYegerCornerPresence(ctx, services.presence);
    await safeEditMessageText(ctx, presentYegerQuest(quest), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildYegerKeyboard(quest)
    });
    return;
  }

  if (callback.type === "outside") {
    await safeAnswerCallbackQuery(ctx);
    await sendHuntBoard(ctx, services.yeger, "edit", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: false
    });
    return;
  }

  if (callback.type === "help") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentYegerHelp(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildYegerHelpKeyboard()
    });
    return;
  }

  if (callback.type === "start") {
    const result = await services.yeger.startForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx);
    await markYegerCornerPresence(ctx, services.presence);
    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentYegerStart(result), HTML_MESSAGE_OPTIONS);
      return;
    }

    await safeEditMessageText(ctx, presentYegerStart(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildYegerKeyboard(result)
    });
    return;
  }

  if (callback.type === "track") {
    const quest = await services.yeger.getForTelegramUser(telegramUserId);

    if (quest.state !== "in-progress") {
      await safeAnswerCallbackQuery(ctx);

      if (quest.state === "no-character") {
        await safeEditMessageText(ctx, presentYegerNoCharacter());
        return;
      }

      await safeEditMessageText(ctx, presentYegerQuest(quest), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerKeyboard(quest)
      });
      return;
    }

    const result = await services.yeger.trackForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx);
    await markHuntPresence(ctx, services.presence);

    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentYegerNoCharacter());
      return;
    }

    if (result.state === "not-in-progress") {
      await safeEditMessageText(ctx, presentYegerQuest(result.quest), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerKeyboard(result.quest)
      });
      return;
    }

    if (result.state === "tracking-started" || result.state === "tracking-pending") {
      await safeEditMessageText(ctx, presentYegerTrackingPending(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerHuntKeyboard({
          state: "in-progress",
          character: result.character,
          progress: result.progress,
          tracking: result.tracking
        })
      });
      return;
    }

    if (result.state === "tracking-resolved-none") {
      await safeEditMessageText(ctx, presentYegerTrackingNone(result), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerHuntKeyboard({
          state: "in-progress",
          character: result.character,
          progress: result.progress,
          tracking: result.tracking
        })
      });
      return;
    }

    if (result.state === "tracking-blocked-by-other-fight") {
      await safeEditMessageText(ctx, presentYegerTrackingBlockedByOtherFight(), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerHuntKeyboard({
          state: "in-progress",
          character: result.character,
          progress: result.progress,
          tracking: result.tracking
        })
      });
      if (result.fight.state === "persistent-active" && result.fight.started) {
        await ctx.reply(presentPersistentFightIntro(result.fight), HTML_MESSAGE_OPTIONS);
      }

      await ctx.reply(presentPersistentFight(result.fight), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightResultKeyboard(result.fight.session, result.fight.character)
      });
      return;
    }

    if (result.state === "tracking-blocked-by-monster-rest") {
      await safeEditMessageText(ctx, presentFightMonsterRest(result.fight), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (result.state !== "tracking-resolved-success") {
      await safeEditMessageText(ctx, "Слід охолов.\n\nЄгер мовчить так переконливо, що навіть мапа перестала шарудіти.", {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildYegerHelpKeyboard()
      });
      return;
    }

    const fight = result.fight;

    if (fight.state === "level-retired") {
      await safeEditMessageText(ctx, presentFightLevelRetired(fight), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (fight.state === "needs-rest") {
      await safeEditMessageText(ctx, presentFightNeedsRest(fight), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (fight.state === "monster-rest") {
      await safeEditMessageText(ctx, presentFightMonsterRest(fight), HTML_MESSAGE_OPTIONS);
      return;
    }

    if (fight.state === "persistent-active" || fight.state === "persistent-terminal") {
      const trackingIntro = fight.monster && isYegerUnquietTarget(fight.monster)
        ? presentYegerTrackingStart({
            yegerProgress: result.progress,
            thirteenProgress: fight.questProgress
          })
        : presentYegerTrackingBlockedByOtherFight();

      await safeEditMessageText(ctx, trackingIntro, HTML_MESSAGE_OPTIONS);
      if (fight.state === "persistent-active" && fight.started) {
        await ctx.reply(presentPersistentFightIntro(fight), HTML_MESSAGE_OPTIONS);
      }

      await ctx.reply(presentPersistentFight(fight), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildPersistentFightResultKeyboard(fight.session, fight.character)
      });
      return;
    }

    await safeEditMessageText(ctx, "Слід охолов.\n\nЄгер мовчить так переконливо, що навіть мапа перестала шарудіти.", {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildYegerHelpKeyboard()
    });
    return;
  }

  const result = await services.yeger.turnInForTelegramUser(telegramUserId);
  await safeAnswerCallbackQuery(ctx);
  await markYegerCornerPresence(ctx, services.presence);
  if (result.state === "no-character") {
    await safeEditMessageText(ctx, presentYegerTurnIn(result), HTML_MESSAGE_OPTIONS);
    return;
  }

  await safeEditMessageText(ctx, presentYegerTurnIn(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildYegerTurnInKeyboard(result)
  });
  if (result.state === "completed" && result.levelChange) {
    await sendLevelUpCelebration(ctx, {
      character: result.character,
      levelChange: result.levelChange
    });
  }
}

async function handleBestiaryCallback(
  ctx: Context,
  callback: BestiaryCallback,
  heroService: HeroService
): Promise<void> {
  await safeAnswerCallbackQuery(ctx);

  if (callback.type === "list") {
    await sendBestiaryListGated(ctx, heroService, "edit", callback.page);
    return;
  }

  await sendBestiaryMonsterGated(ctx, heroService, "edit", callback.monsterId, callback.page);
}

async function sendLevelUpCelebration(
  ctx: Context,
  result: {
    levelChange: Parameters<typeof presentLevelUpCelebration>[0];
    character: { classId: string; raceId?: string; path?: CharacterPath };
  }
): Promise<void> {
  const identity = {
    ...(result.character.raceId ? { raceId: result.character.raceId } : {}),
    ...(result.character.path ? { path: result.character.path } : {})
  };
  const text = presentLevelUpCelebration(result.levelChange, result.character.classId, identity);

  if (!text) {
    return;
  }

  await ctx.reply(text, HTML_MESSAGE_OPTIONS);
}

async function markScenePresence(
  ctx: Context,
  presenceService: PresenceService,
  context: PresenceContext
): Promise<void> {
  const player = playerFromContext(ctx.from);

  if (!player) {
    return;
  }

  await presenceService.markAction({
    user: player,
    ...context
  });
}

async function handleDevResetCallback(
  ctx: Context,
  action: "confirm" | "cancel",
  devResetService: DevResetService
): Promise<void> {
  if (action === "cancel") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentDevResetCancelled());
    return;
  }

  const player = playerFromContext(ctx.from);

  if (!player) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await devResetService.resetCurrentUser(player.telegramUserId);
  const message =
    result.state === "disabled"
      ? presentDevResetDisabled()
      : result.state === "deleted"
        ? presentDevResetDeleted()
        : presentDevResetNoCharacter();

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, message);
}

async function handleRestartCallback(
  ctx: Context,
  action: "confirm" | "cancel",
  restartService: RestartService
): Promise<void> {
  if (action === "cancel") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentRestartCancelled());
    return;
  }

  const player = playerFromContext(ctx.from);

  if (!player) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await restartService.restartCurrentUser(player.telegramUserId);
  const message =
    result.state === "deleted" ? presentRestartDeleted() : presentRestartNoCharacter();

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, message);
}

async function handleRemortCallback(
  ctx: Context,
  callback: RemortCallback,
  remortService: RemortService,
  tavernRaidService: TavernRaidService
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (await editPendingRaidBlockIfNeeded(ctx, telegramUserId, tavernRaidService)) {
    return;
  }

  if (callback.type === "open") {
    const result = await remortService.openForTelegramUser(telegramUserId);
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentRemortUpdate(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildRemortKeyboard(result)
    });
    return;
  }

  if (callback.type === "confirm") {
    const result = await remortService.confirmForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(
      ctx,
      result.state === "completed" || result.state === "replayed"
        ? { text: result.state === "replayed" ? "Цей реморт уже записано." : "Реморт записано." }
        : { show_alert: result.state !== "invalid-draft" }
    );
    await safeEditMessageText(ctx, presentRemortConfirm(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildRemortResultKeyboard()
    });
    return;
  }

  const result =
    callback.type === "pronoun"
      ? await remortService.selectPronoun(telegramUserId, callback.token, callback.pronoun)
      : callback.type === "race"
        ? await remortService.selectRace(telegramUserId, callback.token, callback.raceKey)
        : callback.type === "class"
          ? await remortService.selectClass(telegramUserId, callback.token, callback.classKey)
          : await remortService.toggleItem(telegramUserId, callback.token, callback.itemKey);

  await safeAnswerCallbackQuery(
    ctx,
    result.state === "invalid-selection" ? { text: result.reason, show_alert: true } : undefined
  );
  const keyboardResult =
    result.state === "invalid-selection"
      ? result.view ?? { state: "no-character" as const }
      : result;
  await safeEditMessageText(ctx, presentRemortUpdate(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildRemortKeyboard(keyboardResult)
  });
}
