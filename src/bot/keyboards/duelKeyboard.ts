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
  makeDuelInviteRotateCallbackData,
  makeDuelNewCallbackData,
  makeDuelNewTurnBasedCallbackData,
  makeDuelNewTurnBasedRiskCallbackData,
  makeDuelNewRiskCallbackData,
  makeDuelRematchCallbackData,
  makeDuelRematchRiskCallbackData,
  makeDuelShareCallbackData,
  makeDuelTurnCallbackData,
  makeDuelViewCallbackData
} from "../callbacks/duelCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildDuelEntryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚡ Миттєва дуель", makeDuelNewCallbackData())
    .row()
    .text("♟️ Покрокова дуель", makeDuelNewTurnBasedCallbackData())
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

export function buildDuelTargetedInviteKeyboard(
  result: Extract<DuelCreateResult | DuelChallengeView, { state: "pending" }>
): InlineKeyboard {
  const token = result.challenge.inviteToken;

  return new InlineKeyboard()
    .text("🤝 Прийняти", makeDuelAcceptCallbackData(token))
    .row()
    .text("🙅 Не зараз", makeDuelDeclineCallbackData(token))
    .row()
    .text("🔎 Оновити", makeDuelViewCallbackData(token));
}

export function buildDuelInviteShareKeyboard(token: string, templateIndex: number): InlineKeyboard {
  return new InlineKeyboard().text(
    "🎲 Інший текст",
    makeDuelInviteRotateCallbackData(token, templateIndex)
  );
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
    .text("🥊 До кутка", makePlaceCallbackData("fighting-corner"));
}

export function buildDuelCreateResourceWarningKeyboard(mode: "quick" | "turn-based" = "quick"): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      "🥊 Так, кинути виклик",
      mode === "turn-based" ? makeDuelNewTurnBasedRiskCallbackData() : makeDuelNewRiskCallbackData()
    )
    .row()
    .text("📋 До справ", makeQuestCallbackData("list"))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildTurnBasedDuelKeyboard(
  result: Extract<DuelChallengeView, { state: "active" }>,
  viewerCharacterId: string | null,
  skillLabel: string
): InlineKeyboard {
  const token = result.challenge.inviteToken;
  const session = result.session;
  const viewerSide =
    viewerCharacterId === session.state.participants.challenger.characterId
      ? "challenger"
      : viewerCharacterId === session.state.participants.target.characterId
        ? "target"
        : null;
  const canAct =
    viewerSide !== null &&
    session.status === "active" &&
    !session.state.pendingActions?.[viewerSide];
  const keyboard = new InlineKeyboard();

  if (canAct) {
    keyboard
      .text("⚔️ Атакувати", makeDuelTurnCallbackData(token, "attack", session.turn, session.version))
      .row()
      .text(skillLabel, makeDuelTurnCallbackData(token, "skill", session.turn, session.version))
      .row()
      .text("🏳️ Здатися", makeDuelTurnCallbackData(token, "surrender", session.turn, session.version))
      .row();
  }

  return keyboard.text("🔎 Оновити", makeDuelViewCallbackData(token));
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
