import { InlineKeyboard } from "grammy";
import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import {
  makeGroupCombatActionCallbackData,
  makeGroupCombatViewCallbackData
} from "../callbacks/groupCombatCallbackData";

export function buildGroupCombatKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (session.status !== "active") {
    return keyboard.text("🔎 Оновити", makeGroupCombatViewCallbackData(session.partyInviteToken));
  }
  const viewer = session.state.participants.find((participant) => participant.characterId === viewerCharacterId);
  const alreadyQueued = session.queuedActions.some((action) => action.actorCharacterId === viewerCharacterId);
  if (!viewer || viewer.hp <= 0 || alreadyQueued) {
    return keyboard.text("🔎 Оновити", makeGroupCombatViewCallbackData(session.partyInviteToken));
  }

  session.state.enemies.forEach((enemy, targetIndex) => {
    if (enemy.hp <= 0) {
      return;
    }
    keyboard.text(`⚔️ ${enemy.name}`, makeGroupCombatActionCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      action: "attack",
      targetIndex
    })).row();
  });
  keyboard.text("🛡️ Захистити себе", makeGroupCombatActionCallbackData({
    token: session.partyInviteToken,
    turn: session.turn,
    action: "guard",
    targetIndex: viewer.rosterOrder
  })).row();
  session.state.participants.forEach((ally, targetIndex) => {
    if (ally.characterId === viewerCharacterId || ally.hp <= 0) {
      return;
    }
    keyboard.text(`🫶 Підтримати ${ally.name}`, makeGroupCombatActionCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      action: "aid",
      targetIndex
    })).row();
  });
  return keyboard.text("🔎 Оновити", makeGroupCombatViewCallbackData(session.partyInviteToken));
}
