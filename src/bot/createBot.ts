import { Bot } from "grammy";
import type { BotOptions } from "./botOptions";
import type { BotServices } from "./botServices";
import {
  registerCharacterBotModule,
  registerCombatBotModule,
  registerCoreBotModule,
  registerInventoryBotModule,
  registerQuestBotModule,
  registerSocialBotModule,
  registerTavernBotModule,
  resumeBotNotifications
} from "./featureRegistrars";
import { installMessageFreshnessTracking } from "./messageFreshness";
import { registerCombatLockMiddleware } from "./middleware/registerCombatLockMiddleware";
import { registerPresenceMiddleware } from "./middleware/registerPresenceMiddleware";

export type { BotOptions } from "./botOptions";
export type { BotServices } from "./botServices";
export { buildQuestHubCommandOptions } from "./featureRegistrars";

export function createBot(token: string, services: BotServices, options: BotOptions = {}): Bot {
  const bot = new Bot(token);

  bot.catch((error) => {
    console.error("Квестарня: помилка в Telegram middleware.", error.error);
  });

  installMessageFreshnessTracking(bot);
  registerCombatLockMiddleware(bot, services);
  registerPresenceMiddleware(bot, services.presence);

  registerCoreBotModule(bot, { services, options });
  registerCharacterBotModule(bot, { services, options });
  registerInventoryBotModule(bot, { services, options });
  registerTavernBotModule(bot, { services, options });
  registerQuestBotModule(bot, { services, options });
  registerCombatBotModule(bot, { services, options });
  registerSocialBotModule(bot, { services, options });

  resumeBotNotifications(bot, services);

  return bot;
}
