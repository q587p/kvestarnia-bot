import { InlineKeyboard } from "grammy";
import type {
  DailyKorchmaRoundClaimResult,
  DailyKorchmaRoundLookupResult,
  DailyKorchmaRoundSceneLookupResult,
  DailyKorchmaRoundStepResult
} from "../../services/dailyKorchmaRoundService";
import { makeDailyKorchmaRoundActionCallbackData, makeDailyKorchmaRoundClaimCallbackData, makeDailyKorchmaRoundOverviewCallbackData, makeDailyKorchmaRoundSceneCallbackData } from "../callbacks/dailyKorchmaRoundCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildDailyKorchmaRoundOverviewKeyboard(
  result: DailyKorchmaRoundLookupResult
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state !== "ready" && result.state !== "turn-in-ready" && result.state !== "completed") {
    return keyboard.text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  result.offer.scenes.forEach((scene, index) => {
    const locked = result.offer.omittedSceneId === scene.id;
    const done = result.offer.completedSceneIds.includes(scene.id);

    if (!locked) {
      keyboard
        .text(`${done ? "✅" : scene.icon} ${shortSceneButton(scene.title)}`, makeDailyKorchmaRoundSceneCallbackData(result.offer.dayToken, index))
        .row();
    }
  });

  if (result.state === "turn-in-ready") {
    keyboard
      .text("🧾 Здати обхід", makeDailyKorchmaRoundClaimCallbackData(result.offer.dayToken, result.offer.lifeToken))
      .row();
  }

  return keyboard.text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildDailyKorchmaRoundSceneKeyboard(result: DailyKorchmaRoundSceneLookupResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state !== "scene") {
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
  }

  return keyboard
    .text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.offer.dayToken))
    .row()
    .text("📍 До місцини", makePlaceCallbackData(placeCallbackFromLocation(result.scene.locationId)));
}

export function buildDailyKorchmaRoundStepKeyboard(result: DailyKorchmaRoundStepResult): InlineKeyboard {
  if (result.state !== "step-completed" && result.state !== "step-replayed") {
    return new InlineKeyboard().text("🧾 До обходу", makePlaceCallbackData("quest-table"));
  }

  const keyboard = new InlineKeyboard()
    .text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.offer.dayToken))
    .row();

  if (result.completedCount >= 2) {
    keyboard.text("📋 До Столу", makePlaceCallbackData("quest-table"));
  } else {
    keyboard.text("📍 Лишитися тут", makePlaceCallbackData(placeCallbackFromLocation(result.scene.locationId)));
  }

  return keyboard;
}

export function buildDailyKorchmaRoundClaimKeyboard(result: DailyKorchmaRoundClaimResult): InlineKeyboard {
  if (result.state === "reward-claimed" || result.state === "reward-replayed") {
    return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  if ("offer" in result) {
    return new InlineKeyboard().text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.offer.dayToken));
  }

  return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
}

function shortSceneButton(title: string): string {
  return title.length > 24 ? `${title.slice(0, 23)}…` : title;
}

function placeCallbackFromLocation(locationId: string): Parameters<typeof makePlaceCallbackData>[0] {
  switch (locationId) {
    case "location.korchma.yard":
      return "yard";
    case "location.korchma.hall":
      return "hall";
    case "location.korchma.quest_table":
      return "quest-table";
    case "location.korchma.bar":
      return "bar";
    case "location.korchma.cellar":
      return "cellar";
    case "location.korchma.barrel":
      return "barrel";
    case "location.korchma.news_corner":
      return "news-corner";
    case "location.korchma.ranger_corner":
      return "ranger-corner";
    case "location.korchma.fighting_corner":
      return "fighting-corner";
    case "location.korchma.deep":
      return "deep";
    default:
      return "hall";
  }
}
