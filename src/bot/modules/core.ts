import { type Bot,type Context } from "grammy";
import type { BotServices } from "../botServices";
import { parseMenuCallbackData } from "../callbacks/menuCallbackData";
import { parseNewsCallbackData } from "../callbacks/newsCallbackData";
import { registerHelpCommand } from "../commands/helpCommand";
import { sendHero } from "../commands/heroCommand";
import { sendInventory } from "../commands/inventoryCommand";
import { registerLookCommand } from "../commands/lookCommand";
import { registerNewsCommand,sendNewsEntry,sendNewsList } from "../commands/newsCommand";
import { registerOnlineCommand } from "../commands/onlineCommand";
import { registerPlannedCommands } from "../commands/plannedCommand";
import { registerSupportCommand } from "../commands/supportCommand";
import {
sendTavern
} from "../commands/tavernCommand";
import { registerVersionCommand } from "../commands/versionCommand";
import { presentHelp } from "../presenters/helpPresenter";
import {
presentInvalidCallback
} from "../presenters/onboardingPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

import { buildCurrentMainMenuKeyboard,registerCallbackMainMenuLocationRefresh,registerMainMenuKeyboard } from "./mainMenu";
import type { BotModuleDependencies } from "./types";

export function registerCoreBotModule(
  bot: Bot,
  { services, options }: BotModuleDependencies
): void {
  registerOnlineCommand(bot, services.presence, {
    bardPerformanceEnabled: Boolean(services.bardPerformance),
    duelEnabled: Boolean(services.duel),
    itemGiftEnabled: Boolean(services.itemTransfers)
  });
  registerLookCommand(bot, services.presence);
  registerHelpCommand(bot, services.devReset, services.devGrant, {
    buildMainMenuKeyboard: (ctx) => buildCurrentMainMenuKeyboard(ctx, services.presence)
  });
  registerNewsCommand(bot);
  registerSupportCommand(bot, options.supportJarUrl, options.supportJarStatus);
  registerVersionCommand(bot);
  registerPlannedCommands(bot);
  registerMainMenuKeyboard(bot, services);
  registerCallbackMainMenuLocationRefresh(bot, services.presence);

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
      await sendNewsList(ctx, parsed.value.page, "edit", { source: parsed.value.source });
      return;
    }

    await sendNewsEntry(ctx, parsed.value.entryIndex, parsed.value.listPage, { source: parsed.value.source });
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
    await safeEditMessageText(ctx, presentHelp({
      includeDevReset: services.devReset.isEnabled(),
      includeDevGrant: services.devGrant?.isEnabled() ?? false
    }));
    return;
  }

  if (action === "inventory") {
    await sendInventory(ctx, services.inventory, "edit");
    return;
  }

  await sendTavern(ctx, services.tavern, services.presence, "edit");
}
