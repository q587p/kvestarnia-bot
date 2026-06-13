import { InlineKeyboard } from "grammy";
import { makeAdventureCallbackData } from "../callbacks/adventureCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";

export type AdventureResultKeyboardState = "completed" | "already-completed";

export function buildAdventureKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🌯 Тицьнути шаурму", makeAdventureCallbackData("poke"))
    .row()
    .text("📋 Попросити чек", makeAdventureCallbackData("receipt"))
    .row()
    .text("🏃 Обережно відступити", makeAdventureCallbackData("flee"))
    .row()
    .text("👥 Учасники", makeAdventureCallbackData("participants"));
}

export function buildAdventureResultKeyboard(
  state: AdventureResultKeyboardState
): InlineKeyboard {
  if (state === "completed" || state === "already-completed") {
    return new InlineKeyboard().text("👥 Учасники", makeAdventureCallbackData("participants"));
  }

  return buildAdventureKeyboard();
}

export function buildAdventureParticipantsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ Назад", makeQuestCallbackData("adventure"));
}
