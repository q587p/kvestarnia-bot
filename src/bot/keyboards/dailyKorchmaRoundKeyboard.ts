import { InlineKeyboard } from "grammy";
import type {
  DailyKorchmaRoundClaimResult,
  DailyKorchmaRoundOverviewResult,
  DailyKorchmaRoundSceneLookupResult,
  DailyKorchmaRoundStepResult
} from "../../services/dailyKorchmaRoundService";
import {
  PRESENCE_LOCATION_KORCHMA_BAR,
  PRESENCE_LOCATION_KORCHMA_BARREL,
  PRESENCE_LOCATION_KORCHMA_CELLAR,
  PRESENCE_LOCATION_KORCHMA_DEEP,
  PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER,
  PRESENCE_LOCATION_KORCHMA_HALL,
  PRESENCE_LOCATION_KORCHMA_NEWS_CORNER,
  PRESENCE_LOCATION_KORCHMA_QUEST_TABLE,
  PRESENCE_LOCATION_KORCHMA_RANGER_CORNER,
  PRESENCE_LOCATION_KORCHMA_YARD
} from "../../services/presenceService";
import {
  makeDailyKorchmaRoundActionCallbackData,
  makeDailyKorchmaRoundOverviewCallbackData,
  makeDailyKorchmaRoundSceneCallbackData,
  makeDailyKorchmaRoundSceneHelpCallbackData,
  makeDailyKorchmaRoundStartCallbackData
} from "../callbacks/dailyKorchmaRoundCallbackData";
import { makePlaceCallbackData, type PlaceCallback } from "../callbacks/placeCallbackData";

export function buildDailyKorchmaRoundOverviewKeyboard(
  result: DailyKorchmaRoundOverviewResult
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "stale-day") {
    return buildDailyKorchmaRoundOverviewKeyboard(result.current);
  }

  if (result.state === "not-issued") {
    return keyboard
      .text("🧾 Берусь за обхід", makeDailyKorchmaRoundStartCallbackData(result.dayToken))
      .row()
      .text("🍺 Пізніше", makePlaceCallbackData("quest-table"));
  }

  if (result.state !== "ready" && result.state !== "turn-in-ready" && result.state !== "completed") {
    return keyboard
      .text("📋 До справ", makePlaceCallbackData("quest-table"))
      .row()
      .text("🍺 До зали", makePlaceCallbackData("hall"));
  }

  if (result.state === "turn-in-ready") {
    return keyboard
      .text("📋 До Столу зі справами", makePlaceCallbackData("quest-table"))
      .row()
      .text("🍺 До зали", makePlaceCallbackData("hall"));
  }

  return keyboard
    .text("📋 До справ", makePlaceCallbackData("quest-table"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildDailyKorchmaRoundSceneKeyboard(
  result: DailyKorchmaRoundSceneLookupResult,
  options: { mode?: "compact" | "help" } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state !== "scene") {
    if (result.state === "not-issued") {
      return buildDailyKorchmaRoundOverviewKeyboard(result);
    }

    if ("current" in result && result.current.state !== "no-character" && "offer" in result.current) {
      return keyboard.text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.current.offer.dayToken));
    }

    if ("current" in result && result.current.state === "not-issued") {
      return buildDailyKorchmaRoundOverviewKeyboard(result.current);
    }

    return keyboard.text("🧾 До обходу", makePlaceCallbackData("quest-table"));
  }

  if (!result.alreadyCompleted && !result.locked) {
    for (const action of result.scene.actions) {
      keyboard
        .text(action.label, makeDailyKorchmaRoundActionCallbackData({
          dayToken: result.offer.dayToken,
          sceneIndex: result.sceneIndex,
          actionId: action.id,
          lifeToken: result.offer.lifeToken
        }))
        .row();
    }

    if (options.mode === "help") {
      keyboard
        .text("⬅️ Назад", makeDailyKorchmaRoundSceneCallbackData(result.offer.dayToken, result.sceneIndex))
        .row();
    } else if (result.scene.actions.some((action) => Boolean(action.description))) {
      keyboard
        .text("💡 Підказка", makeDailyKorchmaRoundSceneHelpCallbackData(result.offer.dayToken, result.sceneIndex))
        .row();
    }
  }

  return keyboard
    .text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.offer.dayToken))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildDailyKorchmaRoundStepKeyboard(result: DailyKorchmaRoundStepResult): InlineKeyboard {
  if (result.state !== "step-completed" && result.state !== "step-replayed") {
    if (result.state === "not-issued") {
      return buildDailyKorchmaRoundOverviewKeyboard(result);
    }

    if (result.state === "wrong-location") {
      const keyboard = new InlineKeyboard();
      const place = placeCallbackFromLocation(result.scene.locationId);

      if (place) {
        keyboard.text("📍 До місцини", makePlaceCallbackData(place)).row();
      }

      return keyboard.text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.offer.dayToken));
    }

    if ("offer" in result) {
      return new InlineKeyboard().text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.offer.dayToken));
    }

    if ("current" in result && result.current.state !== "no-character" && "offer" in result.current) {
      return new InlineKeyboard().text(
        "🧾 До обходу",
        makeDailyKorchmaRoundOverviewCallbackData(result.current.offer.dayToken)
      );
    }

    if ("current" in result && result.current.state === "not-issued") {
      return buildDailyKorchmaRoundOverviewKeyboard(result.current);
    }

    return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  const keyboard = new InlineKeyboard()
    .text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.offer.dayToken))
    .row();

  keyboard.text("🍺 До зали", makePlaceCallbackData("hall"));

  return keyboard;
}

function placeCallbackFromLocation(locationId: string): PlaceCallback | null {
  switch (locationId) {
    case PRESENCE_LOCATION_KORCHMA_YARD:
      return "yard";
    case PRESENCE_LOCATION_KORCHMA_HALL:
      return "hall";
    case PRESENCE_LOCATION_KORCHMA_QUEST_TABLE:
      return "quest-table";
    case PRESENCE_LOCATION_KORCHMA_BAR:
      return "bar";
    case PRESENCE_LOCATION_KORCHMA_BARREL:
      return "barrel";
    case PRESENCE_LOCATION_KORCHMA_CELLAR:
      return "cellar";
    case PRESENCE_LOCATION_KORCHMA_NEWS_CORNER:
      return "news-corner";
    case PRESENCE_LOCATION_KORCHMA_RANGER_CORNER:
      return "ranger-corner";
    case PRESENCE_LOCATION_KORCHMA_FIGHTING_CORNER:
      return "fighting-corner";
    case PRESENCE_LOCATION_KORCHMA_DEEP:
      return "deep";
    default:
      return null;
  }
}

export function buildDailyKorchmaRoundClaimKeyboard(result: DailyKorchmaRoundClaimResult): InlineKeyboard {
  if (result.state === "reward-claimed" || result.state === "reward-replayed") {
    return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  if (result.state === "not-issued") {
    return buildDailyKorchmaRoundOverviewKeyboard(result);
  }

  if ("offer" in result) {
    return new InlineKeyboard().text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.offer.dayToken));
  }

  if ("current" in result && result.current.state === "not-issued") {
    return buildDailyKorchmaRoundOverviewKeyboard(result.current);
  }

  return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
}
