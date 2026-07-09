import { InlineKeyboard } from "grammy";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildQuestOverviewKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  keyboard.text("📋 До Столу зі справами", makePlaceCallbackData("quest-table"));

  return keyboard;
}
