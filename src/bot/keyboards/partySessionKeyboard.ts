import { InlineKeyboard } from "grammy";
import type { PartySessionRecord } from "../../db/repositories/partySessionRepository";
import {
  makePartySessionCancelCallbackData,
  makePartySessionExpireCallbackData,
  makePartySessionJoinCallbackData,
  makePartySessionLeaveCallbackData,
  makePartySessionViewCallbackData
} from "../callbacks/partySessionCallbackData";

export function buildPartySessionKeyboard(
  session: PartySessionRecord,
  options: {
    viewerCharacterId?: string | null | undefined;
    includeDevExpire?: boolean | undefined;
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

    if (options.includeDevExpire) {
      keyboard.text("⏱️ Dev: завершити строк", makePartySessionExpireCallbackData(token)).row();
    }
  }

  return keyboard.text("🔎 Оновити", makePartySessionViewCallbackData(token));
}

export function buildPartySessionInviteKeyboard(session: PartySessionRecord): InlineKeyboard {
  return new InlineKeyboard()
    .text("🤝 Приєднатися", makePartySessionJoinCallbackData(session.inviteToken))
    .row()
    .text("🔎 Оновити", makePartySessionViewCallbackData(session.inviteToken));
}
