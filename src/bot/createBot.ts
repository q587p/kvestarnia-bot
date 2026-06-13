import { Bot, type Context } from "grammy";
import type { AdventureService } from "../services/adventureService";
import type { CellarErrandService } from "../services/cellarErrandService";
import type { DevResetService } from "../services/devResetService";
import type { FightService } from "../services/fightService";
import type { HeroService } from "../services/heroService";
import type { InventoryService } from "../services/inventoryService";
import type { OnboardingService } from "../services/onboardingService";
import {
  PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND,
  PRESENCE_ADVENTURE_MIMIC_FIGHT,
  PRESENCE_ADVENTURE_MIMIC_SHAWARMA,
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
import { parseAdventureCallbackData, type AdventureCallback } from "./callbacks/adventureCallbackData";
import { parseCellarCallbackData, type CellarCallback } from "./callbacks/cellarCallbackData";
import { parseDevResetCallbackData } from "./callbacks/devResetCallbackData";
import { parseFightCallbackData } from "./callbacks/fightCallbackData";
import { parseMenuCallbackData } from "./callbacks/menuCallbackData";
import { parseNewsCallbackData } from "./callbacks/newsCallbackData";
import { parsePlaceCallbackData, type PlaceCallback } from "./callbacks/placeCallbackData";
import {
  parseOnboardingCallbackData,
  type OnboardingCallback
} from "./callbacks/onboardingCallbackData";
import { parseRestartCallbackData } from "./callbacks/restartCallbackData";
import { parseTavernCallbackData } from "./callbacks/tavernCallbackData";
import { registerAdventureCommand, sendAdventure } from "./commands/adventureCommand";
import { sendCellarErrand } from "./commands/cellarCommand";
import { registerDevResetCommand } from "./commands/devResetCommand";
import { registerFightCommand } from "./commands/fightCommand";
import { registerHelpCommand } from "./commands/helpCommand";
import { registerHeroCommand, sendHero } from "./commands/heroCommand";
import { registerInventoryCommand, sendInventory } from "./commands/inventoryCommand";
import { registerLookCommand } from "./commands/lookCommand";
import { registerNewsCommand, sendNewsEntry, sendNewsList } from "./commands/newsCommand";
import { registerOnlineCommand } from "./commands/onlineCommand";
import { registerPlannedCommands, sendPlannedCommand } from "./commands/plannedCommand";
import { registerRestartCommand } from "./commands/restartCommand";
import { registerStartCommand } from "./commands/startCommand";
import {
  registerTavernCommand,
  sendKorchmaFront,
  sendTavern,
  sendTavernBarrel
} from "./commands/tavernCommand";
import { registerVersionCommand } from "./commands/versionCommand";
import { playerFromContext } from "./context";
import { buildAdventureResultKeyboard } from "./keyboards/adventureKeyboard";
import { buildCellarResultKeyboard } from "./keyboards/cellarKeyboard";
import { buildFightResultKeyboard } from "./keyboards/fightKeyboard";
import {
  buildClassKeyboard,
  buildConfirmationKeyboard,
  buildGenderKeyboard,
  buildRaceKeyboard
} from "./keyboards/onboardingKeyboard";
import { buildMainMenuKeyboard, mainMenuButtons } from "./keyboards/mainMenuKeyboard";
import { buildTavernResultKeyboard } from "./keyboards/tavernKeyboard";
import { presentAdventureNoCharacter, presentAdventureResult } from "./presenters/adventurePresenter";
import { presentCellarNoCharacter, presentCellarResult } from "./presenters/cellarPresenter";
import {
  presentDevResetCancelled,
  presentDevResetDeleted,
  presentDevResetDisabled,
  presentDevResetNoCharacter
} from "./presenters/devResetPresenter";
import { presentFightNoCharacter, presentFightResult } from "./presenters/fightPresenter";
import { presentHelp } from "./presenters/helpPresenter";
import {
  presentCharacterCreated,
  presentClassSelected,
  presentGenderSelected,
  presentInvalidCallback,
  presentRaceSelected,
  presentUnavailableChoice,
  presentWelcome
} from "./presenters/onboardingPresenter";
import {
  presentRestartCancelled,
  presentRestartDeleted,
  presentRestartNoCharacter
} from "./presenters/restartPresenter";
import { presentParticipants } from "./presenters/presencePresenter";
import { presentTavernNoCharacter, presentTavernRaidResult } from "./presenters/tavernPresenter";
import { safeAnswerCallbackQuery } from "./safeAnswerCallbackQuery";
import { safeEditMessageText } from "./safeEditMessageText";

export interface BotServices {
  adventure: AdventureService;
  cellarErrand: CellarErrandService;
  fight: FightService;
  onboarding: OnboardingService;
  hero: HeroService;
  inventory: InventoryService;
  presence: PresenceService;
  devReset: DevResetService;
  restart: RestartService;
  tavern: TavernRaidService;
}

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

type PresenceContext = Omit<MarkPlayerPresenceInput, "user">;

export function createBot(token: string, services: BotServices): Bot {
  const bot = new Bot(token);

  bot.catch((error) => {
    console.error("Квестарня: помилка в Telegram middleware.", error.error);
  });

  registerPresenceMiddleware(bot, services.presence);
  registerAdventureCommand(bot, services.adventure, {
    cellarErrand: services.cellarErrand,
    presence: services.presence
  });
  registerFightCommand(bot, services.fight);
  registerStartCommand(bot, services.onboarding);
  registerHeroCommand(bot, services.hero);
  registerInventoryCommand(bot, services.inventory);
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

    await handleTavernCallback(ctx, parsed.value, services.tavern, services.presence);
  });

  bot.callbackQuery(/^v1:adv:/, async (ctx) => {
    const parsed = parseAdventureCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleAdventureCallback(ctx, parsed.value, services.adventure, services.presence);
  });

  bot.callbackQuery(/^v1:place:/, async (ctx) => {
    const parsed = parsePlaceCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handlePlaceCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:cellar:/, async (ctx) => {
    const parsed = parseCellarCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleCellarCallback(ctx, parsed.value, services.cellarErrand, services.presence);
  });

  bot.callbackQuery(/^v1:fight:/, async (ctx) => {
    const parsed = parseFightCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleFightCallback(ctx, parsed.value, services.fight);
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
  if (data === "v1:tavern:raid" || data === "v1:tavern:participants") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
      currentRaidId: PRESENCE_RAID_FRIDAY_BARREL,
      currentAdventureId: null
    };
  }

  if (data.startsWith("v1:adv:mimic:")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    };
  }

  if (data.startsWith("v1:cellar:")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    };
  }

  if (data.startsWith("v1:fight:mimic:")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
    };
  }

  if (data.startsWith("v1:onb:")) {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:menu:tavern") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:place:hall") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:place:front") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_FRONT,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:place:quest-table") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:place:barrel") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:place:cellar") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_CELLAR,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (data === "v1:place:news-corner") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
      currentRaidId: null,
      currentAdventureId: null
    };
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
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (text === mainMenuButtons.quest) {
    return {};
  }

  if (
    text === mainMenuButtons.hero ||
    text === mainMenuButtons.inventory ||
    text === mainMenuButtons.guild ||
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
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_HALL,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (command === "raid") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_BARREL,
      currentRaidId: null,
      currentAdventureId: null
    };
  }

  if (command === "adventure" || command === "quest") {
    return {};
  }

  if (command === "fight" || command === "hunt") {
    return {
      locationId: PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
      currentRaidId: null,
      currentAdventureId: PRESENCE_ADVENTURE_MIMIC_FIGHT
    };
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

async function handlePlaceCallback(
  ctx: Context,
  action: PlaceCallback,
  services: BotServices
): Promise<void> {
  await safeAnswerCallbackQuery(ctx);

  if (action === "hall") {
    await sendTavern(ctx, services.tavern, services.presence, "edit");
    return;
  }

  if (action === "front") {
    await sendKorchmaFront(ctx, services.tavern, services.presence, "edit");
    return;
  }

  if (action === "barrel") {
    await sendTavernBarrel(ctx, services.tavern, services.presence, "edit");
    return;
  }

  if (action === "quest-table") {
    await sendAdventure(ctx, services.adventure, "edit", {
      cellarErrand: services.cellarErrand,
      presence: services.presence,
      fallbackToCellar: false
    });
    return;
  }

  if (action === "cellar") {
    await sendCellarErrand(ctx, services.cellarErrand, services.presence, "edit");
    return;
  }

  await sendNewsList(ctx, 0);
}

function registerMainMenuKeyboard(bot: Bot, services: BotServices): void {
  bot.hears(mainMenuButtons.hero, async (ctx) => {
    await sendHero(ctx, services.hero, "reply");
  });

  bot.hears(mainMenuButtons.tavern, async (ctx) => {
    await sendTavern(ctx, services.tavern, services.presence, "reply");
  });

  bot.hears(mainMenuButtons.quest, async (ctx) => {
    await sendAdventure(ctx, services.adventure, "reply", {
      cellarErrand: services.cellarErrand,
      presence: services.presence,
      fallbackToCellar: true,
      requireKorchmaInterior: true
    });
  });

  bot.hears(mainMenuButtons.inventory, async (ctx) => {
    await sendInventory(ctx, services.inventory, "reply");
  });

  bot.hears(mainMenuButtons.guild, async (ctx) => {
    await sendPlannedCommand(ctx, "guild");
  });

  bot.hears(mainMenuButtons.help, async (ctx) => {
    await ctx.reply(presentHelp(services.devReset.isEnabled()), {
      reply_markup: buildMainMenuKeyboard()
    });
  });
}

async function handleTavernCallback(
  ctx: Context,
  action: "raid" | "participants",
  tavernRaidService: TavernRaidService,
  presenceService: PresenceService
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
    await safeEditMessageText(ctx, presentParticipants(snapshot), HTML_MESSAGE_OPTIONS);
    return;
  }

  const result = await tavernRaidService.completeFridayBarrelRaid(telegramUserId);

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
}

async function handleAdventureCallback(
  ctx: Context,
  action: AdventureCallback,
  adventureService: AdventureService,
  presenceService: PresenceService
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (action === "participants") {
    const snapshot = await presenceService.getAdventureParticipantsForTelegramUser(
      telegramUserId,
      PRESENCE_ADVENTURE_MIMIC_SHAWARMA
    );

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentParticipants(snapshot), HTML_MESSAGE_OPTIONS);
    return;
  }

  const result = await adventureService.completeMimicShawarma(telegramUserId, action);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentAdventureNoCharacter());
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentAdventureResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildAdventureResultKeyboard(result.state)
  });
}

async function handleCellarCallback(
  ctx: Context,
  action: CellarCallback,
  cellarErrandService: CellarErrandService,
  presenceService: PresenceService
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  if (action === "participants") {
    const snapshot = await presenceService.getAdventureParticipantsForTelegramUser(
      telegramUserId,
      PRESENCE_ADVENTURE_CELLAR_MOUSE_ERRAND
    );

    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentParticipants(snapshot), HTML_MESSAGE_OPTIONS);
    return;
  }

  const result = await cellarErrandService.complete(telegramUserId, action);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentCellarNoCharacter());
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentCellarResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildCellarResultKeyboard(result.state)
  });
}

async function handleFightCallback(
  ctx: Context,
  action: "attack" | "receipt" | "flee",
  fightService: FightService
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await fightService.completeMimicShawarma(telegramUserId, action);

  if (result.state === "no-character") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentFightNoCharacter());
    return;
  }

  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentFightResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildFightResultKeyboard(result.state)
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
