import { InlineKeyboard } from "grammy";
import type {
  DailyKorchmaRoundClaimResult,
  DailyKorchmaRoundLookupResult,
  DailyKorchmaRoundSceneLookupResult,
  DailyKorchmaRoundStepResult
} from "../../services/dailyKorchmaRoundService";
import { makeDailyKorchmaRoundActionCallbackData, makeDailyKorchmaRoundOverviewCallbackData } from "../callbacks/dailyKorchmaRoundCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildDailyKorchmaRoundOverviewKeyboard(
  result: DailyKorchmaRoundLookupResult
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

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
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildDailyKorchmaRoundStepKeyboard(result: DailyKorchmaRoundStepResult): InlineKeyboard {
  if (result.state !== "step-completed" && result.state !== "step-replayed") {
    return new InlineKeyboard().text("🧾 До обходу", makePlaceCallbackData("quest-table"));
  }

  const keyboard = new InlineKeyboard()
    .text("🧾 До обходу", makeDailyKorchmaRoundOverviewCallbackData(result.offer.dayToken))
    .row();

  keyboard.text("🍺 До зали", makePlaceCallbackData("hall"));

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
