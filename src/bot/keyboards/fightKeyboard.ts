import { InlineKeyboard } from "grammy";
import { makeFightCallbackData } from "../callbacks/fightCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export type FightResultKeyboardState = "completed" | "already-completed";

export function buildFightKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗡️ Вдарити", makeFightCallbackData("attack"))
    .row()
    .text("📋 Збити з пантелику чеком", makeFightCallbackData("receipt"))
    .row()
    .text("🏃 Відступити красиво", makeFightCallbackData("flee"))
    .row()
    .text("⬅️ До столу", makePlaceCallbackData("quest-table"));
}

export function buildFightResultKeyboard(state: FightResultKeyboardState): InlineKeyboard {
  if (state === "already-completed") {
    return new InlineKeyboard().text("⬅️ До столу", makePlaceCallbackData("quest-table"));
  }

  return buildFightKeyboard();
}
