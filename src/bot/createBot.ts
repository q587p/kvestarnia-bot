import { Bot, type Context } from "grammy";
import type { DevResetService } from "../services/devResetService";
import type { HeroService } from "../services/heroService";
import type { OnboardingService } from "../services/onboardingService";
import type { TavernRaidService } from "../services/tavernRaidService";
import { parseDevResetCallbackData } from "./callbacks/devResetCallbackData";
import { parseMenuCallbackData } from "./callbacks/menuCallbackData";
import {
  parseOnboardingCallbackData,
  type OnboardingCallback
} from "./callbacks/onboardingCallbackData";
import { parseTavernCallbackData } from "./callbacks/tavernCallbackData";
import { registerDevResetCommand } from "./commands/devResetCommand";
import { registerHelpCommand } from "./commands/helpCommand";
import { registerHeroCommand, sendHero } from "./commands/heroCommand";
import { registerStartCommand } from "./commands/startCommand";
import { registerTavernCommand, sendTavern } from "./commands/tavernCommand";
import { playerFromContext } from "./context";
import {
  buildClassKeyboard,
  buildConfirmationKeyboard,
  buildGenderKeyboard,
  buildRaceKeyboard
} from "./keyboards/onboardingKeyboard";
import { buildMainMenuKeyboard } from "./keyboards/mainMenuKeyboard";
import { buildTavernKeyboard } from "./keyboards/tavernKeyboard";
import {
  presentDevResetCancelled,
  presentDevResetDeleted,
  presentDevResetDisabled,
  presentDevResetNoCharacter
} from "./presenters/devResetPresenter";
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
import { presentTavernNoCharacter, presentTavernRaidResult } from "./presenters/tavernPresenter";
import { safeEditMessageText } from "./safeEditMessageText";

export interface BotServices {
  onboarding: OnboardingService;
  hero: HeroService;
  devReset: DevResetService;
  tavern: TavernRaidService;
}

export function createBot(token: string, services: BotServices): Bot {
  const bot = new Bot(token);

  bot.catch((error) => {
    console.error("Квестарня: помилка в Telegram middleware.", error.error);
  });

  registerStartCommand(bot, services.onboarding);
  registerHeroCommand(bot, services.hero);
  registerHelpCommand(bot, services.devReset);
  registerDevResetCommand(bot, services.devReset);
  registerTavernCommand(bot, services.tavern);

  bot.callbackQuery(/^v1:onb:/, async (ctx) => {
    const parsed = parseOnboardingCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleOnboardingCallback(ctx, parsed.value, services.onboarding);
  });

  bot.callbackQuery(/^v1:menu:/, async (ctx) => {
    const parsed = parseMenuCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleMenuCallback(ctx, parsed.value, services);
  });

  bot.callbackQuery(/^v1:tavern:/, async (ctx) => {
    const parsed = parseTavernCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleTavernCallback(ctx, services.tavern);
  });

  bot.callbackQuery(/^v1:devreset:/, async (ctx) => {
    const parsed = parseDevResetCallbackData(ctx.callbackQuery.data);

    if (!parsed.ok) {
      await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await handleDevResetCallback(ctx, parsed.value, services.devReset);
  });

  return bot;
}

async function handleOnboardingCallback(
  ctx: Context,
  callback: OnboardingCallback,
  onboardingService: OnboardingService
): Promise<void> {
  if (callback.type === "gender") {
    await ctx.answerCallbackQuery();
    await safeEditMessageText(ctx, presentGenderSelected(callback.pronoun), {
      reply_markup: buildRaceKeyboard(callback.pronoun)
    });
    return;
  }

  if (callback.type === "back-to-gender") {
    await ctx.answerCallbackQuery();
    await safeEditMessageText(ctx, presentWelcome(), {
      reply_markup: buildGenderKeyboard()
    });
    return;
  }

  if (callback.type === "back-to-race") {
    await ctx.answerCallbackQuery();
    await safeEditMessageText(ctx, presentGenderSelected(callback.pronoun), {
      reply_markup: buildRaceKeyboard(callback.pronoun)
    });
    return;
  }

  if (callback.type === "back-to-class") {
    await ctx.answerCallbackQuery();
    await safeEditMessageText(ctx, presentRaceSelected(callback.pronoun, callback.raceId), {
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

    await ctx.answerCallbackQuery({ text: reason, show_alert: true });
    return;
  }

  if (callback.type === "race") {
    const selectedRace = onboardingService.selectRace(callback.pronoun, callback.raceId);

    if (!selectedRace.ok) {
      const text =
        selectedRace.error.type === "unavailable-race"
          ? presentUnavailableChoice(selectedRace.error.reason)
          : presentInvalidCallback();
      await ctx.answerCallbackQuery({ text, show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    await safeEditMessageText(ctx, presentRaceSelected(callback.pronoun, callback.raceId), {
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

    await ctx.answerCallbackQuery({ text: reason, show_alert: true });
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
      await ctx.answerCallbackQuery({ text, show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    await safeEditMessageText(
      ctx,
      presentClassSelected(callback.pronoun, callback.raceId, callback.classId),
      {
        reply_markup: buildConfirmationKeyboard(callback.pronoun, callback.raceId, callback.classId)
      }
    );
    return;
  }

  const player = playerFromContext(ctx.from);

  if (!player) {
    await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
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
    await ctx.answerCallbackQuery({ text, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  await safeEditMessageText(ctx, presentCharacterCreated(result.value.character, result.value.created), {
    reply_markup: buildMainMenuKeyboard()
  });
}

async function handleMenuCallback(
  ctx: Context,
  action: "hero" | "help" | "tavern",
  services: BotServices
): Promise<void> {
  await ctx.answerCallbackQuery();

  if (action === "hero") {
    await sendHero(ctx, services.hero, "edit");
    return;
  }

  if (action === "help") {
    await safeEditMessageText(ctx, presentHelp(services.devReset.isEnabled()), {
      reply_markup: buildMainMenuKeyboard()
    });
    return;
  }

  await sendTavern(ctx, services.tavern, "edit");
}

async function handleTavernCallback(
  ctx: Context,
  tavernRaidService: TavernRaidService
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await tavernRaidService.completeFridayBarrelRaid(telegramUserId);

  if (result.state === "no-character") {
    await ctx.answerCallbackQuery();
    await safeEditMessageText(ctx, presentTavernNoCharacter());
    return;
  }

  await ctx.answerCallbackQuery();
  await safeEditMessageText(ctx, presentTavernRaidResult(result), {
    reply_markup: buildTavernKeyboard()
  });
}

async function handleDevResetCallback(
  ctx: Context,
  action: "confirm" | "cancel",
  devResetService: DevResetService
): Promise<void> {
  if (action === "cancel") {
    await ctx.answerCallbackQuery();
    await safeEditMessageText(ctx, presentDevResetCancelled());
    return;
  }

  const player = playerFromContext(ctx.from);

  if (!player) {
    await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await devResetService.resetCurrentUser(player.telegramUserId);
  const message =
    result.state === "disabled"
      ? presentDevResetDisabled()
      : result.state === "deleted"
        ? presentDevResetDeleted()
        : presentDevResetNoCharacter();

  await ctx.answerCallbackQuery();
  await safeEditMessageText(ctx, message);
}
