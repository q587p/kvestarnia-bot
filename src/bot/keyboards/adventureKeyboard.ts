import { InlineKeyboard } from "grammy";
import { makeAdventureCallbackData } from "../callbacks/adventureCallbackData";

export type AdventureResultKeyboardState = "completed" | "already-completed";

export function buildAdventureKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🌯 Тицьнути шаурму", makeAdventureCallbackData("poke"))
    .row()
    .text("📋 Попросити чек", makeAdventureCallbackData("receipt"))
    .row()
    .text("🏃 Обережно відступити", makeAdventureCallbackData("flee"));
}

export function buildAdventureResultKeyboard(
  state: AdventureResultKeyboardState
): InlineKeyboard {
  if (state === "already-completed") {
    return new InlineKeyboard();
  }

  return buildAdventureKeyboard();
}
