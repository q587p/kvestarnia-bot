import { InlineKeyboard } from "grammy";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";

export function buildTavernKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🍺 У рейд на бочку", makeTavernCallbackData("raid"));
}
