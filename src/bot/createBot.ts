import { Bot, type Context } from "grammy";
import type { DevResetService } from "../services/devResetService";
import type { HeroService } from "../services/heroService";
import type { OnboardingService } from "../services/onboardingService";
import { parseDevResetCallbackData } from "./callbacks/devResetCallbackData";
import { parseMenuCallbackData } from "./callbacks/menuCallbackData";
import {
  parseOnboardingCallbackData,
  type OnboardingCallback
} from "./callbacks/onboardingCallbackData";
import { registerDevResetCommand } from "./commands/devResetCommand";
import { registerHelpCommand } from "./commands/helpCommand";
import { registerHeroCommand, sendHero } from "./commands/heroCommand";
import { registerStartCommand } from "./commands/startCommand";
import { playerFromContext } from "./context";
import { buildClassKeyboard } from "./keyboards/onboardingKeyboard";
import { buildMainMenuKeyboard } from "./keyboards/mainMenuKeyboard";
import {
  presentDevResetCancelled,
  presentDevResetDeleted,
  presentDevResetDisabled,
  presentDevResetNoCharacter
} from "./presenters/devResetPresenter";
import { presentHelp, presentTavernPlaceholder } from "./presenters/helpPresenter";
import {
  presentCharacterCreated,
  presentInvalidCallback,
  presentRaceSelected
} from "./presenters/onboardingPresenter";

export interface BotServices {
  onboarding: OnboardingService;
  hero: HeroService;
  devReset: DevResetService;
}

export function createBot(token: string, services: BotServices): Bot {
  const bot = new Bot(token);

  registerStartCommand(bot, services.onboarding);
  registerHeroCommand(bot, services.hero);
  registerHelpCommand(bot, services.devReset);
  registerDevResetCommand(bot, services.devReset);

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
  if (callback.type === "race") {
    const selectedRace = onboardingService.selectRace(callback.raceId);

    if (!selectedRace.ok) {
      await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(presentRaceSelected(callback.raceId), {
      reply_markup: buildClassKeyboard(callback.raceId)
    });
    return;
  }

  const player = playerFromContext(ctx.from);

  if (!player) {
    await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
    return;
  }

  const result = await onboardingService.complete(player, callback.raceId, callback.classId);

  if (!result.ok) {
    await ctx.answerCallbackQuery({ text: presentInvalidCallback(), show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(presentCharacterCreated(result.value.character, result.value.created), {
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
    await ctx.editMessageText(presentHelp(services.devReset.isEnabled()), {
      reply_markup: buildMainMenuKeyboard()
    });
    return;
  }

  await ctx.editMessageText(presentTavernPlaceholder(), {
    reply_markup: buildMainMenuKeyboard()
  });
}

async function handleDevResetCallback(
  ctx: Context,
  action: "confirm" | "cancel",
  devResetService: DevResetService
): Promise<void> {
  if (action === "cancel") {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(presentDevResetCancelled());
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
  await ctx.editMessageText(message);
}
