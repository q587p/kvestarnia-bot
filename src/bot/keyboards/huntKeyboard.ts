import { InlineKeyboard } from "grammy";
import type { HuntLookupResult, HuntResult } from "../../services/huntService";
import { makeHuntActionCallbackData, makeHuntViewCallbackData } from "../callbacks/huntCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildHuntBoardKeyboard(
  result: Extract<HuntLookupResult, { state: "ready" }>
): InlineKeyboard {
  return new InlineKeyboard()
    .text("🗡️ Вдарити по проблемі", makeHuntActionCallbackData(result.contract.localPeriodId, "strike"))
    .row()
    .text("🎭 Обдурити проблему", makeHuntActionCallbackData(result.contract.localPeriodId, "trick"))
    .row()
    .text("📋 Закрити актом", makeHuntActionCallbackData(result.contract.localPeriodId, "retreat"))
    .row()
    .text("⬅️ До столу", makePlaceCallbackData("quest-table"));
}

export function buildHuntResultKeyboard(result: Exclude<HuntResult, { state: "no-character" }>): InlineKeyboard {
  if (result.state === "stale-period") {
    return new InlineKeyboard()
      .text("🏹 Оновити дошку", makeHuntViewCallbackData(result.currentLocalPeriodId))
      .row()
      .text("⬅️ До столу", makePlaceCallbackData("quest-table"));
  }

  return new InlineKeyboard().text("⬅️ До столу", makePlaceCallbackData("quest-table"));
}
