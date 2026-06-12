import { InlineKeyboard } from "grammy";
import { makeAdventureCallbackData } from "../callbacks/adventureCallbackData";

export function buildAdventureKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🌯 Тицьнути шаурму", makeAdventureCallbackData("poke"))
    .row()
    .text("📋 Попросити чек", makeAdventureCallbackData("receipt"))
    .row()
    .text("🏃 Обережно відступити", makeAdventureCallbackData("flee"));
}
