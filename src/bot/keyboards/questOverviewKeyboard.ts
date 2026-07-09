import { InlineKeyboard } from "grammy";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";

export function buildQuestOverviewKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  keyboard.text("📋 До Столу зі справами", makeQuestCallbackData("list")).row();
  keyboard.text("🔎 Оновити", makeQuestCallbackData("overview"));
  keyboard.text("🍺 До зали", makePlaceCallbackData("hall"));

  return keyboard;
}
