import { InlineKeyboard } from "grammy";
import { makeCellarCallbackData } from "../callbacks/cellarCallbackData";
import { makeLevelBarterOpenCallbackData } from "../callbacks/levelBarterCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makeRemortOpenCallbackData } from "../callbacks/remortCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";
import { makeDuelNewCallbackData } from "../callbacks/duelCallbackData";
import { makeTrainingDoppelgangerCallbackData } from "../callbacks/trainingDoppelgangerCallbackData";
import type { TavernRoundOfferResult, TavernRoundResult } from "../../services/tavernRaidService";

export type TavernResultKeyboardState =
  | "completed"
  | "already-completed"
  | "pending"
  | "pending-started"
  | "audit-break";

export function buildTavernKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🍺 У рейд на бочку", makeTavernCallbackData("raid"))
    .row()
    .text("🧥 Єгер", makeTavernCallbackData("ranger"))
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildKorchmaFrontKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🚪 Зайти в корчму", makePlaceCallbackData("hall"))
    .row()
    .text("📜 Табличка прибулих", makePlaceCallbackData("arrivals"))
    .text("🏅 Пропамʼятна дошка", makePlaceCallbackData("memorial"))
    .row()
    .text("🎒 Манчкін-скупник", makeLevelBarterOpenCallbackData());
}

export function buildKorchmaHallKeyboard(options: { characterLevel?: number } = {}): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if ((options.characterLevel ?? 0) >= 13) {
    keyboard.text("🕯️ Реморт", makeRemortOpenCallbackData()).row();
  }

  return keyboard
    .text("🥊 Бійцівський куток", makePlaceCallbackData("fighting-corner"))
    .text("📋 Стіл зі справами", makePlaceCallbackData("quest-table"))
    .row()
    .text("🛢️ Бочка", makePlaceCallbackData("barrel"))
    .text("🍻 Шинок", makePlaceCallbackData("bar"))
    .row()
    .text("🕳️ Глибка", makePlaceCallbackData("deep"))
    .text("🐭 Льох", makePlaceCallbackData("cellar"))
    .row()
    .text("📰 Дошка вістей", makePlaceCallbackData("news-corner"))
    .text("🚪 Надвір", makePlaceCallbackData("front"));
}

export function buildKorchmaFightingCornerKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🥊 Потренуватися", makeTrainingDoppelgangerCallbackData())
    .row()
    .text("🤝 Кинути виклик", makeDuelNewCallbackData())
    .text("🏆 Переможці", makePlaceCallbackData("duel-winners"))
    .row()
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildKorchmaBarKeyboard(
  options: {
    includeBottleTurnIn?: boolean;
    problemQuestAction?: "turn-in" | "take" | "next";
  } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard().text("🍻 Всім пива", makeTavernCallbackData("round")).row();

  if (options.problemQuestAction === "turn-in") {
    keyboard.text("📋 Здати справу", makeQuestCallbackData("problem")).row();
  }

  if (options.problemQuestAction === "take") {
    keyboard.text("📋 Взяти справу", makeQuestCallbackData("problem-next")).row();
  }

  if (options.problemQuestAction === "next") {
    keyboard.text("📋 Взяти наступну справу", makeQuestCallbackData("problem-next")).row();
  }

  if (options.includeBottleTurnIn) {
    keyboard.text("🍾 Здати пляшку", makeCellarCallbackData("grownup-turn-in")).row();
  }

  return keyboard
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildBackToKorchmaHallKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildKorchmaArrivalBoardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🚪 Зайти в корчму", makePlaceCallbackData("hall"))
    .row()
    .text("⬅️ До дверей", makePlaceCallbackData("front"));
}

export function buildKorchmaMemorialBoardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🚪 Зайти в корчму", makePlaceCallbackData("hall"))
    .row()
    .text("⬅️ До дверей", makePlaceCallbackData("front"));
}

export function buildTavernResultKeyboard(
  state: TavernResultKeyboardState
): InlineKeyboard {
  if (state === "pending" || state === "pending-started") {
    return new InlineKeyboard().text("🍺 Перевірити бочку", makeTavernCallbackData("raid"));
  }

  if (state === "completed" || state === "already-completed") {
    return new InlineKeyboard()
      .text("🍻 Всім пива", makeTavernCallbackData("round"))
      .row()
      .text("🧥 Єгер", makeTavernCallbackData("ranger"))
      .text("⬅️ До зали", makePlaceCallbackData("hall"));
  }

  if (state === "audit-break") {
    return new InlineKeyboard()
      .text("🧥 Єгер", makeTavernCallbackData("ranger"))
      .text("⬅️ До зали", makePlaceCallbackData("hall"));
  }

  return buildTavernKeyboard();
}

export function buildTavernParticipantsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ Назад", makePlaceCallbackData("barrel"));
}

export function buildKorchmaRoundOfferKeyboard(
  result: Exclude<TavernRoundOfferResult, { state: "no-character" }>
): InlineKeyboard {
  if (result.state === "raid-required") {
    return buildKorchmaRoundResultKeyboard(result);
  }

  const keyboard = new InlineKeyboard();

  if (result.state === "ready") {
    if (result.canBuyFine) {
      keyboard.text("🍻 Якісне — 100", makeTavernCallbackData("round-fine")).row();
    }

    if (result.canBuySimple) {
      keyboard.text("🍺 Просте — 10", makeTavernCallbackData("round-simple")).row();
    }
  }

  return keyboard.text("⬅️ До шинку", makePlaceCallbackData("bar"));
}

export function buildKorchmaRoundResultKeyboard(
  result: Exclude<TavernRoundResult, { state: "no-character" }>
): InlineKeyboard {
  if (result.state === "raid-required") {
    return new InlineKeyboard()
      .text("🛢️ До Бочки", makePlaceCallbackData("barrel"))
      .row()
      .text("⬅️ До зали", makePlaceCallbackData("hall"));
  }

  return buildKorchmaBarKeyboard();
}
