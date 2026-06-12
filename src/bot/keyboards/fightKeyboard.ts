import { InlineKeyboard } from "grammy";
import { makeFightCallbackData } from "../callbacks/fightCallbackData";

export type FightResultKeyboardState = "completed" | "already-completed";

export function buildFightKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗡️ Вдарити", makeFightCallbackData("attack"))
    .row()
    .text("📋 Збити з пантелику чеком", makeFightCallbackData("receipt"))
    .row()
    .text("🏃 Відступити красиво", makeFightCallbackData("flee"));
}

export function buildFightResultKeyboard(state: FightResultKeyboardState): InlineKeyboard {
  if (state === "already-completed") {
    return new InlineKeyboard();
  }

  return buildFightKeyboard();
}
