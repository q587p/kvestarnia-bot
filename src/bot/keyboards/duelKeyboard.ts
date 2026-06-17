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
  makeDuelRematchCallbackData,
  makeDuelRematchRiskCallbackData,
  makeDuelShareCallbackData,
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

export function buildDuelResultKeyboard(token?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (token) {
    keyboard
      .text("🔁 Реванш", makeDuelRematchCallbackData(token))
      .text("📣 Картка", makeDuelShareCallbackData(token))
      .row();
  }

  return keyboard
    .text("🥊 Покликати ще когось", makeDuelNewCallbackData())
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

export function buildDuelAcceptConfirmationKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🤝 Так, прийняти", makeDuelAcceptRiskCallbackData(token))
    .row()
    .text("🙅 Ні, не зараз", makeDuelDeclineCallbackData(token))
    .row()
    .text("🔎 Оновити", makeDuelViewCallbackData(token));
}

export function buildDuelResourceWarningKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🤝 Прийняти все одно", makeDuelAcceptRiskCallbackData(token))
    .row()
    .text("🙅 Не зараз", makeDuelDeclineCallbackData(token))
    .row()
    .text("🔎 Оновити", makeDuelViewCallbackData(token));
}

export function buildDuelRematchResourceWarningKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔁 Реванш усе одно", makeDuelRematchRiskCallbackData(token))
    .row()
    .text("📣 Картка", makeDuelShareCallbackData(token))
    .row()
    .text("📋 До справ", makeQuestCallbackData("list"));
}
