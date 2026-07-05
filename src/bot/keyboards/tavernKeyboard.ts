import { InlineKeyboard } from "grammy";
import { makeCellarCallbackData } from "../callbacks/cellarCallbackData";
import { makeLevelBarterOpenCallbackData } from "../callbacks/levelBarterCallbackData";
import { makeItemGiftOpenCallbackData } from "../callbacks/itemGiftCallbackData";
import { makeItemPostalOpenCallbackData } from "../callbacks/itemPostalCallbackData";
import { makeMemorialRemortCallbackData } from "../callbacks/memorialCallbackData";
import { makeLoreMenuCallbackData } from "../callbacks/loreBoardCallbackData";
import { makeLatestEventsListCallbackData } from "../callbacks/latestEventsCallbackData";
import { makeNewsListCallbackData } from "../callbacks/newsCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeDescentSearchStartCallbackData } from "../callbacks/passageSearchCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makeRemortOpenCallbackData } from "../callbacks/remortCallbackData";
import {
  makeShynokBarrelRoundPreviewCallbackData,
  makeShynokBardPerformanceStartCallbackData,
  makeShynokDrinksCallbackData,
  makeShynokGamesCallbackData,
  makeShynokRoundPreviewCallbackData,
  makeShynokSaleOpenCallbackData
} from "../callbacks/shynokCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";
import { makeDuelNewCallbackData, makeDuelNewTurnBasedCallbackData } from "../callbacks/duelCallbackData";
import { makeTrainingDoppelgangerCallbackData } from "../callbacks/trainingDoppelgangerCallbackData";
import { makeYegerOutsideCallbackData } from "../callbacks/yegerCallbackData";
import type { TavernRoundOfferResult, TavernRoundResult } from "../../services/tavernRaidService";
import type { MunchkinLocation } from "../../domain/levelBarter/munchkinSchedule";
import {
  decorateButtonLabel,
  resolveQuestMarkerForTarget,
  QuestMarker,
  type QuestMarkerInput
} from "./questButtonMarkers";

export type TavernResultKeyboardState =
  | "completed"
  | "already-completed"
  | "pending"
  | "pending-started"
  | "audit-break";

export function buildTavernKeyboard(options: { questMarkers?: QuestMarkerInput | null } = {}): InlineKeyboard {
  return new InlineKeyboard()
    .text("🍺 У рейд на бочку", makeTavernCallbackData("raid"))
    .row()
    .text(
      decorateButtonLabel(
        "🧥 Єгер",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.ranger-corner")
      ),
      makeTavernCallbackData("ranger")
    )
    .text(buildBackToHallLabel(options.questMarkers), makePlaceCallbackData("hall"));
}

export function buildKorchmaFrontKeyboard(
  options: {
    yegerAction?: "hidden" | "hunt";
    munchkinLocation?: MunchkinLocation;
    dailyYard?: boolean;
    characterLevel?: number;
    questMarkers?: QuestMarkerInput | null;
  } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(
      decorateButtonLabel(
        "🚪 Зайти в корчму",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.hall")
      ),
      makePlaceCallbackData("hall")
    )
    .row();

  keyboard
    .text("📜 Табличка прибулих", makePlaceCallbackData("arrivals"))
    .text("🏅 Пропамʼятна дошка", makePlaceCallbackData("memorial"));

  let hasFrontActionRow = false;
  const startFrontActionRow = (): void => {
    keyboard.row();
    hasFrontActionRow = true;
  };

  if (options.dailyYard) {
    startFrontActionRow();
    keyboard.text(
      decorateButtonLabel(
        "🪣 У задвірок",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.yard")
      ),
      makePlaceCallbackData("yard")
    );
  }

  const showMunchkin =
    (options.characterLevel === undefined || options.characterLevel >= 3) &&
    (options.munchkinLocation ?? "front") === "front";

  if (showMunchkin) {
    if (hasFrontActionRow) {
      keyboard.row();
    } else {
      startFrontActionRow();
    }

    keyboard.text("🎒 Манчкін-скупник", makeLevelBarterOpenCallbackData());
  }

  if (options.yegerAction === "hunt") {
    if (hasFrontActionRow) {
      keyboard.row();
    } else {
      startFrontActionRow();
    }

    keyboard.text("🏹 До полювання", makeYegerOutsideCallbackData());
  }

  return keyboard;
}

export function buildKorchmaYardKeyboard(options: { questMarkers?: QuestMarkerInput | null } = {}): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      decorateButtonLabel(
        "🧾 До обходу",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.quest-table")
      ),
      makePlaceCallbackData("quest-table")
    )
    .row()
    .text("⬅️ До дверей", makePlaceCallbackData("front"));
}

export function buildEnterKorchmaKeyboard(
  options: { questMarkers?: QuestMarkerInput | null } = {}
): InlineKeyboard {
  const marker =
    options.questMarkers === undefined
      ? QuestMarker.CAN_ACCEPT
      : resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.hall");

  return new InlineKeyboard().text(
    decorateButtonLabel("🚪 Зайти в корчму", marker),
    makePlaceCallbackData("hall")
  );
}

export function buildKorchmaHallKeyboard(options: { characterLevel?: number; questMarkers?: QuestMarkerInput | null } = {}): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const showFightingCorner = options.characterLevel === undefined || options.characterLevel >= 3;
  const showNyz = options.characterLevel === undefined || options.characterLevel >= 3;

  if ((options.characterLevel ?? 0) >= 13) {
    keyboard.text("🕯️ Реморт", makeRemortOpenCallbackData()).row();
  }

  if (showFightingCorner) {
    keyboard.text("🥊 Бійцівський куток", makePlaceCallbackData("fighting-corner"));
  }

  keyboard.text(
    decorateButtonLabel(
      "📋 Стіл зі справами",
      resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.quest-table")
    ),
    makePlaceCallbackData("quest-table")
  )
    .row()
    .text(
      decorateButtonLabel(
        "🛢️ Бочка",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.barrel")
      ),
      makePlaceCallbackData("barrel")
    )
    .text(
      decorateButtonLabel(
        "🍻 Шинок",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.bar")
      ),
      makePlaceCallbackData("bar")
    )
    .row();

  keyboard
    .text("📰 Дошка корчми", makePlaceCallbackData("news-corner"))
    .text(
      decorateButtonLabel(
        "🐭 Льох",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.cellar")
      ),
      makePlaceCallbackData("cellar")
    )
    .row()
    .text("🚪 Надвір", makePlaceCallbackData("front"));

  if (showNyz) {
    keyboard.text("🪜 Спуск до Низу", makePlaceCallbackData("deep"));
  }

  return keyboard;
}

export function buildKorchmaFightingCornerKeyboard(
  options: { questMarkers?: QuestMarkerInput | null; trainingDoppelgangerAvailable?: boolean } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (options.trainingDoppelgangerAvailable !== false) {
    keyboard.text("🥊 Потренуватися", makeTrainingDoppelgangerCallbackData()).row();
  }

  return keyboard
    .text("⚡ Миттєва дуель", makeDuelNewCallbackData())
    .row()
    .text("♟️ Покрокова дуель", makeDuelNewTurnBasedCallbackData())
    .row()
    .text("🏆 Переможці", makePlaceCallbackData("duel-winners"))
    .row()
    .text(buildBackToHallLabel(options.questMarkers), makePlaceCallbackData("hall"));
}

export function buildKorchmaBarKeyboard(
  options: {
    includeBottleTurnIn?: boolean;
    problemQuestAction?: "turn-in" | "take" | "next";
    bardPerformance?: boolean;
    tavernGames?: boolean;
    tavernGameTableCount?: number;
    questMarkers?: QuestMarkerInput | null;
  } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("🍹 Напої для себе", makeShynokDrinksCallbackData())
    .row()
    .text("🍺 Просте всім", makeShynokRoundPreviewCallbackData("simple"))
    .text("🍻 Якісне всім", makeShynokRoundPreviewCallbackData("fine"))
    .row()
    .text("💰 Продати манатки", makeShynokSaleOpenCallbackData())
    .row();

  if (options.tavernGames) {
    keyboard.text(formatTavernGamesButtonLabel(options.tavernGameTableCount), makeShynokGamesCallbackData()).row();
  }

  if (options.bardPerformance) {
    keyboard.text("🎶 Виступити", makeShynokBardPerformanceStartCallbackData()).row();
  }

  if (options.problemQuestAction === "turn-in") {
    keyboard.text(
      decorateButtonLabel(
        "📋 Здати справу",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "quest.problem")
      ),
      makeQuestCallbackData("problem")
    ).row();
  }

  if (options.problemQuestAction === "take") {
    keyboard.text(
      decorateButtonLabel(
        "📋 Взяти справу",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "quest.problem")
      ),
      makeQuestCallbackData("problem-next")
    ).row();
  }

  if (options.problemQuestAction === "next") {
    keyboard.text(
      decorateButtonLabel(
        "📋 Взяти наступну справу",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "quest.problem")
      ),
      makeQuestCallbackData("problem-next")
    ).row();
  }

  if (options.includeBottleTurnIn) {
    keyboard.text(
      decorateButtonLabel(
        "🍾 Здати пляшку",
        resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "quest.cellar-grownup")
      ),
      makeCellarCallbackData("grownup-turn-in")
    ).row();
  }

  return keyboard
    .text(buildBackToHallLabel(options.questMarkers), makePlaceCallbackData("hall"));
}

export function buildKorchmaNewsCornerKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📰 Вісти", makeNewsListCallbackData(0))
    .row()
    .text("📣 Останні події", makeLatestEventsListCallbackData())
    .row()
    .text("📖 Перекази", makeLoreMenuCallbackData())
    .row()
    .text("🎁 Подарувати манатку", makeItemGiftOpenCallbackData())
    .row()
    .text("📮 Пошта Квестарні", makeItemPostalOpenCallbackData())
    .row()
    .text("⬅️ До зали", makePlaceCallbackData("hall"));
}

export function buildBackToKorchmaHallKeyboard(
  options: { questMarkers?: QuestMarkerInput | null } = {}
): InlineKeyboard {
  return new InlineKeyboard().text(buildBackToHallLabel(options.questMarkers), makePlaceCallbackData("hall"));
}

export function buildKorchmaDeepKeyboard(
  options: { munchkinLocation?: MunchkinLocation; searchAvailable?: boolean } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("⬆️ Повернутися до зали", makePlaceCallbackData("hall"))
    .row();

  if (options.munchkinLocation === "nyz-descent") {
    keyboard.text("🎒 Манчкін-скупник", makeLevelBarterOpenCallbackData()).row();
  }

  if (options.searchAvailable !== false) {
    keyboard.text("🔎 Пошукати", makeDescentSearchStartCallbackData()).row();
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
  state: TavernResultKeyboardState,
  options: { questMarkers?: QuestMarkerInput | null } = {}
): InlineKeyboard {
  if (state === "pending" || state === "pending-started") {
    return new InlineKeyboard()
      .text("🔄 Перевірити бочку", makeTavernCallbackData("raid"))
      .row()
      .text("🏅 Перевірити рейтинг", makeTavernCallbackData("raid-leaderboard"))
      .row()
      .text("📰 Перевірити новини", makeTavernCallbackData("raid-news"));
  }

  if (state === "completed" || state === "already-completed") {
    return new InlineKeyboard()
      .text("🍺 Просте всім", makeShynokBarrelRoundPreviewCallbackData("simple"))
      .text("🍻 Якісне всім", makeShynokBarrelRoundPreviewCallbackData("fine"))
      .row()
      .text(
        decorateButtonLabel(
          "🧥 Єгер",
          resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.ranger-corner")
        ),
        makeTavernCallbackData("ranger")
      )
      .text(buildBackToHallLabel(options.questMarkers), makePlaceCallbackData("hall"));
  }

  if (state === "audit-break") {
    return new InlineKeyboard()
      .text(
        decorateButtonLabel(
          "🧥 Єгер",
          resolveQuestMarkerForTarget(options.questMarkers ?? undefined, "location.korchma.ranger-corner")
        ),
        makeTavernCallbackData("ranger")
      )
      .text(buildBackToHallLabel(options.questMarkers), makePlaceCallbackData("hall"));
  }

  return buildTavernKeyboard(options);
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
  result: Exclude<TavernRoundResult, { state: "no-character" }>,
  options: { tavernGames?: boolean; tavernGameTableCount?: number } = {}
): InlineKeyboard {
  if (result.state === "raid-required") {
    return new InlineKeyboard()
      .text("🛢️ До Бочки", makePlaceCallbackData("barrel"))
      .row()
      .text("⬅️ До зали", makePlaceCallbackData("hall"));
  }

  return buildKorchmaBarKeyboard(options);
}

export function formatTavernGamesButtonLabel(tableCount = 0): string {
  const safeTableCount = Math.max(0, Math.trunc(tableCount));

  return safeTableCount > 0
    ? `🎲 Ігри за столом (${safeTableCount})`
    : "🎲 Ігри за столом";
}

function buildBackToHallLabel(questMarkers: QuestMarkerInput | null | undefined): string {
  return decorateButtonLabel(
    "⬅️ До зали",
    resolveQuestMarkerForTarget(questMarkers ?? undefined, "location.korchma.hall")
  );
}
