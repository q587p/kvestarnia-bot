import { type Context,type NextFunction } from "grammy";
import type { PassageSearchCheckResult } from "../../services/passageSearchService";
import type { BotServices } from "../botServices";
import { sendFight } from "../commands/fightCommand";
import { playerFromContext } from "../context";
import {
  buildPassageSearchCancelKeyboard,
  buildPassageSearchRunningKeyboard
} from "../keyboards/fightKeyboard";
import { presentPersistentFightIntro } from "../presenters/fightPresenter";
import { presentPassageSearch } from "../presenters/passageSearchPresenter";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export async function guardActivePassageSearchCommand(
  ctx: Context,
  services: BotServices,
  next: NextFunction
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "reply"))) {
    return;
  }

  await next();
}

export async function showActivePassageSearchIfNeeded(
  ctx: Context,
  services: BotServices,
  telegramUserId: bigint,
  mode: "reply" | "edit"
): Promise<boolean> {
  if (!services.passageSearch) {
    return false;
  }

  const activeSearch = await services.passageSearch.getActiveSearch(telegramUserId);

  if (!activeSearch) {
    return false;
  }

  const replyMarkup = activeSearch.state === "confirm-cancel"
    ? buildPassageSearchCancelKeyboard(activeSearch.action.token)
    : activeSearch.state === "running"
      ? buildPassageSearchRunningKeyboard(activeSearch.action.token)
      : undefined;
  const options = {
    ...HTML_MESSAGE_OPTIONS,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
  };

  if (mode === "edit") {
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentPassageSearch(activeSearch), options);
  } else {
    await ctx.reply(presentPassageSearch(activeSearch), options);
  }

  if (activeSearch.state === "completed") {
    const achievementText = presentAchievementUnlockNotification(activeSearch.achievementUnlocks);
    if (achievementText) {
      await ctx.reply(achievementText, HTML_MESSAGE_OPTIONS);
    }
  }

  if (activeSearch.state === "monster-attack") {
    await sendPassageSearchMonsterAttackFight(ctx, services, activeSearch);
  }

  return true;
}

export async function sendPassageSearchMonsterAttackFight(
  ctx: Context,
  services: BotServices,
  result: Extract<PassageSearchCheckResult, { state: "monster-attack" }>
): Promise<void> {
  const shouldSendStartIntro = result.fight.state === "persistent-active" && result.fight.started === true;

  if (result.fight.state === "persistent-active" && result.fight.started === true) {
    await ctx.reply(presentPersistentFightIntro(result.fight), HTML_MESSAGE_OPTIONS);
  }

  await sendFight(ctx, services.fight, "reply", {
    presence: services.presence,
    tavernRaid: services.tavern,
    passageSearch: services.passageSearch,
    requireKorchmaInterior: false,
    suppressStartIntro: shouldSendStartIntro
  });
}
