import { InlineKeyboard, Keyboard } from "grammy";
import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import {
  getGroupCombatActionProfile,
  GROUP_COMBAT_SUPPORTED_ITEM_IDS,
  isActiveGroupCombatParticipant,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActionKey
} from "../../domain/groupCombat/groupCombat";
import {
  makeGroupCombatActionCallbackData,
  makeGroupCombatJournalCallbackData,
  makeGroupCombatStatisticsCallbackData,
  makeGroupCombatViewCallbackData
} from "../callbacks/groupCombatCallbackData";
import { getDistinctShortMonsterNames } from "../presenters/monsterNamePresenter";

export const groupCombatReplyButtons = {
  attack: "⚔️ Атакувати",
  guard: "🛡️ Захиститися",
  items: "🎒 Разові",
  flee: "🏃 Відступити",
  refresh: "🔎 Оновити"
} as const;

export type GroupCombatReplyButtonAction = keyof typeof groupCombatReplyButtons;
export type GroupCombatActionMenu = "attack" | "abilities";

export function buildGroupCombatReplyKeyboard(
  session?: GroupCombatSessionRecord,
  viewerCharacterId?: string
): Keyboard {
  const viewer = session && viewerCharacterId
    ? session.state.participants.find(
        (participant) => participant.characterId === viewerCharacterId
      )
    : undefined;
  if (session && viewerCharacterId && (!viewer || !isActiveGroupCombatParticipant(viewer))) {
    return new Keyboard()
      .text(groupCombatReplyButtons.refresh)
      .resized()
      .persistent()
      .placeholder("Стежимо за боєм");
  }
  const keyboard = new Keyboard().text(groupCombatReplyButtons.attack);
  const abilityLabels = session && viewerCharacterId
    ? listGroupCombatReplyAbilities(session, viewerCharacterId).map(({ label }) => label)
    : [];
  for (const label of abilityLabels) {
    keyboard.text(label).row();
  }
  if (abilityLabels.length === 0) {
    keyboard.row();
  }
  return keyboard
    .text(groupCombatReplyButtons.guard)
    .text(groupCombatReplyButtons.items)
    .row()
    .text(groupCombatReplyButtons.flee)
    .text(groupCombatReplyButtons.refresh)
    .resized()
    .persistent()
    .placeholder("Що робимо в бою?");
}

export interface GroupCombatReplyAbility {
  action: Extract<GroupCombatActionKey, "class" | "race" | "gear">;
  label: string;
  optionIndex: number;
}

export function listGroupCombatReplyAbilities(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): GroupCombatReplyAbility[] {
  const viewer = session.state.participants.find(
    (participant) => participant.characterId === viewerCharacterId
  );
  if (!viewer || !isActiveGroupCombatParticipant(viewer)) {
    return [];
  }
  const abilities: GroupCombatReplyAbility[] = [];
  const add = (
    action: GroupCombatReplyAbility["action"],
    payloadKey?: string,
    optionIndex = 0
  ): void => {
    const profile = getGroupCombatActionProfile(viewer, action, payloadKey);
    const label = profile?.ability.label;
    if (
      label &&
      !abilities.some((ability) => ability.label === label)
    ) {
      abilities.push({ action, label, optionIndex });
    }
  };
  add("class");
  add("race");
  (viewer.gearAbilityIds ?? []).forEach((abilityId, optionIndex) =>
    add("gear", abilityId, optionIndex)
  );
  return abilities;
}

export function parseGroupCombatReplyAbility(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  text: string | undefined
): GroupCombatReplyAbility | null {
  if (!text) {
    return null;
  }
  return listGroupCombatReplyAbilities(session, viewerCharacterId)
    .find((ability) => ability.label === text) ?? null;
}

export function parseGroupCombatReplyButton(
  text: string | undefined
): GroupCombatReplyButtonAction | null {
  if (!text) {
    return null;
  }
  return (Object.entries(groupCombatReplyButtons) as Array<
    [GroupCombatReplyButtonAction, string]
  >).find(([, label]) => label === text)?.[0] ?? null;
}

export function buildGroupCombatAbilityTargetKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  ability: GroupCombatReplyAbility
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const buttons = listGroupCombatAbilityActionButtons(
    session,
    viewerCharacterId,
    ability.action,
    ability.optionIndex
  );
  buttons.forEach((button, index) => {
    keyboard.text(button.label, button.callbackData);
    if (index % 2 === 1) {
      keyboard.row();
    }
  });
  if (buttons.length % 2 === 1) {
    keyboard.row();
  }
  return keyboard.text(
    "↩️ До бою",
    makeGroupCombatViewCallbackData(session.partyInviteToken)
  );
}

export function buildGroupCombatKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): InlineKeyboard {
  if (session.status === "active") {
    return new InlineKeyboard([]);
  }
  return buildGroupCombatActionMenuKeyboard(session, viewerCharacterId, "attack");
}

export function buildGroupCombatActionMenuKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  menu: GroupCombatActionMenu
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
  if (!viewer || !isActiveGroupCombatParticipant(viewer)) {
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

  if (menu === "attack") {
    const livingEnemies = session.state.enemies.filter((enemy) => enemy.hp > 0);
    const shortEnemyNames = getDistinctShortMonsterNames(livingEnemies);
    session.state.enemies.forEach((enemy, targetIndex) => {
      if (enemy.hp <= 0) {
        return;
      }
      addActionButton(
        livingEnemies.length === 1
          ? "⚔️ Атакувати"
          : `⚔️ ${shortEnemyNames.get(enemy.order) ?? "Монстр"}`,
        makeGroupCombatActionCallbackData({
          token: session.partyInviteToken,
          turn: session.turn,
          action: "attack",
          targetIndex,
          source: "reply-menu"
        })
      );
    });
  } else {
    addAbilityButtons("class");
    addAbilityButtons("race");
    (viewer.gearAbilityIds ?? []).forEach((abilityId, optionIndex) =>
      addAbilityButtons("gear", abilityId, optionIndex)
    );
  }
  if (buttonsInRow > 0) {
    keyboard.row();
  }
  return keyboard.text("↩️ До бою", makeGroupCombatViewCallbackData(session.partyInviteToken));

  function addAbilityButtons(action: Extract<GroupCombatActionKey, "class" | "race" | "gear">, payloadKey?: string, optionIndex = 0): void {
    for (const button of listGroupCombatAbilityActionButtons(
      session,
      viewerCharacterId,
      action,
      optionIndex,
      payloadKey
    )) {
      addActionButton(button.label, button.callbackData);
    }
  }
}

function listGroupCombatAbilityActionButtons(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  action: Extract<GroupCombatActionKey, "class" | "race" | "gear">,
  optionIndex: number,
  explicitPayloadKey?: string
): Array<{ label: string; callbackData: string }> {
  const viewer = session.state.participants.find(
    (participant) => participant.characterId === viewerCharacterId
  );
  if (!viewer || !isActiveGroupCombatParticipant(viewer)) {
    return [];
  }
  const payloadKey = explicitPayloadKey ??
    (action === "gear" ? viewer.gearAbilityIds?.[optionIndex] : undefined);
  const profile = getGroupCombatActionProfile(viewer, action, payloadKey);
  if (!profile) {
    return [];
  }
  const scopes = [
    profile.ability.primaryTargetScope,
    profile.ability.secondaryTargetScope
  ].filter(Boolean);
  const targets = scopes.includes("single-enemy")
    ? session.state.enemies
        .map((target, targetIndex) => ({ target, targetIndex }))
        .filter(({ target }) => target.hp > 0)
        .map(({ target, targetIndex }) => ({
          kind: "enemy" as const,
          id: target.id,
          targetIndex
        }))
    : scopes.includes("single-ally-or-self")
      ? session.state.participants
          .map((target, targetIndex) => ({ target, targetIndex }))
          .filter(({ target }) => target.hp > 0)
          .map(({ target, targetIndex }) => ({
            kind: target.characterId === viewer.characterId ? "self" as const : "ally" as const,
            id: target.characterId,
            targetIndex
          }))
      : [{ kind: "self" as const, id: viewer.characterId, targetIndex: viewer.rosterOrder }];
  const targetEnemyNames = getDistinctShortMonsterNames(
    session.state.enemies.filter((enemy) => enemy.hp > 0)
  );
  return targets.flatMap((target) => {
    const candidate: GroupCombatAction = {
      actorCharacterId: viewer.characterId,
      turn: session.turn,
      action,
      targetKind: target.kind,
      targetId: target.id,
      ...(payloadKey ? { payloadKey } : {}),
      origin: "manual"
    };
    if (validateGroupCombatAction(session.state, candidate) !== "ok") {
      return [];
    }
    const suffix = targets.length > 1
      ? target.kind === "enemy"
        ? ` → ${targetEnemyNames.get(
            session.state.enemies[target.targetIndex]?.order ?? -1
          ) ?? "ворог"}`
        : ` → ${session.state.participants[target.targetIndex]?.name ?? "союзник"}`
      : "";
    return [{
      label: `${profile.ability.label}${suffix}`,
      callbackData: makeGroupCombatActionCallbackData({
        token: session.partyInviteToken,
        turn: session.turn,
        action,
        optionIndex,
        targetIndex: target.targetIndex,
        source: "reply-menu"
      })
    }];
  });
}

export function buildGroupCombatItemsKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  source?: "reply-menu"
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
        targetIndex: item.rosterOrder,
        ...(source ? { source } : {})
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
  if (!viewer || !isActiveGroupCombatParticipant(viewer)) {
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
