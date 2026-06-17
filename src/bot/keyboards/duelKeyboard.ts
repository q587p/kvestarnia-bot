import { InlineKeyboard } from "grammy";
import type {
  DuelChallengeView,
  DuelCreateResult
} from "../../services/duelChallengeService";
import {
  makeDuelAcceptCallbackData,
  makeDuelAcceptRiskCallbackData,
  makeDuelCancelCallbackData,
  makeDuelDeclineCallbackData,
  makeDuelNewCallbackData,
  makeDuelNewRiskCallbackData,
  makeDuelViewCallbackData
} from "../callbacks/duelCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildDuelEntryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🥊 Кинути виклик", makeDuelNewCallbackData())
    .row()
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildDuelChallengeKeyboard(
  result: Extract<DuelCreateResult | DuelChallengeView, { state: "pending" }>
): InlineKeyboard {
  const token = result.challenge.inviteToken;

  return new InlineKeyboard()
    .text("🤝 Прийняти", makeDuelAcceptCallbackData(token))
    .row()
    .text("🙅 Не зараз", makeDuelDeclineCallbackData(token))
    .row()
    .text("🧹 Скасувати виклик", makeDuelCancelCallbackData(token))
    .row()
    .text("🔎 Оновити", makeDuelViewCallbackData(token));
}

export function buildDuelResultKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🥊 Новий виклик", makeDuelNewCallbackData())
    .row()
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildDuelCreateResourceWarningKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🥊 Так, кинути виклик", makeDuelNewRiskCallbackData())
    .row()
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildDuelNavigationKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildDuelResourceWarningKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🤝 Прийняти все одно", makeDuelAcceptRiskCallbackData(token))
    .row()
    .text("🙅 Не зараз", makeDuelDeclineCallbackData(token))
    .row()
    .text("🔎 Оновити", makeDuelViewCallbackData(token));
}
