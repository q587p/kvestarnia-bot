import type { BotServices } from "../botServices";
import {
type QuestHubCommandOptions
} from "../commands/questHubCommand";

export function buildQuestHubCommandOptions(services: BotServices): QuestHubCommandOptions {
  return {
    adventure: services.adventure,
    cellarErrand: services.cellarErrand,
    ...(services.cellarGrownup ? { cellarGrownup: services.cellarGrownup } : {}),
    fight: services.fight,
    yeger: services.yeger,
    presence: services.presence,
    tavernRaid: services.tavern
  };
}
