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
  makeGroupCombatItemsMenuCallbackData,
  makeGroupCombatJournalCallbackData,
  makeGroupCombatStatisticsCallbackData,
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
      );
    }
    keyboard.text(
      "📊 Статистика",
      makeGroupCombatStatisticsCallbackData(session.partyInviteToken)
    ).row();
    const viewer = session.participants.find(
      (participant) => participant.characterId === viewerCharacterId
    );
    return viewer?.settlementStatus === "pending"
      ? keyboard.text("🔎 Оновити", makeGroupCombatViewCallbackData(session.partyInviteToken))
      : keyboard;
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

  const livingEnemies = session.state.enemies.filter((enemy) => enemy.hp > 0);
  session.state.enemies.forEach((enemy, targetIndex) => {
    if (enemy.hp <= 0) {
      return;
    }
    addActionButton(
      livingEnemies.length === 1 ? "⚔️ Атакувати" : `⚔️ ${enemy.name}`,
      makeGroupCombatActionCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      action: "attack",
      targetIndex
      })
    );
  });
  addActionButton("🛡️ Захиститися", makeGroupCombatActionCallbackData({
    token: session.partyInviteToken,
    turn: session.turn,
    action: "guard",
    targetIndex: viewer.rosterOrder
  }));
  addAbilityButtons("class");
  addAbilityButtons("race");
  (viewer.gearAbilityIds ?? []).forEach((abilityId, optionIndex) => addAbilityButtons("gear", abilityId, optionIndex));
  if (buttonsInRow > 0) {
    keyboard.row();
    buttonsInRow = 0;
  }
  if (listAvailableGroupCombatItems(session, viewer.characterId).length > 0) {
    keyboard
      .text(
        "🎒 Одноразові манатки",
        makeGroupCombatItemsMenuCallbackData(session.partyInviteToken, session.turn)
      )
      .row();
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

export function buildGroupCombatItemsKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const item of listAvailableGroupCombatItems(session, viewerCharacterId)) {
    keyboard.text(
      formatGroupCombatItemButton(item.itemId, item.quantity),
      makeGroupCombatActionCallbackData({
        token: session.partyInviteToken,
        turn: session.turn,
        action: "item",
        optionIndex: item.optionIndex,
        targetIndex: item.rosterOrder
      })
    ).row();
  }

  return keyboard.text(
    "↩️ До бою",
    makeGroupCombatViewCallbackData(session.partyInviteToken)
  );
}

export function buildGroupCombatStatisticsKeyboard(
  session: GroupCombatSessionRecord
): InlineKeyboard {
  return new InlineKeyboard().text(
    "↩️ До результатів",
    makeGroupCombatViewCallbackData(session.partyInviteToken)
  );
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

interface AvailableGroupCombatItem {
  itemId: (typeof GROUP_COMBAT_SUPPORTED_ITEM_IDS)[number];
  optionIndex: number;
  quantity: number;
  rosterOrder: number;
}

function listAvailableGroupCombatItems(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): AvailableGroupCombatItem[] {
  if (session.status !== "active") {
    return [];
  }
  const viewer = session.state.participants.find(
    (participant) => participant.characterId === viewerCharacterId
  );
  if (!viewer || viewer.hp <= 0) {
    return [];
  }

  return GROUP_COMBAT_SUPPORTED_ITEM_IDS.flatMap((itemId, optionIndex) => {
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
      return [];
    }
    return [{
      itemId,
      optionIndex,
      quantity: viewer.combatItemQuantities[itemId] ?? 0,
      rosterOrder: viewer.rosterOrder
    }];
  });
}

function formatGroupCombatItemButton(
  itemId: (typeof GROUP_COMBAT_SUPPORTED_ITEM_IDS)[number],
  quantity: number
): string {
  const quantityLabel = quantity > 1 ? ` ×${quantity}` : "";
  return `${GROUP_COMBAT_ITEM_BUTTONS[itemId]}${quantityLabel}`;
}

const GROUP_COMBAT_ITEM_BUTTONS: Record<(typeof GROUP_COMBAT_SUPPORTED_ITEM_IDS)[number], string> = {
  "item.responsible-panic-bandage": "🩹 Бинт відповідальної паніки",
  "item.dense-bandage": "🩹 Щільний бинт",
  "item.field-kit": "⚕️ Польова аптечка"
};
