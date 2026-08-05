import { Bot } from "grammy";
import type { BotOptions } from "./botOptions";
import type { BotServices } from "./botServices";
import { answerInvalidCallback } from "./callbackRoute";
import { installMessageFreshnessTracking } from "./messageFreshness";
import { registerCombatLockMiddleware } from "./middleware/registerCombatLockMiddleware";
import { registerPresenceMiddleware } from "./middleware/registerPresenceMiddleware";
import { registerCharacterBotModule } from "./modules/character";
import { registerCombatBotModule } from "./modules/combat";
import { registerCoreBotModule } from "./modules/core";
import { registerInventoryBotModule } from "./modules/inventory";
import { resumeBotNotifications } from "./modules/notifications";
import { registerQuestBotModule } from "./modules/quest";
import { registerRaidChatBotModule } from "./modules/raidChat";
import { registerSocialBotModule } from "./modules/social";
import { registerTavernBotModule } from "./modules/tavern";
import {
  installUpdatePerformanceTracing,
  registerUpdateRouteBoundary
} from "./updatePerformanceTrace";

export type { BotOptions } from "./botOptions";
export type { BotServices } from "./botServices";
export { buildQuestHubCommandOptions } from "./modules/questHubOptions";

export function createBot(token: string, services: BotServices, options: BotOptions = {}): Bot {
  const bot = new Bot(token);

  bot.catch((error) => {
    console.error("Квестарня: помилка в Telegram middleware.", error.error);
  });

  installMessageFreshnessTracking(bot);
  installUpdatePerformanceTracing(bot);
  registerRaidChatBotModule(bot, { services, options });
  registerCombatLockMiddleware(bot, services);
  registerPresenceMiddleware(bot, services.presence, {
    guildFoundationEnabled: services.guilds?.isEnabled() === true
  });
  registerUpdateRouteBoundary(bot);

  registerCoreBotModule(bot, { services, options });
  registerCharacterBotModule(bot, { services, options });
  registerInventoryBotModule(bot, { services, options });
  registerTavernBotModule(bot, { services, options });
  registerQuestBotModule(bot, { services, options });
  registerCombatBotModule(bot, { services, options });
  registerSocialBotModule(bot, { services, options });

  bot.on("callback_query:data", async (ctx) => {
    await answerInvalidCallback(ctx);
  });

  resumeBotNotifications(bot, services);

  return bot;
}
