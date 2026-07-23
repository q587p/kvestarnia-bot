import { InlineKeyboard } from "grammy";
import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import {
  makeGroupCombatActionCallbackData,
  makeGroupCombatJournalCallbackData,
  makeGroupCombatViewCallbackData
} from "../callbacks/groupCombatCallbackData";

export function buildGroupCombatKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (session.status !== "active") {
    if (session.state.recap.length > 0) {
      keyboard.text(
        "📜 Журнал",
        makeGroupCombatJournalCallbackData(session.partyInviteToken, session.state.recap.length - 1)
      ).row();
    }
    return keyboard.text("🔎 Оновити", makeGroupCombatViewCallbackData(session.partyInviteToken));
  }
  const viewer = session.state.participants.find((participant) => participant.characterId === viewerCharacterId);
  if (!viewer || viewer.hp <= 0) {
    return keyboard.text("🔎 Оновити", makeGroupCombatViewCallbackData(session.partyInviteToken));
  }

  let buttonsInRow = 0;
  const addActionButton = (label: string, callbackData: string): void => {
    keyboard.text(label, callbackData);
    buttonsInRow += 1;
    if (buttonsInRow === 2) {
      keyboard.row();
      buttonsInRow = 0;
    }
  };

  session.state.enemies.forEach((enemy, targetIndex) => {
    if (enemy.hp <= 0) {
      return;
    }
    addActionButton(`⚔️ ${enemy.name}`, makeGroupCombatActionCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      action: "attack",
      targetIndex
    }));
  });
  addActionButton("🛡️ Захиститися", makeGroupCombatActionCallbackData({
    token: session.partyInviteToken,
    turn: session.turn,
    action: "guard",
    targetIndex: viewer.rosterOrder
  }));
  session.state.participants.forEach((ally, targetIndex) => {
    if (ally.characterId === viewerCharacterId || ally.hp <= 0 || ally.hp >= ally.hpMax) {
      return;
    }
    addActionButton(`🫶 ${ally.name}`, makeGroupCombatActionCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      action: "aid",
      targetIndex
    }));
  });
  if (buttonsInRow > 0) {
    keyboard.row();
  }
  return keyboard.text("🔎 Оновити", makeGroupCombatViewCallbackData(session.partyInviteToken));
}

export function buildGroupCombatJournalKeyboard(
  session: GroupCombatSessionRecord,
  requestedPage: number
): InlineKeyboard {
  const total = Math.max(1, session.state.recap.length);
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), total - 1);
  const keyboard = new InlineKeyboard();

  if (total > 1) {
    if (page > 0) {
      keyboard
        .text("⏮️ Початок", makeGroupCombatJournalCallbackData(session.partyInviteToken, 0))
        .text("◀️ Назад", makeGroupCombatJournalCallbackData(session.partyInviteToken, page - 1))
        .row();
    }
    keyboard.text(`${page + 1}/${total}`, makeGroupCombatJournalCallbackData(session.partyInviteToken, page)).row();
    if (page < total - 1) {
      keyboard
        .text("Далі ▶️", makeGroupCombatJournalCallbackData(session.partyInviteToken, page + 1))
        .text("Кінець ⏭️", makeGroupCombatJournalCallbackData(session.partyInviteToken, total - 1))
        .row();
    }
  }

  return keyboard.text(
    session.status === "active" ? "↩️ До бою" : "↩️ До результатів",
    makeGroupCombatViewCallbackData(session.partyInviteToken)
  );
}
