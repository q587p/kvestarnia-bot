import { InlineKeyboard } from "grammy";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";

export type TavernResultKeyboardState = "completed" | "already-completed";

export function buildTavernKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🍺 У рейд на бочку", makeTavernCallbackData("raid"))
    .row()
    .text("🍻 Всім пива", makeTavernCallbackData("round"))
    .row()
    .text("👥 Учасники", makeTavernCallbackData("participants"));
}

export function buildKorchmaFrontKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🚪 Зайти в корчму", makePlaceCallbackData("hall"));
}

export function buildKorchmaHallKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Стіл зі справами", makePlaceCallbackData("quest-table"))
    .row()
    .text("🛢️ Бочка", makePlaceCallbackData("barrel"))
    .text("📰 Дошка вістей", makePlaceCallbackData("news-corner"))
    .row()
    .text("🐭 Підвал", makePlaceCallbackData("cellar"))
    .text("🚪 Надвір", makePlaceCallbackData("front"));
}

export function buildBackToKorchmaHallKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🍺 До зали корчми", makePlaceCallbackData("hall"));
}

export function buildTavernResultKeyboard(
  state: TavernResultKeyboardState
): InlineKeyboard {
  if (state === "completed" || state === "already-completed") {
    return new InlineKeyboard()
      .text("🍻 Всім пива", makeTavernCallbackData("round"))
      .row()
      .text("👥 Учасники", makeTavernCallbackData("participants"));
  }

  return buildTavernKeyboard();
}

export function buildTavernParticipantsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ Назад", makePlaceCallbackData("barrel"));
}
