import type { Bot } from "grammy";
import { registerPartyRaidChatInput } from "../commands/partyRaidChatCommand";
import type { BotModuleDependencies } from "./types";

export function registerRaidChatBotModule(
  bot: Bot,
  { services }: BotModuleDependencies
): void {
  if (services.partyRaidChat) {
    registerPartyRaidChatInput(bot, services.partyRaidChat);
  }
}
