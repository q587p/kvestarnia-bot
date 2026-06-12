import { InlineKeyboard } from "grammy";
import { makeAdventureCallbackData } from "../callbacks/adventureCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";

export function buildAdventureKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🌯 Тицьнути шаурму", makeAdventureCallbackData("poke"))
    .row()
    .text("📋 Попросити чек", makeAdventureCallbackData("receipt"))
    .row()
    .text("🏃 Обережно відступити", makeAdventureCallbackData("flee"))
    .row()
    .text("👤 Герой", makeMenuCallbackData("hero"))
    .text("❔ Допомога", makeMenuCallbackData("help"));
}
