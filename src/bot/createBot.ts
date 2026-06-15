import { Bot, type Context } from "grammy";
import type { AdventureService } from "../services/adventureService";
import type { CellarErrandService } from "../services/cellarErrandService";
import type {
  CellarGrownupQuestAction,
  CellarGrownupQuestResult,
  CellarGrownupQuestService
} from "../services/cellarGrownupQuestService";
import type { DevResetService } from "../services/devResetService";
import type { FightService } from "../services/fightService";
import type { HeroService } from "../services/heroService";
import type { HuntService } from "../services/huntService";
import type { EquipmentService } from "../services/equipmentService";
import type { InventoryService } from "../services/inventoryService";
import type { MantokChestService } from "../services/mantokChestService";
import type { OnboardingService } from "../services/onboardingService";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_ADVENTURE_MIMIC_SHAWARMA,
  PRESENCE_ADVENTURE_SOLO_FIGHT,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_FRONT,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_RAID_FRIDAY_BARREL,
  type MarkPlayerPresenceInput,
  type PresenceService
} from "../services/presenceService";
import type { RestartService } from "../services/restartService";
import type { TavernRaidService } from "../services/tavernRaidService";
import { createBarrelRaidCompletionScheduler } from "./barrelRaidCompletionNotifier";
import { parseAdventureCallbackData, type AdventureCallback } from "./callbacks/adventureCallbackData";
import { parseBestiaryCallbackData, type BestiaryCallback } from "./callbacks/bestiaryCallbackData";
import { parseCellarCallbackData, type CellarCallback } from "./callbacks/cellarCallbackData";
import { parseDevResetCallbackData } from "./callbacks/devResetCallbackData";
import { parseFightCallbackData, type FightCallback } from "./callbacks/fightCallbackData";
import { parseHuntCallbackData, type HuntCallback } from "./callbacks/huntCallbackData";
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
import { parseMenuCallbackData } from "./callbacks/menuCallbackData";
import { parseNewsCallbackData } from "./callbacks/newsCallbackData";
import { parsePlaceCallbackData, type PlaceCallback } from "./callbacks/placeCallbackData";
import { parseQuestCallbackData, type QuestCallback } from "./callbacks/questCallbackData";
import {
  parseOnboardingCallbackData,
  type OnboardingCallback
} from "./callbacks/onboardingCallbackData";
import { parseRestartCallbackData } from "./callbacks/restartCallbackData";
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
import { registerEquipmentCommand, sendEquipment } from "./commands/equipmentCommand";
import { registerFightCommand, sendFight } from "./commands/fightCommand";
import { registerHelpCommand } from "./commands/helpCommand";
import { registerHeroCommand, sendHero } from "./commands/heroCommand";
import { registerHuntCommand, markHuntPresence, sendHuntBoard } from "./commands/huntCommand";
import { registerInventoryCommand, sendInventory } from "./commands/inventoryCommand";
import { registerLookCommand } from "./commands/lookCommand";
import { registerNewsCommand, sendNewsEntry, sendNewsList } from "./commands/newsCommand";
import { registerOnlineCommand, sendOnline } from "./commands/onlineCommand";
import { registerPlannedCommands } from "./commands/plannedCommand";
import { registerQuestHubCommand, sendQuestHub } from "./commands/questHubCommand";
import { registerRestartCommand } from "./commands/restartCommand";
import { registerStartCommand } from "./commands/startCommand";
import {
  registerTavernCommand,
  sendKorchmaArrivalBoard,
  sendKorchmaFront,
  sendTavern,
  sendTavernBarrel
} from "./commands/tavernCommand";
import { registerVersionCommand } from "./commands/versionCommand";
import { playerFromContext } from "./context";
import {
  buildAdventureParticipantsKeyboard,
  buildAdventureResultKeyboard
} from "./keyboards/adventureKeyboard";
import {
  buildCellarParticipantsKeyboard,
  buildCellarGrownupKeyboard,
  buildCellarResultKeyboard
} from "./keyboards/cellarKeyboard";
import { buildFightResultKeyboard, buildPersistentFightResultKeyboard } from "./keyboards/fightKeyboard";
import { buildHuntResultKeyboard } from "./keyboards/huntKeyboard";
import { buildEquipmentKeyboard, buildItemDetailKeyboard } from "./keyboards/inventoryKeyboard";
import {
  buildMantokChestHelpKeyboard,
  buildMantokChestOverviewKeyboard,
  buildMantokChestPreviewKeyboard,
  buildMantokChestResultKeyboard
} from "./keyboards/mantokChestKeyboard";
import {
  buildClassKeyboard,
  buildConfirmationKeyboard,
  buildGenderKeyboard,
  buildRaceKeyboard
} from "./keyboards/onboardingKeyboard";
import { buildMainMenuKeyboard, mainMenuButtons } from "./keyboards/mainMenuKeyboard";
import {
  buildKorchmaFrontKeyboard,
  buildKorchmaRoundOfferKeyboard,
  buildKorchmaRoundResultKeyboard,
  buildTavernParticipantsKeyboard,
  buildTavernRangerKeyboard,
  buildTavernResultKeyboard
} from "./keyboards/tavernKeyboard";
import {
  presentAdventureLevelRetired,
  presentAdventureNoCharacter,
  presentAdventureResult
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
  presentFightLevelRetired,
  presentFightNoCharacter,
  presentFightResult,
  presentPersistentFightTurn
} from "./presenters/fightPresenter";
import {
  presentHuntLevelLocked,
  presentHuntNoCharacter,
  presentHuntResult
} from "./presenters/huntPresenter";
import { presentHelp } from "./presenters/helpPresenter";
import {
  presentEquipment,
  presentEquipItemResult,
  presentUnequipSlotResult
} from "./presenters/equipmentPresenter";
import { presentItemDetail } from "./presenters/itemDetailPresenter";
import { presentLevelUpCelebration } from "./presenters/levelGrowthPresenter";
import {
  presentMantokChestHelp,
  presentMantokChestOverview,
  presentMantokChestPreview,
  presentMantokChestRecycleResult
} from "./presenters/mantokChestPresenter";
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
import { presentParticipants } from "./presenters/presencePresenter";
import {
  presentTavernNoCharacter,
  presentPendingRaidActionBlock,
  presentTavernRanger,
  presentTavernRaidResult,
  presentTavernRoundOffer,
  presentTavernRoundResult
} from "./presenters/tavernPresenter";
import { safeAnswerCallbackQuery } from "./safeAnswerCallbackQuery";
import { safeEditMessageText } from "./safeEditMessageText";

export interface BotServices {
  adventure: AdventureService;
  cellarErrand: CellarErrandService;
  cellarGrownup?: CellarGrownupQuestService;
  fight: FightService;
  hunt: HuntService;
  onboarding: OnboardingService;
  hero: HeroService;
  equipment: EquipmentService;
  inventory: InventoryService;
  mantokChest: MantokChestService;
  presence: PresenceService;
  devReset: DevResetService;
  restart: RestartService;
  tavern: TavernRaidService;
}

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

type PresenceContext = Omit<MarkPlayerPresenceInput, "user">;
const barrelRaidCompletionScheduler = createBarrelRaidCompletionScheduler();

export function createBot(token: string, services: BotServices): Bot {
  const bot = new Bot(token);

  bot.catch((error) => {
    console.error("Квестарня: помилка в Telegram middleware.", error.error);
  });

  registerPresenceMiddleware(bot, services.presence);
  registerAdventureCommand(bot, services.adventure, {
    cellarErrand: services.cellarErrand,
    presence: services.presence,
    tavernRaid: services.tavern
  });
  registerFightCommand(bot, services.fight, {
    presence: services.presence,
    tavernRaid: services.tavern
  });
  registerHuntCommand(bot, services.hunt, {
    presence: services.presence,
    tavernRaid: services.tavern
  });
  registerBestiaryCommand(bot, services.hero);
  registerCellarCommand(
    bot,
    services.cellarErrand,
    services.presence,
    services.tavern,
    services.cellarGrownup
  );
  registerQuestHubCommand(bot, {
    adventure: services.adventure,
    cellarErrand: services.cellarErrand,
    fight: services.fight,
    hunt: services.hunt,
    presence: services.presence,
    tavernRaid: services.tavern
  });
  registerStartCommand(bot, services.onboarding);
  registerHeroCommand(bot, services.hero);
  registerInventoryCommand(bot, services.inventory);
  registerEquipmentCommand(bot, services.equipment);
  registerOnlineCommand(bot, services.presence);
  registerLookCommand(bot, services.presence);
  registerHelpCommand(bot, services.devReset);
  registerNewsCommand(bot);
  registerVersionCommand(bot);
  registerDevResetCommand(bot, services.devReset);
  registerRestartCommand(bot);
  registerTavernCommand(bot, services.tavern, services.presence);
  registerPlannedCommands(bot);
  registerMainMenuKeyboard(bot, services);

  bot.callbackQuery(/^v1:onb:/, async (ctx) => {
    const parsed = parseOnboardingCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleOnboardingCallback(ctx, parsed.value, services.onboarding);
  });

  bot.callbackQuery(/^v1:menu:/, async (ctx) => {
    const parsed = parseMenuCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleMenuCallback(ctx, parsed.value, services);
  });

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

  bot.callbackQuery(/^v1:news:/, async (ctx) => {
    const parsed = parseNewsCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await safeAnswerCallbackQuery(ctx);

    if (parsed.value.type === "list") {
      await sendNewsList(ctx, parsed.value.page);
      return;
    }

    await sendNewsEntry(ctx, parsed.value.entryIndex, parsed.value.listPage);
  });

  bot.callbackQuery(/^v1:tavern:/, async (ctx) => {
    const parsed = parseTavernCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleTavernCallback(ctx, parsed.value, services.tavern, services.presence, bot);
  });

  bot.callbackQuery(/^v1:adv:/, async (ctx) => {
    const parsed = parseAdventureCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleAdventureCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:place:/, async (ctx) => {
    const parsed = parsePlaceCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handlePlaceCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:quest:/, async (ctx) => {
    const parsed = parseQuestCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleQuestCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:cellar:/, async (ctx) => {
    const parsed = parseCellarCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleCellarCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:fight:/, async (ctx) => {
    const parsed = parseFightCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleFightCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:hunt:/, async (ctx) => {
    const parsed = parseHuntCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleHuntCallback(ctx, parsed.value, services);
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

  return bot;
}

function registerPresenceMiddleware(bot: Bot, presenceService: PresenceService): void {
  bot.use(async (ctx, next) => {
    const player = playerFromContext(ctx.from);
    const presenceContext = getPresenceContext(ctx);

    if (player && presenceContext) {
      try {
        await presenceService.markAction({
          user: player,
          ...presenceContext
        });
      } catch (error) {
        console.error("Квестарня: присутність гравця не оновилась.", error);
      }
    }

    await next();
  });
}

function getPresenceContext(ctx: Context): PresenceContext | null {
  const callbackData = ctx.callbackQuery?.data;

  if (callbackData) {
    return getCallbackPresenceContext(callbackData);
  }

  const text = ctx.message?.text?.trim();

  if (!text) {
    return null;
  }

  return getTextPresenceContext(text);
}

function getCallbackPresenceContext(data: string): PresenceContext | null {
  if (data.startsWith("v1:tavern:round")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:tavern:raid" || data === "v1:tavern:participants") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
      currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
      currentAdventureId: null
    };
  }

  if (data === "v1:tavern:ranger") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data.startsWith("v1:adv:mimic:")) {
    return {};
  }

  if (data.startsWith("v1:cellar:")) {
    return {};
  }

  if (data.startsWith("v1:fight:mimic:")) {
    return {};
  }

  if (data.startsWith("v1:fight:turn:")) {
    return {};
  }

  if (data.startsWith("v1:hunt:")) {
    return {};
  }

  if (data.startsWith("v1:bst:")) {
    return {};
  }

  if (data.startsWith("v1:quest:")) {
    return {};
  }

  if (data.startsWith("v1:item:") || data.startsWith("v1:equip:") || data.startsWith("v1:chest:")) {
    return {};
  }

  if (data.startsWith("v1:onb:")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:menu:tavern") {
    return {};
  }

  if (data === "v1:place:hall") {
    return {};
  }

  if (data === "v1:place:front") {
    return {};
  }

  if (data === "v1:place:quest-table") {
    return {};
  }

  if (data === "v1:place:barrel") {
    return {};
  }

  if (data === "v1:place:cellar") {
    return {};
  }

  if (data === "v1:place:news-corner") {
    return {};
  }

  if (data.startsWith("v1:news:")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (
    data.startsWith("v1:menu:") ||
    data.startsWith("v1:devreset:") ||
    data.startsWith("v1:restart:")
  ) {
    return {};
  }

  return null;
}

function getTextPresenceContext(text: string): PresenceContext | null {
  const command = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s|$)/i)?.[1]?.toLowerCase();

  if (command) {
    return getCommandPresenceContext(command);
  }

  if (text === mainMenuButtons.tavern) {
    return {};
  }

  if (text === mainMenuButtons.quest) {
    return {};
  }

  if (
    text === mainMenuButtons.hero ||
    text === mainMenuButtons.inventory ||
    text === mainMenuButtons.participants ||
    text === mainMenuButtons.help
  ) {
    return {};
  }

  return null;
}

function getCommandPresenceContext(command: string): PresenceContext | null {
  if (command === "start") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (command === "tavern") {
    return {};
  }

  if (command === "raid") {
    return {};
  }

  if (command === "adventure" || command === "quest" || command === "cellar") {
    return {};
  }

  if (command === "fight" || command === "hunt" || command === "bestiary" || command === "monsters") {
    return {};
  }

  if (command === "news") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (
    command === "hero" ||
    command === "profile" ||
    command === "me" ||
    command === "inventory" ||
    command === "items" ||
    command === "bag" ||
    command === "equipment" ||
    command === "gear" ||
    command === "equip" ||
    command === "guild" ||
    command === "online" ||
    command === "look" ||
    command === "help" ||
    command === "version" ||
    command === "restart" ||
    command === "dev_reset_me"
  ) {
    return {};
  }

  return null;
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
    await safeEditMessageText(ctx, presentHelp(services.devReset.isEnabled()));
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
    await sendInventory(ctx, services.inventory, "edit", action.page);
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await services.inventory.getItemForTelegramUser(telegramUserId, action.itemId);
  const equipment = await services.equipment.getEquipmentForTelegramUser(telegramUserId);
  const equippedSlot =
    equipment.state === "ready"
      ? (equipment.slots.find((slot) => slot.item?.itemId === action.itemId)?.slot ?? null)
      : null;

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentItemDetail(result, { equippedSlot }), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemDetailKeyboard(result, equippedSlot, action.page)
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

    await safeAnswerCallbackQuery(ctx, {
      text: presentEquipItemResult(result),
      show_alert: result.state !== "equipped"
    });

    if (result.state === "equipped") {
      const equipment = await services.equipment.getEquipmentForTelegramUser(telegramUserId);
      await safeEditMessageText(ctx, presentEquipment(equipment), {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildEquipmentKeyboard(equipment)
      });
    }
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
      : { show_alert: result.state === "invalid-token" || result.state === "stale-inputs" }
  );
  const outputItem =
    result.state === "recycled" || result.state === "replayed" ? result.outputItem : null;

  await safeEditMessageText(ctx, presentMantokChestRecycleResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildMantokChestResultKeyboard(outputItem)
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

  if (action === "hall") {
    await sendTavern(ctx, services.tavern, services.presence, "edit");
    return;
  }

  if (action === "front") {
    await sendKorchmaFront(ctx, services.tavern, services.presence, "edit");
    return;
  }

  if (action === "arrivals") {
    await sendKorchmaArrivalBoard(ctx, services.tavern, services.presence, "edit");
    return;
  }

  if (action === "barrel") {
    await sendTavernBarrel(ctx, services.tavern, services.presence, "reply");
    return;
  }

  if (action === "quest-table") {
    await sendQuestHub(
      ctx,
      {
        adventure: services.adventure,
        cellarErrand: services.cellarErrand,
        fight: services.fight,
        hunt: services.hunt,
        presence: services.presence,
        tavernRaid: services.tavern
      },
      "edit"
    );
    return;
  }

  if (action === "cellar") {
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
    return;
  }

  await sendNewsList(ctx, 0);
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

  if (action === "fight") {
    await sendFight(ctx, services.fight, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: true
    });
    return;
  }

  if (action === "hunt") {
    await sendHuntBoard(ctx, services.hunt, "reply", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: true
    });
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
}

function registerMainMenuKeyboard(bot: Bot, services: BotServices): void {
  bot.hears(mainMenuButtons.hero, async (ctx) => {
    await sendHero(ctx, services.hero, "reply");
  });

  bot.hears(mainMenuButtons.tavern, async (ctx) => {
    await sendTavern(ctx, services.tavern, services.presence, "reply");
  });

  bot.hears(mainMenuButtons.quest, async (ctx) => {
    await sendQuestHub(
      ctx,
      {
        adventure: services.adventure,
        cellarErrand: services.cellarErrand,
        fight: services.fight,
        hunt: services.hunt,
        presence: services.presence,
        tavernRaid: services.tavern
      },
      "reply"
    );
  });

  bot.hears(mainMenuButtons.inventory, async (ctx) => {
    await sendInventory(ctx, services.inventory, "reply");
  });

  bot.hears(mainMenuButtons.participants, async (ctx) => {
    await sendOnline(ctx, services.presence);
  });

  bot.hears(mainMenuButtons.help, async (ctx) => {
    await ctx.reply(presentHelp(services.devReset.isEnabled()), {
      reply_markup: buildMainMenuKeyboard()
    });
  });
}

async function handleTavernCallback(
  ctx: Context,
  action: TavernCallback,
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService,
  bot: Bot
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
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
    const result = await tavernRaidService.getTavernForTelegramUser(telegramUserId);

    if (result.state === "no-character") {
      await safeAnswerCallbackQuery(ctx);
      await safeEditMessageText(ctx, presentTavernNoCharacter());
      return;
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentTavernRanger(result.character), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildTavernRangerKeyboard()
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
    barrelRaidCompletionScheduler.schedule({
      bot,
      chatId: ctx.callbackQuery?.message?.chat.id ?? ctx.chat?.id,
      telegramUserId,
      periodId: result.periodId,
      availableAt: result.availableAt,
      now: result.now,
      tavernRaidService
    });
  }

  if (result.state === "completed") {
    await sendLevelUpCelebration(ctx, result);
  }
}

async function editPendingRaidBlockIfNeeded(
  ctx: Context,
  telegramUserId: bigint,
  tavernRaidService: TavernRaidService
): Promise<boolean> {
  const pending = await tavernRaidService.getActivePendingFridayBarrelRaidForTelegramUser(
    telegramUserId
  );

  if (pending.state !== "pending") {
    return false;
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentPendingRaidActionBlock(pending), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildTavernResultKeyboard("pending")
  });
  return true;
}

async function handleAdventureCallback(
  ctx: Context,
  action: AdventureCallback,
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

  if (action === "participants") {
    const snapshot = await services.presence.getAdventureParticipantsForTelegramUser(
      telegramUserId,
      PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    );

    if (snapshot.state !== "no-character") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentParticipants(snapshot), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildAdventureParticipantsKeyboard()
    });
    return;
  }

  const result = await services.adventure.completeMimicShawarma(telegramUserId, action);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureNoCharacter());
    return;
  }

  if (result.state === "level-retired") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureLevelRetired(result), HTML_MESSAGE_OPTIONS);
    return;
  }

  await markScenePresence(ctx, services.presence, {
    locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
    currentRaidId: null,
    currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
  });

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentAdventureResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildAdventureResultKeyboard(result.state, result.character)
  });
  if (result.state === "completed") {
    await sendLevelUpCelebration(ctx, result);
  }
}

async function handleCellarCallback(
  ctx: Context,
  action: CellarCallback,
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
      if (isCellarGrownupAction(action)) {
        await handleCellarGrownupCallback(ctx, action, services);
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

  if (action === "participants") {
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

  if (isCellarGrownupAction(action)) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await services.cellarErrand.complete(telegramUserId, action);

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
    reply_markup: buildCellarResultKeyboard(result.state, result.character)
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
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    });
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentCellarGrownupResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    ...(getCellarGrownupKeyboardState(result)
      ? { reply_markup: buildCellarGrownupKeyboard(getCellarGrownupKeyboardState(result)!) }
      : {})
  });

  if (result.state === "completed") {
    await sendLevelUpCelebration(ctx, result);
  }
}

function isCellarGrownupAction(action: CellarCallback): action is CellarGrownupQuestAction {
  return action.startsWith("grownup-");
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

  if (callback.type === "turn") {
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

    if (result.state !== "not-found") {
      await markScenePresence(ctx, services.presence, {
        locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
        currentRaidId: null,
        currentAdventureId: PRESENCE_ADVENTURE_SOLO_FIGHT
      });
    }

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentPersistentFightTurn(result), {
      ...HTML_MESSAGE_OPTIONS,
      ...(result.state === "not-found"
        ? {}
        : {
            reply_markup: buildPersistentFightResultKeyboard(result.session, result.character)
          })
    });
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

async function handleHuntCallback(
  ctx: Context,
  callback: HuntCallback,
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

  if (callback.type === "view") {
    await safeAnswerCallbackQuery(ctx);
    await sendHuntBoard(ctx, services.hunt, "edit", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: true
    });
    return;
  }

  if (callback.type === "legacy-view") {
    await safeAnswerCallbackQuery(ctx);
    await sendHuntBoard(ctx, services.hunt, "edit", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: true
    });
    return;
  }

  if (callback.type === "legacy-action") {
    await safeAnswerCallbackQuery(ctx);
    await sendHuntBoard(ctx, services.hunt, "edit", {
      presence: services.presence,
      tavernRaid: services.tavern,
      requireKorchmaInterior: true
    });
    return;
  }

  const place = await services.presence.getCurrentPlaceForTelegramUser(telegramUserId);

  if (place.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentHuntNoCharacter());
    return;
  }

  if (!place.insideKorchma) {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentKorchmaQuestGate(), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildKorchmaFrontKeyboard()
    });
    return;
  }

  const result = await services.hunt.completeHuntContract(
    telegramUserId,
    callback.localPeriodId,
    callback.type === "action" ? callback.contractToken : null,
    callback.action
  );

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentHuntNoCharacter());
    return;
  }

  if (result.state === "level-locked") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentHuntLevelLocked(result), HTML_MESSAGE_OPTIONS);
    return;
  }

  if (result.state !== "stale-period") {
    await markHuntPresence(ctx, services.presence);
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentHuntResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildHuntResultKeyboard(result)
  });
  if (result.state === "completed") {
    await sendLevelUpCelebration(ctx, result);
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
    character: { classId: string };
  }
): Promise<void> {
  const text = presentLevelUpCelebration(result.levelChange, result.character.classId);

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
