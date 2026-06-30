import { InlineKeyboard } from "grammy";
import type { PartySessionRecord } from "../../db/repositories/partySessionRepository";
import type { PartyBossSessionRecord } from "../../db/repositories/partyBossRepository";
import type { NearbyDuelCandidatesSnapshot, PresencePerson } from "../../services/presenceService";
import {
  makePartyBossActionCallbackData,
  makePartyBossJournalCallbackData,
  makePartyBossStartCallbackData,
  makePartyBossTimeoutCallbackData,
  makePartySessionCancelCallbackData,
  makePartySessionExpireCallbackData,
  makePartySessionJoinCallbackData,
  makePartySessionLeaveCallbackData,
  makePartySessionNearbyInviteCallbackData,
  makePartySessionNearbyOpenCallbackData,
  makePartySessionViewCallbackData
} from "../callbacks/partySessionCallbackData";

const MAX_BUTTON_NAME_LENGTH = 32;

export function buildPartySessionKeyboard(
  session: PartySessionRecord,
  options: {
    viewerCharacterId?: string | null | undefined;
    includeDevExpire?: boolean | undefined;
    includeBossStart?: boolean | undefined;
  } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const token = session.inviteToken;

  if (session.status === "recruiting") {
    const viewer = options.viewerCharacterId
      ? session.participants.find(
          (participant) =>
            participant.characterId === options.viewerCharacterId && participant.status === "joined"
        )
      : null;

    if (!viewer) {
      keyboard.text("🤝 Приєднатися", makePartySessionJoinCallbackData(token)).row();
    } else {
      keyboard.text("🚪 Вийти", makePartySessionLeaveCallbackData(token)).row();
    }

    if (options.viewerCharacterId === session.leaderCharacterId) {
      keyboard.text("🧹 Скасувати збір", makePartySessionCancelCallbackData(token)).row();
    }

    if (options.includeBossStart && options.viewerCharacterId === session.leaderCharacterId) {
      keyboard.text("🛢️ Почати рейд", makePartyBossStartCallbackData(token)).row();
    } else if (options.includeDevExpire && options.viewerCharacterId === session.leaderCharacterId) {
      keyboard.text("🧪 Dev: бос-проба", makePartyBossStartCallbackData(token)).row();
    }

    if (options.includeDevExpire) {
      keyboard.text("⏱️ Dev: завершити строк", makePartySessionExpireCallbackData(token)).row();
    }
  }

  return keyboard.text("🔎 Оновити", makePartySessionViewCallbackData(token));
}

export function buildPartyBossKeyboard(
  session: PartyBossSessionRecord,
  viewerCharacterId: string | null,
  options: { includeDevTimeout?: boolean | undefined } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const viewer = viewerCharacterId
    ? session.state.participants.find((participant) => participant.characterId === viewerCharacterId)
    : null;
  const canAct = viewer?.status === "active" && viewer.resources.hp > 0;

  if (session.status === "active" && viewerCharacterId && canAct) {
    keyboard
      .text("⚔️ Вдарити", makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "attack"))
      .text("🛡️ Захист", makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "defend"))
      .row()
      .text("✨ Вміння", makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "skill"))
      .text("🧬 Раса", makePartyBossActionCallbackData(session.partyInviteToken, session.turn, "race"))
      .row();
  }

  if (session.status === "active" && options.includeDevTimeout) {
    keyboard.text("⏱️ Dev: добити хід", makePartyBossTimeoutCallbackData(session.partyInviteToken)).row();
  }

  keyboard.text("📜 Журнал", makePartyBossJournalCallbackData(session.partyInviteToken)).row();
  return keyboard.text("🔎 Оновити", makePartySessionViewCallbackData(session.partyInviteToken));
}

export function buildPartySessionInviteKeyboard(session: PartySessionRecord): InlineKeyboard {
  return new InlineKeyboard()
    .text("🤝 Приєднатися", makePartySessionJoinCallbackData(session.inviteToken))
    .row()
    .text("🔎 Оновити", makePartySessionViewCallbackData(session.inviteToken));
}

export function buildPartySessionNearbyCandidatesKeyboard(
  snapshot: Extract<NearbyDuelCandidatesSnapshot, { state: "ready" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const candidate of snapshot.visible) {
    keyboard
      .text(
        `🧭 Покликати у ватагу: ${formatCandidateButton(candidate)}`,
        makePartySessionNearbyInviteCallbackData(candidate.telegramUserId, snapshot.page)
      )
      .row();
  }

  if (snapshot.totalPages > 1) {
    if (snapshot.page > 0) {
      keyboard.text("⬅️", makePartySessionNearbyOpenCallbackData(snapshot.page - 1));
    }

    keyboard.text(`${snapshot.page + 1}/${snapshot.totalPages}`, makePartySessionNearbyOpenCallbackData(snapshot.page));

    if (snapshot.page + 1 < snapshot.totalPages) {
      keyboard.text("➡️", makePartySessionNearbyOpenCallbackData(snapshot.page + 1));
    }

    keyboard.row();
  }

  keyboard.text("🔎 Оновити", makePartySessionNearbyOpenCallbackData(snapshot.page));
  return keyboard;
}

function formatCandidateButton(candidate: PresencePerson): string {
  const level = candidate.level ? ` · ${candidate.level}` : "";
  const name = candidate.name.length > MAX_BUTTON_NAME_LENGTH
    ? `${candidate.name.slice(0, MAX_BUTTON_NAME_LENGTH - 1)}…`
    : candidate.name;

  return `${name}${level}`;
}
