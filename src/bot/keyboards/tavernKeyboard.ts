import { InlineKeyboard } from "grammy";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";
import type { TavernRoundOfferResult } from "../../services/tavernRaidService";

export type TavernResultKeyboardState =
  | "completed"
  | "already-completed"
  | "pending"
  | "pending-started";

export function buildTavernKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🍺 У рейд на бочку", makeTavernCallbackData("raid"))
    .row()
    .text("👥 Учасники", makeTavernCallbackData("participants"))
    .row()
    .text("🧥 Єгер", makeTavernCallbackData("ranger"))
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildKorchmaFrontKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🚪 Зайти в корчму", makePlaceCallbackData("hall"));
}

export function buildKorchmaHallKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Стіл зі справами", makePlaceCallbackData("quest-table"))
    .row()
    .text("🛢️ Бочка", makePlaceCallbackData("barrel"))
    .text("🍻 Всім пива", makeTavernCallbackData("round"))
    .row()
    .text("📰 Дошка вістей", makePlaceCallbackData("news-corner"))
    .text("🐭 Підвал", makePlaceCallbackData("cellar"))
    .row()
    .text("🚪 Надвір", makePlaceCallbackData("front"));
}

export function buildBackToKorchmaHallKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildTavernResultKeyboard(
  state: TavernResultKeyboardState
): InlineKeyboard {
  if (state === "pending" || state === "pending-started") {
    return new InlineKeyboard()
      .text("🍺 Перевірити бочку", makeTavernCallbackData("raid"))
      .row()
      .text("👥 Учасники", makeTavernCallbackData("participants"));
  }

  if (state === "completed" || state === "already-completed") {
    return new InlineKeyboard()
      .text("👥 Учасники", makeTavernCallbackData("participants"))
      .row()
      .text("🧥 Єгер", makeTavernCallbackData("ranger"))
      .text("⬅️ До зали", makePlaceCallbackData("hall"));
  }

  return buildTavernKeyboard();
}

export function buildTavernParticipantsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ Назад", makePlaceCallbackData("barrel"));
}

export function buildTavernRangerKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildKorchmaRoundOfferKeyboard(
  result: Exclude<TavernRoundOfferResult, { state: "no-character" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "ready") {
    if (result.canBuyFine) {
      keyboard.text("🍻 Якісне — 100", makeTavernCallbackData("round-fine")).row();
    }

    if (result.canBuySimple) {
      keyboard.text("🍺 Просте — 10", makeTavernCallbackData("round-simple")).row();
    }
  }

  return keyboard.text("⬅️ До зали", makePlaceCallbackData("hall"));
}
