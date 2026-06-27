import { type Bot } from "grammy";
import { type CallbackParseResult, registerParsedCallbackRoute } from "../callbackRoute";
import { parseDuelCallbackData } from "../callbacks/duelCallbackData";
import { parseItemGiftCallbackData } from "../callbacks/itemGiftCallbackData";
import { parseNearbyDuelCallbackData } from "../callbacks/nearbyDuelCallbackData";
import { handleDuelCallback, registerDuelCommand } from "../commands/duelCommand";
import { handleItemGiftCallback } from "../commands/itemGiftCommand";
import { handleNearbyDuelCallback } from "../commands/nearbyDuelCommand";
import { playerFromContext } from "../context";

import {
  guardActivePassageSearchCommand,
  showActivePassageSearchIfNeeded
} from "./passageSearchGuard";
import type { BotModuleDependencies } from "./types";

export function registerSocialBotModule(
  bot: Bot,
  { services, options }: BotModuleDependencies
): void {
  if (services.duel) {
    bot.command("duel", async (ctx, next) => {
      await guardActivePassageSearchCommand(ctx, services, next);
    });

    registerDuelCommand(bot, services.duel, {
      presence: services.presence,
      tavernRaid: services.tavern,
      botUsername: options.botUsername
    });
  }

  registerParsedCallbackRoute(
    bot,
    /^v1:gift:/,
    (data) => parseWhenAvailable(data, parseItemGiftCallbackData, services.itemTransfers),
    async (ctx, { callback, service }) => {
      const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
      if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit"))) {
        return;
      }

      await handleItemGiftCallback(ctx, callback, service);
    }
  );

  registerParsedCallbackRoute(
    bot,
    /^v1:duel:/,
    (data) => parseWhenAvailable(data, parseDuelCallbackData, services.duel),
    async (ctx, { callback, service }) => {
      const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
      if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit"))) {
        return;
      }

      await handleDuelCallback(ctx, callback, service, {
        presence: services.presence,
        tavernRaid: services.tavern,
        botUsername: options.botUsername
      });
    }
  );

  registerParsedCallbackRoute(
    bot,
    /^v1:nd:/,
    (data) => parseWhenAvailable(data, parseNearbyDuelCallbackData, services.duel),
    async (ctx, { callback, service }) => {
      const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
      if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit"))) {
        return;
      }

      await handleNearbyDuelCallback(ctx, callback, {
        presence: services.presence,
        duel: service,
        tavernRaid: services.tavern
      });
    }
  );
}

function parseWhenAvailable<TCallback, TService>(
  data: string,
  parse: (data: string) => CallbackParseResult<TCallback>,
  service: TService | null | undefined
): CallbackParseResult<{ callback: TCallback; service: TService }> {
  if (!service) {
    return { ok: false };
  }

  const parsed = parse(data);
  return parsed.ok ? { ok: true, value: { callback: parsed.value, service } } : parsed;
}
