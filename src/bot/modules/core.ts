import { type Bot, type Context } from "grammy";
import type { BotServices } from "../botServices";
import { registerParsedCallbackRoute } from "../callbackRoute";
import {
  parseLoreBoardCallbackData,
  type LoreBoardCallback
} from "../callbacks/loreBoardCallbackData";
import { parseMenuCallbackData, type MenuCallback } from "../callbacks/menuCallbackData";
import { parseNewsCallbackData, type NewsCallback } from "../callbacks/newsCallbackData";
import { registerHelpCommand } from "../commands/helpCommand";
import { sendHero } from "../commands/heroCommand";
import { sendInventory } from "../commands/inventoryCommand";
import {
  sendLoreCategory,
  sendLoreEntry,
  sendLoreGroup,
  sendLoreMenu,
  sendRandomLoreEntry,
  sendRandomLoreEntryForCategory
} from "../commands/loreBoardCommand";
import { registerLookCommand } from "../commands/lookCommand";
import { registerNewsCommand, sendNewsEntry, sendNewsList } from "../commands/newsCommand";
import { registerOnlineCommand } from "../commands/onlineCommand";
import { registerPlannedCommands } from "../commands/plannedCommand";
import { registerSupportCommand } from "../commands/supportCommand";
import { sendTavern } from "../commands/tavernCommand";
import { registerVersionCommand } from "../commands/versionCommand";
import { presentHelp } from "../presenters/helpPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

import {
  buildCurrentMainMenuKeyboard,
  registerCallbackMainMenuLocationRefresh,
  registerMainMenuKeyboard
} from "./mainMenu";
import type { BotModuleDependencies } from "./types";

export function registerCoreBotModule(
  bot: Bot,
  { services, options }: BotModuleDependencies
): void {
  registerOnlineCommand(bot, services.presence, {
    bardPerformanceEnabled: Boolean(services.bardPerformance),
    duelEnabled: Boolean(services.duel),
    itemGiftEnabled: Boolean(services.itemTransfers),
    partySessions: services.partySessions
  });
  registerLookCommand(bot, services.presence);
  registerHelpCommand(bot, services.devReset, services.devGrant, {
    partySessionService: services.partySessions,
    buildMainMenuKeyboard: (ctx) => buildCurrentMainMenuKeyboard(ctx, services.presence)
  });
  registerNewsCommand(bot);
  registerSupportCommand(bot, options.supportJarUrl, options.supportJarStatus);
  registerVersionCommand(bot);
  registerPlannedCommands(bot);
  registerMainMenuKeyboard(bot, services, {
    botUsername: options.botUsername
  });
  registerCallbackMainMenuLocationRefresh(bot, services.presence);

  registerParsedCallbackRoute(bot, /^v1:menu:/, parseMenuCallbackData, async (ctx, action) => {
    await handleMenuCallback(ctx, action, services);
  });

  registerParsedCallbackRoute(bot, /^v1:news:/, parseNewsCallbackData, handleNewsCallback);

  registerParsedCallbackRoute(bot, /^v1:lore:/, parseLoreBoardCallbackData, handleLoreBoardCallback);
}

async function handleMenuCallback(
  ctx: Context,
  action: MenuCallback,
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
      includeDevGrant: services.devGrant?.isEnabled() ?? false,
      includePartySessions: services.partySessions?.areDevHelpersEnabled() ?? false
    }));
    return;
  }

  if (action === "inventory") {
    await sendInventory(ctx, services.inventory, "edit");
    return;
  }

  await sendTavern(ctx, services.tavern, services.presence, "edit");
}

async function handleNewsCallback(ctx: Context, action: NewsCallback): Promise<void> {
  await safeAnswerCallbackQuery(ctx);

  if (action.type === "list") {
    await sendNewsList(ctx, action.page, "edit", { source: action.source });
    return;
  }

  await sendNewsEntry(ctx, action.entryIndex, action.listPage, { source: action.source });
}

async function handleLoreBoardCallback(ctx: Context, action: LoreBoardCallback): Promise<void> {
  await safeAnswerCallbackQuery(ctx);

  if (action.type === "menu") {
    await sendLoreMenu(ctx, "edit");
    return;
  }

  if (action.type === "category") {
    await sendLoreCategory(ctx, action.categoryId);
    return;
  }

  if (action.type === "entry") {
    await sendLoreEntry(ctx, action.entryId);
    return;
  }

  if (action.type === "group") {
    await sendLoreGroup(ctx, action.groupId);
    return;
  }

  if (action.type === "category-random") {
    await sendRandomLoreEntryForCategory(ctx, action.categoryId);
    return;
  }

  await sendRandomLoreEntry(ctx);
}
