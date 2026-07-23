import { InlineKeyboard } from "grammy";
import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import {
  getGroupCombatActionProfile,
  GROUP_COMBAT_SUPPORTED_ITEM_IDS,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActionKey
} from "../../domain/groupCombat/groupCombat";
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
  addAbilityButtons("class");
  addAbilityButtons("race");
  (viewer.gearAbilityIds ?? []).forEach((abilityId, optionIndex) => addAbilityButtons("gear", abilityId, optionIndex));
  GROUP_COMBAT_SUPPORTED_ITEM_IDS.forEach((itemId, optionIndex) => {
    const candidate: GroupCombatAction = {
      actorCharacterId: viewer.characterId,
      turn: session.turn,
      action: "item",
      targetKind: "self",
      targetId: viewer.characterId,
      payloadKey: itemId,
      origin: "manual"
    };
    if (validateGroupCombatAction(session.state, candidate) !== "ok") {
      return;
    }
    addActionButton(GROUP_COMBAT_ITEM_BUTTONS[itemId], makeGroupCombatActionCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      action: "item",
      optionIndex,
      targetIndex: viewer.rosterOrder
    }));
  });
  if (buttonsInRow > 0) {
    keyboard.row();
  }
  return keyboard.text("🔎 Оновити", makeGroupCombatViewCallbackData(session.partyInviteToken));

  function addAbilityButtons(action: Extract<GroupCombatActionKey, "class" | "race" | "gear">, payloadKey?: string, optionIndex = 0): void {
    const profile = getGroupCombatActionProfile(viewer!, action, payloadKey);
    if (!profile) {
      return;
    }
    const scopes = [profile.ability.primaryTargetScope, profile.ability.secondaryTargetScope].filter(Boolean);
    const explicitEnemy = scopes.includes("single-enemy");
    const explicitAlly = scopes.includes("single-ally-or-self");
    const targets = explicitEnemy
      ? session.state.enemies
          .map((target, targetIndex) => ({ target, targetIndex }))
          .filter(({ target }) => target.hp > 0)
          .map(({ target, targetIndex }) => ({ kind: "enemy" as const, id: target.id, targetIndex }))
      : explicitAlly
        ? session.state.participants
            .map((target, targetIndex) => ({ target, targetIndex }))
            .filter(({ target }) => target.hp > 0)
            .map(({ target, targetIndex }) => ({
              kind: target.characterId === viewer!.characterId ? "self" as const : "ally" as const,
              id: target.characterId,
              targetIndex
            }))
        : [{ kind: "self" as const, id: viewer!.characterId, targetIndex: viewer!.rosterOrder }];
    for (const target of targets) {
      const candidate: GroupCombatAction = {
        actorCharacterId: viewer!.characterId,
        turn: session.turn,
        action,
        targetKind: target.kind,
        targetId: target.id,
        ...(payloadKey ? { payloadKey } : {}),
        origin: "manual"
      };
      if (validateGroupCombatAction(session.state, candidate) !== "ok") {
        continue;
      }
      const suffix = targets.length > 1
        ? target.kind === "enemy"
          ? ` → ${session.state.enemies[target.targetIndex]?.name ?? "ворог"}`
          : ` → ${session.state.participants[target.targetIndex]?.name ?? "союзник"}`
        : "";
      addActionButton(`${profile.ability.label}${suffix}`, makeGroupCombatActionCallbackData({
        token: session.partyInviteToken,
        turn: session.turn,
        action,
        optionIndex,
        targetIndex: target.targetIndex
      }));
    }
  }
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

const GROUP_COMBAT_ITEM_BUTTONS: Record<(typeof GROUP_COMBAT_SUPPORTED_ITEM_IDS)[number], string> = {
  "item.responsible-panic-bandage": "🩹 Бинт",
  "item.dense-bandage": "🧻 Щільний бинт",
  "item.field-kit": "🧰 Аптечка"
};
