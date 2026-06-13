import { InlineKeyboard } from "grammy";
import { makeCellarCallbackData } from "../callbacks/cellarCallbackData";

export type CellarKeyboardState = "ready" | "completed" | "on-cooldown";

export function buildCellarKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🧀 Поставити сирну пастку", makeCellarCallbackData("cheese-trap"))
    .row()
    .text("🧹 Підмести хоробро", makeCellarCallbackData("sweep-bravely"))
    .row()
    .text("🤝 Домовитись із мишею", makeCellarCallbackData("negotiate"))
    .row()
    .text("👥 Учасники", makeCellarCallbackData("participants"));
}

export function buildCellarResultKeyboard(state: CellarKeyboardState): InlineKeyboard {
  if (state === "ready") {
    return buildCellarKeyboard();
  }

  return new InlineKeyboard().text("👥 Учасники", makeCellarCallbackData("participants"));
}
