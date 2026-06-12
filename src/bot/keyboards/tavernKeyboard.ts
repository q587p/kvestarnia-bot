import { InlineKeyboard } from "grammy";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";

export type TavernResultKeyboardState = "completed" | "already-completed";

export function buildTavernKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🍺 У рейд на бочку", makeTavernCallbackData("raid"));
}

export function buildTavernResultKeyboard(
  state: TavernResultKeyboardState
): InlineKeyboard {
  if (state === "already-completed") {
    return new InlineKeyboard();
  }

  return buildTavernKeyboard();
}
