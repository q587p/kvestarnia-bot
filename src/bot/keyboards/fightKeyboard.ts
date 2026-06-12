import { InlineKeyboard } from "grammy";
import { makeFightCallbackData } from "../callbacks/fightCallbackData";

export function buildFightKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗡️ Вдарити", makeFightCallbackData("attack"))
    .row()
    .text("📋 Збити з пантелику чеком", makeFightCallbackData("receipt"))
    .row()
    .text("🏃 Відступити красиво", makeFightCallbackData("flee"));
}
