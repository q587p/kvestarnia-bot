import { InlineKeyboard } from "grammy";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";

export function buildTavernKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🍺 У рейд на бочку", makeTavernCallbackData("raid"))
    .row()
    .text("👤 Герой", makeMenuCallbackData("hero"))
    .text("❔ Допомога", makeMenuCallbackData("help"));
}
