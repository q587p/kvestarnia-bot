import { type Bot } from "grammy";
import type { BotServices } from "../botServices";
import { barrelRaidCompletionScheduler } from "./barrelRaidCompletionScheduler";

export function resumeBotNotifications(bot: Bot, services: BotServices): void {
  if (services.barrelRaidNotifications) {
    void barrelRaidCompletionScheduler.resumePending({
      bot,
      now: new Date(),
      tavernRaidService: services.tavern,
      notifications: services.barrelRaidNotifications
    }).catch((error) => {
      console.error("Квестарня: бочкові нотифікації після старту не відновились.", error);
    });
  }
}
