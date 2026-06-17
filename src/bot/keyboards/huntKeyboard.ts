import { InlineKeyboard } from "grammy";
import type { HuntLookupResult, HuntResult } from "../../services/huntService";
import { makeBestiaryMonsterCallbackData } from "../callbacks/bestiaryCallbackData";
import { makeHuntActionCallbackData, makeHuntViewCallbackData } from "../callbacks/huntCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";

export function buildHuntBoardKeyboard(
  result: Extract<HuntLookupResult, { state: "ready" }>
): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      "🗡️ Вдарити по проблемі",
      makeHuntActionCallbackData(result.contract.localPeriodId, result.contract.contractToken, "strike")
    )
    .row()
    .text(
      "🎭 Обдурити проблему",
      makeHuntActionCallbackData(result.contract.localPeriodId, result.contract.contractToken, "trick")
    )
    .row()
    .text(
      "📋 Закрити актом",
      makeHuntActionCallbackData(result.contract.localPeriodId, result.contract.contractToken, "retreat")
    )
    .row()
    .text("📖 Запис у бестіарії", makeBestiaryMonsterCallbackData(result.contract.monster.id, 0))
    .row()
    .text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildHuntResultKeyboard(result: Exclude<HuntResult, { state: "no-character" }>): InlineKeyboard {
  if (result.state === "stale-period") {
    return new InlineKeyboard()
      .text("🏹 Оновити дошку", makeQuestCallbackData("hunt"))
      .row()
      .text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  if (result.state === "stale-contract") {
    return new InlineKeyboard()
      .text(
        "🏹 Оновити дошку",
        makeHuntViewCallbackData(
          result.currentContract.localPeriodId,
          result.currentContract.contractToken
        )
      )
      .row()
      .text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
}
