import { InlineKeyboard } from "grammy";
import { makeFightCallbackData } from "../callbacks/fightCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";

export function buildFightKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗡️ Вдарити", makeFightCallbackData("attack"))
    .row()
    .text("📋 Збити з пантелику чеком", makeFightCallbackData("receipt"))
    .row()
    .text("🏃 Відступити красиво", makeFightCallbackData("flee"))
    .row()
    .text("👤 Герой", makeMenuCallbackData("hero"))
    .text("❔ Допомога", makeMenuCallbackData("help"));
}
