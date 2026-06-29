import { InlineKeyboard } from "grammy";
import type { NearbyDuelCandidatesSnapshot, PresencePerson } from "../../services/presenceService";
import type { DuelResourceWarning } from "../../services/duelChallengeService";
import {
  makeNearbyDuelModeCallbackData,
  makeNearbyDuelOpenCallbackData,
  makeNearbyDuelSelectCallbackData
} from "../callbacks/nearbyDuelCallbackData";

const MAX_BUTTON_NAME_LENGTH = 32;

export function buildNearbyDuelOpenKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🥊 Кинути виклик присутнім", makeNearbyDuelOpenCallbackData());
}

export function buildNearbyDuelCandidatesKeyboard(
  snapshot: Extract<NearbyDuelCandidatesSnapshot, { state: "ready" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const candidate of snapshot.visible) {
    keyboard
      .text(
        `⚔️ ${formatCandidateButton(candidate)}`,
        makeNearbyDuelSelectCallbackData(candidate.telegramUserId, snapshot.page)
      )
      .row();
  }

  if (snapshot.totalPages > 1) {
    if (snapshot.page > 0) {
      keyboard.text("⬅️", makeNearbyDuelOpenCallbackData(snapshot.page - 1));
    }

    keyboard.text(`${snapshot.page + 1}/${snapshot.totalPages}`, makeNearbyDuelOpenCallbackData(snapshot.page));

    if (snapshot.page + 1 < snapshot.totalPages) {
      keyboard.text("➡️", makeNearbyDuelOpenCallbackData(snapshot.page + 1));
    }

    keyboard.row();
  }

  keyboard.text("🔎 Оновити", makeNearbyDuelOpenCallbackData(snapshot.page));
  return keyboard;
}

export function buildNearbyDuelModeKeyboard(targetTelegramUserId: bigint, page = 0): InlineKeyboard {
  return new InlineKeyboard()
    .text("⚡ Миттєва дуель", makeNearbyDuelModeCallbackData(targetTelegramUserId, "quick", false, page))
    .row()
    .text("♟️ Покрокова дуель", makeNearbyDuelModeCallbackData(targetTelegramUserId, "turn-based", false, page))
    .row()
    .text("⬅️ До присутніх", makeNearbyDuelOpenCallbackData(page));
}

export function buildNearbyDuelResourceWarningKeyboard(
  targetTelegramUserId: bigint,
  mode: "quick" | "turn-based",
  _warning: DuelResourceWarning,
  page = 0
): InlineKeyboard {
  void _warning;
  return new InlineKeyboard()
    .text("🥊 Кинути все одно", makeNearbyDuelModeCallbackData(targetTelegramUserId, mode, true, page))
    .row()
    .text("⬅️ До присутніх", makeNearbyDuelOpenCallbackData(page));
}

function formatCandidateButton(candidate: PresencePerson): string {
  const level = candidate.level ? ` · ${candidate.level}` : "";
  const name = candidate.name.length > MAX_BUTTON_NAME_LENGTH
    ? `${candidate.name.slice(0, MAX_BUTTON_NAME_LENGTH - 1)}…`
    : candidate.name;

  return `${name}${level}`;
}
