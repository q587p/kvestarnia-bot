import { InlineKeyboard } from "grammy";
import { makeCellarCallbackData } from "../callbacks/cellarCallbackData";
import { makeLevelBarterOpenCallbackData } from "../callbacks/levelBarterCallbackData";
import { makeItemGiftOpenCallbackData } from "../callbacks/itemGiftCallbackData";
import { makeMemorialRemortCallbackData } from "../callbacks/memorialCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makeRemortOpenCallbackData } from "../callbacks/remortCallbackData";
import {
  makeShynokDrinksCallbackData,
  makeShynokRoundPreviewCallbackData,
  makeShynokSaleOpenCallbackData
} from "../callbacks/shynokCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";
import { makeDuelNewCallbackData, makeDuelNewTurnBasedCallbackData } from "../callbacks/duelCallbackData";
import { makeTrainingDoppelgangerCallbackData } from "../callbacks/trainingDoppelgangerCallbackData";
import { makeYegerOutsideCallbackData } from "../callbacks/yegerCallbackData";
import type { TavernRoundOfferResult, TavernRoundResult } from "../../services/tavernRaidService";
import type { MunchkinLocation } from "../../domain/levelBarter/munchkinSchedule";

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

export function buildKorchmaFrontKeyboard(
  options: { yegerAction?: "hidden" | "hunt"; munchkinLocation?: MunchkinLocation } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("🚪 Зайти в корчму", makePlaceCallbackData("hall"))
    .row();

  keyboard
    .text("📜 Табличка прибулих", makePlaceCallbackData("arrivals"))
    .text("🏅 Пропамʼятна дошка", makePlaceCallbackData("memorial"))
    .row();

  let hasFrontActionRow = false;

  if ((options.munchkinLocation ?? "front") === "front") {
    keyboard.text("🎒 Манчкін-скупник", makeLevelBarterOpenCallbackData());
    hasFrontActionRow = true;
  }

  if (options.yegerAction === "hunt") {
    if (hasFrontActionRow) {
      keyboard.row();
    }

    keyboard.text("🏹 До полювання", makeYegerOutsideCallbackData());
  }

  return keyboard;
}

export function buildEnterKorchmaKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🚪 Зайти в корчму", makePlaceCallbackData("hall"));
}

export function buildKorchmaHallKeyboard(options: { characterLevel?: number } = {}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const showFightingCorner = options.characterLevel === undefined || options.characterLevel >= 3;
  const showNyz = options.characterLevel === undefined || options.characterLevel >= 3;

  if ((options.characterLevel ?? 0) >= 13) {
    keyboard.text("🕯️ Реморт", makeRemortOpenCallbackData()).row();
  }

  if (showFightingCorner) {
    keyboard.text("🥊 Бійцівський куток", makePlaceCallbackData("fighting-corner"));
  }

  keyboard.text("📋 Стіл зі справами", makePlaceCallbackData("quest-table"))
    .row()
    .text("🛢️ Бочка", makePlaceCallbackData("barrel"))
    .text("🍻 Шинок", makePlaceCallbackData("bar"))
    .row();

  if (showNyz) {
    keyboard.text("🪜 Спуск до Низу", makePlaceCallbackData("deep"));
  }

  keyboard
    .text("🐭 Льох", makePlaceCallbackData("cellar"))
    .row()
    .text("📰 Дошка вістей", makePlaceCallbackData("news-corner"))
    .text("🚪 Надвір", makePlaceCallbackData("front"));

  return keyboard;
}

export function buildKorchmaFightingCornerKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🥊 Потренуватися", makeTrainingDoppelgangerCallbackData())
    .row()
    .text("⚡ Миттєва дуель", makeDuelNewCallbackData())
    .row()
    .text("♟️ Покрокова дуель", makeDuelNewTurnBasedCallbackData())
    .row()
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
  const keyboard = new InlineKeyboard()
    .text("🍹 Напої для себе", makeShynokDrinksCallbackData())
    .row()
    .text("🍺 Просте всім", makeShynokRoundPreviewCallbackData("simple"))
    .text("🍻 Якісне всім", makeShynokRoundPreviewCallbackData("fine"))
    .row()
    .text("💰 Продати манатки", makeShynokSaleOpenCallbackData())
    .row()
    .text("🎁 Подарувати манатку", makeItemGiftOpenCallbackData())
    .row();

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

export function buildKorchmaDeepKeyboard(
  options: { munchkinLocation?: MunchkinLocation } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("⬆️ Повернутися до зали", makePlaceCallbackData("hall"))
    .row();

  if (options.munchkinLocation === "nyz-descent") {
    keyboard.text("🎒 Манчкін-скупник", makeLevelBarterOpenCallbackData()).row();
  }

  return keyboard.text("⬇️ Спуститися", makePlaceCallbackData("deep-level1"));
}

export function buildKorchmaArrivalBoardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🚪 Зайти в корчму", makePlaceCallbackData("hall"))
    .row()
    .text("⬅️ До дверей", makePlaceCallbackData("front"));
}

export function buildKorchmaMemorialBoardKeyboard(
  options: { remortNumbers?: readonly number[] } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const remortNumbers = [...new Set(options.remortNumbers ?? [])]
    .filter((remortNumber) => Number.isInteger(remortNumber) && remortNumber >= 1)
    .sort((left, right) => left - right);

  remortNumbers.forEach((remortNumber, index) => {
    if (index > 0 && index % 3 === 0) {
      keyboard.row();
    }

    keyboard.text(`Реморт ${remortNumber}`, makeMemorialRemortCallbackData(remortNumber));
  });

  if (remortNumbers.length > 0) {
    keyboard.row();
  }

  return keyboard
    .text("🚪 Зайти в корчму", makePlaceCallbackData("hall"))
    .row()
    .text("⬅️ До дверей", makePlaceCallbackData("front"));
}

export function buildKorchmaRemortMilestoneBoardKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🏅 До пропамʼятної дошки", makePlaceCallbackData("memorial"))
    .row()
    .text("⬅️ До дверей", makePlaceCallbackData("front"));
}

export function buildTavernResultKeyboard(
  state: TavernResultKeyboardState
): InlineKeyboard {
  if (state === "pending" || state === "pending-started") {
    return new InlineKeyboard()
      .text("🍺 Перевірити бочку", makeTavernCallbackData("raid"))
      .row()
      .text("🏅 Перевірити рейтинг", makeTavernCallbackData("raid-leaderboard"))
      .row()
      .text("📰 Перевірити новини", makeTavernCallbackData("raid-news"));
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

export function buildBackToTavernRaidKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ До рейду", makeTavernCallbackData("raid"));
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
