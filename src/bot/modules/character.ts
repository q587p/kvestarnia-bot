import { type Bot,type Context } from "grammy";
import type { DevResetService } from "../../services/devResetService";
import type { HeroService } from "../../services/heroService";
import type { OnboardingService } from "../../services/onboardingService";
import type { RemortService } from "../../services/remortService";
import type { RestartService } from "../../services/restartService";
import type { TavernRaidService } from "../../services/tavernRaidService";
import { answerInvalidCallback,type CallbackParseResult, registerParsedCallbackRoute } from "../callbackRoute";
import { parseAchievementCallbackData,type AchievementCallback } from "../callbacks/achievementCallbackData";
import { parseBestiaryCallbackData,type BestiaryCallback } from "../callbacks/bestiaryCallbackData";
import { parseDevResetCallbackData } from "../callbacks/devResetCallbackData";
import {
parseOnboardingCallbackData,
type OnboardingCallback
} from "../callbacks/onboardingCallbackData";
import { parseRemortCallbackData,type RemortCallback } from "../callbacks/remortCallbackData";
import { parseRestartCallbackData } from "../callbacks/restartCallbackData";
import {
registerBestiaryCommand,
sendBestiaryListGated,
sendBestiaryMonsterGated
} from "../commands/bestiaryCommand";
import { registerDevGrantCommands } from "../commands/devGrantCommand";
import { registerDevResetCommand } from "../commands/devResetCommand";
import { registerHeroCommand } from "../commands/heroCommand";
import { sendHero } from "../commands/heroCommand";
import { registerRemortCommand } from "../commands/remortCommand";
import { registerRestartCommand } from "../commands/restartCommand";
import { registerStartCommand } from "../commands/startCommand";
import { playerFromContext } from "../context";
import {
buildMainMenuKeyboard
} from "../keyboards/mainMenuKeyboard";
import { buildAchievementsKeyboard, buildCosmeticTitlesKeyboard } from "../keyboards/achievementKeyboard";
import {
buildClassKeyboard,
buildConfirmationKeyboard,
buildGenderKeyboard,
buildRaceKeyboard
} from "../keyboards/onboardingKeyboard";
import { buildRemortKeyboard,buildRemortResultKeyboard } from "../keyboards/remortKeyboard";
import { editPendingRaidBlockIfNeeded } from "../middleware/pendingRaidGuard";
import {
presentAchievementCheckNotice,
presentAchievementUnlockNotification
} from "../presenters/achievementPresenter";
import { presentAchievements } from "../presenters/achievementPresenter";
import {
presentCosmeticTitleNotice,
presentCosmeticTitles
} from "../presenters/cosmeticTitlePresenter";
import {
presentDevResetCancelled,
presentDevResetDeleted,
presentDevResetDisabled,
presentDevResetNoCharacter
} from "../presenters/devResetPresenter";
import {
presentCharacterCreated,
presentClassSelected,
presentGenderSelected,
presentInvalidCallback,
presentRaceSelected,
presentUnavailableChoice,
presentWelcome
} from "../presenters/onboardingPresenter";
import { presentRemortConfirm,presentRemortUpdate } from "../presenters/remortPresenter";
import {
presentRestartCancelled,
presentRestartDeleted,
presentRestartNoCharacter
} from "../presenters/restartPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

import { buildCurrentMainMenuKeyboard } from "./mainMenu";
import type { BotModuleDependencies } from "./types";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

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
  registerDevResetCommand(
    bot,
    services.devReset,
    services.adventure,
    services.tavern,
    services.dailyKorchmaRound,
    services.fight
  );
  registerRestartCommand(bot);
  if (services.remort) {
    registerRemortCommand(bot, services.remort, services.tavern);
  }

  registerParsedCallbackRoute(bot, /^v1:onb:/, parseOnboardingCallbackData, async (ctx, callback) => {
    await handleOnboardingCallback(ctx, callback, services.onboarding);
  });

  registerParsedCallbackRoute(bot, /^v1:bst:/, parseBestiaryCallbackData, async (ctx, callback) => {
    await handleBestiaryCallback(ctx, callback, services.hero);
  });

  registerParsedCallbackRoute(bot, /^v1:ach:/, parseAchievementCallbackData, async (ctx, callback) => {
    await handleAchievementCallback(ctx, callback, services.hero);
  });

  registerParsedCallbackRoute(bot, /^v1:devreset:/, parseDevResetCallbackData, async (ctx, callback) => {
    await handleDevResetCallback(ctx, callback, services.devReset);
  });

  registerParsedCallbackRoute(bot, /^v1:restart:/, parseRestartCallbackData, async (ctx, callback) => {
    await handleRestartCallback(ctx, callback, services.restart);
  });

  registerParsedCallbackRoute(
    bot,
    /^v1:rm:/,
    (data) => parseWhenAvailable(data, parseRemortCallbackData, services.remort),
    async (ctx, callback) => {
      const remortService = services.remort;
      if (!remortService) {
        await answerInvalidCallback(ctx);
        return;
      }

      await handleRemortCallback(ctx, callback, remortService, services.tavern);
    }
  );
}

function parseWhenAvailable<TCallback>(
  data: string,
  parse: (data: string) => CallbackParseResult<TCallback>,
  service: unknown
): CallbackParseResult<TCallback> {
  if (!service) {
    return { ok: false };
  }

  return parse(data);
}

async function handleAchievementCallback(
  ctx: Context,
  callback: AchievementCallback,
  heroService: HeroService
): Promise<void> {
  await safeAnswerCallbackQuery(ctx);

  if (callback.type === "hero") {
    await sendHero(ctx, heroService, "edit");
    return;
  }

  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId) {
    await safeEditMessageText(ctx, presentInvalidCallback());
    return;
  }

  if (callback.type === "check") {
    const result = await heroService.recalculateAchievementsByTelegramUserId(
      telegramUserId,
      callback.filter
    );

    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentInvalidCallback());
      return;
    }

    await safeEditMessageText(
      ctx,
      presentAchievements(result.view, {
        notice: presentAchievementCheckNotice(result.result.unlocks.length)
      }),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildAchievementsKeyboard(result.view)
      }
    );
    return;
  }

  if (callback.type === "titles") {
    const result = await heroService.listCosmeticTitlesByTelegramUserId(telegramUserId);

    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentInvalidCallback());
      return;
    }

    await safeEditMessageText(ctx, presentCosmeticTitles(result.view), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildCosmeticTitlesKeyboard(result.view)
    });
    return;
  }

  if (callback.type === "title-set") {
    const result = await heroService.selectCosmeticTitleByTelegramUserId(
      telegramUserId,
      callback.titleGrantRowId,
      callback.remortCount
    );

    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentInvalidCallback());
      return;
    }

    await safeEditMessageText(
      ctx,
      presentCosmeticTitles(result.result.view, {
        notice: presentCosmeticTitleNotice(result.result.state, result.result.unlocks.length)
      }),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildCosmeticTitlesKeyboard(result.result.view)
      }
    );
    return;
  }

  if (callback.type === "title-clear") {
    const result = await heroService.clearCosmeticTitleByTelegramUserId(
      telegramUserId,
      callback.remortCount
    );

    if (result.state === "no-character") {
      await safeEditMessageText(ctx, presentInvalidCallback());
      return;
    }

    await safeEditMessageText(
      ctx,
      presentCosmeticTitles(result.result.view, {
        notice: presentCosmeticTitleNotice(result.result.state)
      }),
      {
        ...HTML_MESSAGE_OPTIONS,
        reply_markup: buildCosmeticTitlesKeyboard(result.result.view)
      }
    );
    return;
  }

  const result = await heroService.listAchievementsByTelegramUserId(
    telegramUserId,
    callback.page,
    callback.filter
  );

  if (result.state === "no-character") {
    await safeEditMessageText(ctx, presentInvalidCallback());
    return;
  }

  await safeEditMessageText(ctx, presentAchievements(result.view), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildAchievementsKeyboard(result.view)
  });
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
  const achievementText = presentAchievementUnlockNotification(result.value.achievementUnlocks);
  if (achievementText) {
    await ctx.reply(achievementText, HTML_MESSAGE_OPTIONS);
  }
  await ctx.reply("🍺 Квестарня відчинена.", {
    reply_markup: buildMainMenuKeyboard()
  });
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
