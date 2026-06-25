import { type Bot } from "grammy";
import { parseDuelCallbackData } from "../callbacks/duelCallbackData";
import { parseItemGiftCallbackData } from "../callbacks/itemGiftCallbackData";
import { parseNearbyDuelCallbackData } from "../callbacks/nearbyDuelCallbackData";
import { handleDuelCallback,registerDuelCommand } from "../commands/duelCommand";
import { handleItemGiftCallback } from "../commands/itemGiftCommand";
import { handleNearbyDuelCallback } from "../commands/nearbyDuelCommand";
import {
presentInvalidCallback
} from "../presenters/onboardingPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";

import type { BotModuleDependencies } from "./types";

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
