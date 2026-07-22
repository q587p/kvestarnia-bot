import { type Bot } from "grammy";
import { type CallbackParseResult, registerParsedCallbackRoute } from "../callbackRoute";
import { parseDuelCallbackData } from "../callbacks/duelCallbackData";
import { parseItemGiftCallbackData } from "../callbacks/itemGiftCallbackData";
import { parseItemPostalCallbackData } from "../callbacks/itemPostalCallbackData";
import { parseClassNoncombatCallbackData } from "../callbacks/classNoncombatCallbackData";
import { parseNearbyDuelCallbackData } from "../callbacks/nearbyDuelCallbackData";
import { parsePartySessionCallbackData } from "../callbacks/partySessionCallbackData";
import { parseGroupCombatCallbackData } from "../callbacks/groupCombatCallbackData";
import { handleDuelCallback, registerDuelCommand } from "../commands/duelCommand";
import { handleItemGiftCallback } from "../commands/itemGiftCommand";
import { handleItemPostalCallback } from "../commands/itemPostalCommand";
import { handleClassNoncombatCallback } from "../commands/classNoncombatCommand";
import { handleNearbyDuelCallback } from "../commands/nearbyDuelCommand";
import { handlePartySessionCallback, registerPartySessionDevCommand } from "../commands/partySessionCommand";
import { handleGroupCombatCallback, registerGroupCombatDevCommand } from "../commands/groupCombatCommand";
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

  if (services.partySessions?.areDevHelpersEnabled()) {
    registerPartySessionDevCommand(bot, services.partySessions, {
      presence: services.presence,
      botUsername: options.botUsername,
      partyBoss: services.partyBoss,
      partyRaidChat: services.partyRaidChat
    });
  }

  if (services.groupCombat?.areDevHelpersEnabled()) {
    registerGroupCombatDevCommand(bot, services.groupCombat);
  }

  if (services.groupCombat?.isEnabled()) {
    registerParsedCallbackRoute(
      bot,
      /^v1:gc:/,
      (data) => parseWhenAvailable(data, parseGroupCombatCallbackData, services.groupCombat),
      async (ctx, { callback, service }) => {
        await handleGroupCombatCallback(ctx, callback, service);
      }
    );
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
    /^v1:post:/,
    (data) => parseWhenAvailable(data, parseItemPostalCallbackData, services.itemTransfers),
    async (ctx, { callback, service }) => {
      const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
      if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit"))) {
        return;
      }

      await handleItemPostalCallback(ctx, callback, service);
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

  registerParsedCallbackRoute(
    bot,
    /^v1:nc:/,
    (data) => parseWhenAvailable(data, parseClassNoncombatCallbackData, services.classNoncombat),
    async (ctx, { callback, service }) => {
      const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
      if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit"))) {
        return;
      }

      await handleClassNoncombatCallback(ctx, callback, service, services.duel);
    }
  );

  registerParsedCallbackRoute(
    bot,
    /^v1:party:/,
    (data) => parseWhenAvailable(data, parsePartySessionCallbackData, services.partySessions),
    async (ctx, { callback, service }) => {
      const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
      if (telegramUserId && (await showActivePassageSearchIfNeeded(ctx, services, telegramUserId, "edit"))) {
        return;
      }

      await handlePartySessionCallback(ctx, callback, service, {
        presence: services.presence,
        botUsername: options.botUsername,
        partyBoss: services.partyBoss,
        partyRaidChat: services.partyRaidChat
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
