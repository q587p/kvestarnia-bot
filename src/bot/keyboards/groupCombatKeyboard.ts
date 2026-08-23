import { InlineKeyboard, Keyboard } from "grammy";
import type { GroupCombatSessionRecord } from "../../db/repositories/groupCombatRepository";
import {
  getGroupCombatActionProfile,
  getGroupCombatItemPresentation,
  GROUP_COMBAT_SUPPORTED_ITEM_IDS,
  isActiveGroupCombatParticipant,
  validateGroupCombatAction,
  type GroupCombatAction,
  type GroupCombatActionKey
} from "../../domain/groupCombat/groupCombat";
import {
  makeGroupCombatActionCallbackData,
  makeGroupCombatItemsMenuCallbackData,
  makeGroupCombatJournalCallbackData,
  makeGroupCombatStatisticsCallbackData,
  makeGroupCombatTargetBackCallbackData,
  makeGroupCombatTargetMenuCallbackData,
  makeGroupCombatViewCallbackData
} from "../callbacks/groupCombatCallbackData";
import { getDistinctShortMonsterNames } from "../presenters/monsterNamePresenter";
import {
  buildCombatActionKeyboard,
  combatActionButtonLabels,
  type CombatActionKeyboardButton
} from "./combatActionKeyboardLayout";

export const groupCombatReplyButtons = {
  attack: combatActionButtonLabels.attack,
  guard: combatActionButtonLabels.defend,
  items: combatActionButtonLabels.items,
  flee: combatActionButtonLabels.flee,
  refresh: combatActionButtonLabels.refresh
} as const;

const legacyGroupCombatReplyButtonAliases: Readonly<Record<string, GroupCombatReplyButtonAction>> = {
  "⚔️ Атакувати": "attack",
  "🛡️ Захиститися": "guard",
  "🎒 Разові": "items"
};

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
  const keyboard = new Keyboard()
    .text(groupCombatReplyButtons.attack)
    .text(groupCombatReplyButtons.guard)
    .row();
  const abilityLabels = session && viewerCharacterId
    ? listGroupCombatReplyAbilities(session, viewerCharacterId).map(({ label }) => label)
    : [];
  abilityLabels.forEach((label, index) => {
    keyboard.text(label);
    if (index % 2 === 1 || index === abilityLabels.length - 1) {
      keyboard.row();
    }
  });
  if (
    session &&
    viewerCharacterId &&
    listAvailableGroupCombatItems(session, viewerCharacterId).length > 0
  ) {
    keyboard.text(groupCombatReplyButtons.items).row();
  }
  return keyboard
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
  return listFrozenGroupCombatReplyAbilities(session, viewerCharacterId)
    .filter((ability) => listGroupCombatAbilityActionButtons(
      session,
      viewerCharacterId,
      ability.action,
      ability.optionIndex
    ).length > 0);
}

export function listFrozenGroupCombatReplyAbilities(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string
): GroupCombatReplyAbility[] {
  const viewer = session.state.participants.find(
    (participant) => participant.characterId === viewerCharacterId
  );
  if (!viewer) {
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
  return listFrozenGroupCombatReplyAbilities(session, viewerCharacterId)
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
  >).find(([, label]) => label === text)?.[0]
    ?? legacyGroupCombatReplyButtonAliases[text]
    ?? null;
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
    ability.optionIndex,
    undefined,
    "reply-menu"
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
    "↩️ До дій",
    makeGroupCombatTargetBackCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      source: "reply-menu"
    })
  );
}

export function buildGroupCombatKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string | null
): InlineKeyboard {
  if (session.status !== "active") {
    return buildGroupCombatActionMenuKeyboard(session, viewerCharacterId, "attack");
  }
  const viewer = session.state.participants.find(
    (participant) => participant.characterId === viewerCharacterId
  );
  if (!viewerCharacterId || !viewer || !isActiveGroupCombatParticipant(viewer)) {
    return new InlineKeyboard().text(
      groupCombatReplyButtons.refresh,
      makeGroupCombatViewCallbackData(session.partyInviteToken)
    );
  }

  const attackButtons: CombatActionKeyboardButton[] = [];
  const abilityButtons: CombatActionKeyboardButton[] = [];
  const livingEnemies = session.state.enemies
    .map((enemy, targetIndex) => ({ enemy, targetIndex }))
    .filter(({ enemy }) => enemy.hp > 0);
  if (livingEnemies.length > 0) {
    attackButtons.push({
      label: groupCombatReplyButtons.attack,
      callbackData: livingEnemies.length === 1
        ? makeGroupCombatActionCallbackData({
            token: session.partyInviteToken,
            turn: session.turn,
            action: "attack",
            targetIndex: livingEnemies[0]!.targetIndex
          })
        : makeGroupCombatTargetMenuCallbackData({
            token: session.partyInviteToken,
            turn: session.turn,
            action: "attack"
          })
    });
  }
  const addAbilityButtons = (
    action: Extract<GroupCombatActionKey, "class" | "race" | "gear">,
    optionIndex = 0,
    payloadKey?: string
  ): void => {
    const buttons = listGroupCombatAbilityActionButtons(
      session,
      viewerCharacterId,
      action,
      optionIndex,
      payloadKey
    );
    if (buttons.length === 0) {
      return;
    }
    const profile = getGroupCombatActionProfile(viewer, action, payloadKey);
    if (!profile?.ability.label) {
      return;
    }
    const targeted = requiresExplicitGroupCombatTarget(profile.ability) && buttons.length > 1;
    abilityButtons.push({
      label: profile.ability.label,
      callbackData: targeted
        ? makeGroupCombatTargetMenuCallbackData({
            token: session.partyInviteToken,
            turn: session.turn,
            action,
            optionIndex
          })
        : buttons[0]!.callbackData
    });
  };
  addAbilityButtons("class");
  addAbilityButtons("race");
  (viewer.gearAbilityIds ?? []).forEach((abilityId, optionIndex) =>
    addAbilityButtons("gear", optionIndex, abilityId)
  );
  const defendButton: CombatActionKeyboardButton = {
    label: groupCombatReplyButtons.guard,
    callbackData: makeGroupCombatActionCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      action: "guard",
      targetIndex: viewer.rosterOrder
    })
  };
  const hasItems = listAvailableGroupCombatItems(session, viewerCharacterId).length > 0;

  return buildCombatActionKeyboard({
    attackButtons,
    defendButton,
    abilityButtons,
    ...(hasItems ? {
      itemsButton: {
        label: groupCombatReplyButtons.items,
        callbackData: makeGroupCombatItemsMenuCallbackData(session.partyInviteToken, session.turn)
      }
    } : {}),
    fleeButton: {
      label: groupCombatReplyButtons.flee,
      callbackData: makeGroupCombatActionCallbackData({
        token: session.partyInviteToken,
        turn: session.turn,
        action: "flee",
        targetIndex: viewer.rosterOrder
      })
    },
    refreshButton: {
      label: groupCombatReplyButtons.refresh,
      callbackData: makeGroupCombatViewCallbackData(session.partyInviteToken)
    }
  });
}

export function buildGroupCombatActionMenuKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string | null,
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
  if (!viewerCharacterId || !viewer || !isActiveGroupCombatParticipant(viewer)) {
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
        shortEnemyNames.get(enemy.order) ?? "Монстр",
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
  return keyboard.text(
    "↩️ До дій",
    makeGroupCombatTargetBackCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      source: "reply-menu"
    })
  );

  function addAbilityButtons(action: Extract<GroupCombatActionKey, "class" | "race" | "gear">, payloadKey?: string, optionIndex = 0): void {
    for (const button of listGroupCombatAbilityActionButtons(
      session,
      viewerCharacterId!,
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
  explicitPayloadKey?: string,
  source?: "reply-menu"
): Array<{ label: string; callbackData: string; targetIndex: number }> {
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
  const livingParticipantNameCounts = new Map<string, number>();
  for (const participant of session.state.participants.filter((candidate) => candidate.hp > 0)) {
    livingParticipantNameCounts.set(
      participant.name,
      (livingParticipantNameCounts.get(participant.name) ?? 0) + 1
    );
  }
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
    const targetLabel = target.kind === "enemy"
      ? targetEnemyNames.get(session.state.enemies[target.targetIndex]?.order ?? -1) ?? "Ворог"
      : target.kind === "self"
        ? `${session.state.participants[target.targetIndex]?.name ?? viewer.name} (ви)`
        : presentDistinctGroupCombatAllyName(
            session.state.participants[target.targetIndex],
            livingParticipantNameCounts
          );
    return [{
      label: targetLabel,
      targetIndex: target.targetIndex,
      callbackData: makeGroupCombatActionCallbackData({
        token: session.partyInviteToken,
        turn: session.turn,
        action,
        optionIndex,
        targetIndex: target.targetIndex,
        ...(source ? { source } : {})
      })
    }];
  });
}

export function getSingleGroupCombatActionTargetIndex(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  action: Extract<GroupCombatActionKey, "attack" | "class" | "race" | "gear">,
  optionIndex = 0
): number | null {
  if (action === "attack") {
    const targets = session.state.enemies
      .map((enemy, targetIndex) => ({ enemy, targetIndex }))
      .filter(({ enemy }) => enemy.hp > 0);
    return targets.length === 1 ? targets[0]!.targetIndex : null;
  }

  const targets = listGroupCombatAbilityActionButtons(
    session,
    viewerCharacterId,
    action,
    optionIndex
  );
  return targets.length === 1 ? targets[0]!.targetIndex : null;
}

function presentDistinctGroupCombatAllyName(
  participant: GroupCombatSessionRecord["state"]["participants"][number] | undefined,
  nameCounts: ReadonlyMap<string, number>
): string {
  if (!participant) {
    return "Союзник";
  }

  return (nameCounts.get(participant.name) ?? 0) > 1
    ? `${participant.name} · ${participant.rosterOrder + 1}`
    : participant.name;
}

export function buildGroupCombatTargetKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  action: Extract<GroupCombatActionKey, "attack" | "class" | "race" | "gear">,
  optionIndex = 0,
  source?: "reply-menu"
): InlineKeyboard {
  if (action === "attack") {
    const keyboard = new InlineKeyboard();
    const viewer = session.state.participants.find(
      (participant) => participant.characterId === viewerCharacterId
    );
    if (!viewer || !isActiveGroupCombatParticipant(viewer)) {
      return keyboard.text(
        "↩️ До дій",
        makeGroupCombatTargetBackCallbackData({
          token: session.partyInviteToken,
          turn: session.turn,
          ...(source ? { source } : {})
        })
      );
    }
    const livingEnemies = session.state.enemies.filter((enemy) => enemy.hp > 0);
    const shortEnemyNames = getDistinctShortMonsterNames(livingEnemies);
    let count = 0;
    session.state.enemies.forEach((enemy, targetIndex) => {
      if (enemy.hp <= 0) {
        return;
      }
      keyboard.text(
        shortEnemyNames.get(enemy.order) ?? "Монстр",
        makeGroupCombatActionCallbackData({
          token: session.partyInviteToken,
          turn: session.turn,
          action: "attack",
          targetIndex,
          ...(source ? { source } : {})
        })
      );
      count += 1;
      if (count % 2 === 0) {
        keyboard.row();
      }
    });
    if (count % 2 === 1) {
      keyboard.row();
    }
    return keyboard.text(
      "↩️ До дій",
      makeGroupCombatTargetBackCallbackData({
        token: session.partyInviteToken,
        turn: session.turn,
        ...(source ? { source } : {})
      })
    );
  }

  const ability = listFrozenGroupCombatReplyAbilities(session, viewerCharacterId)
    .find((candidate) => candidate.action === action && candidate.optionIndex === optionIndex);
  return ability
    ? buildAbilityTargetKeyboardForSource(session, viewerCharacterId, ability, source)
    : new InlineKeyboard().text(
        "↩️ До дій",
        makeGroupCombatTargetBackCallbackData({
          token: session.partyInviteToken,
          turn: session.turn,
          ...(source ? { source } : {})
        })
      );
}

function buildAbilityTargetKeyboardForSource(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  ability: GroupCombatReplyAbility,
  source?: "reply-menu"
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const buttons = listGroupCombatAbilityActionButtons(
    session,
    viewerCharacterId,
    ability.action,
    ability.optionIndex,
    undefined,
    source
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
    "↩️ До дій",
    makeGroupCombatTargetBackCallbackData({
      token: session.partyInviteToken,
      turn: session.turn,
      ...(source ? { source } : {})
    })
  );
}

export function groupCombatActionRequiresExplicitTarget(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  action: Extract<GroupCombatActionKey, "attack" | "class" | "race" | "gear">,
  optionIndex = 0
): boolean {
  if (action === "attack") {
    return true;
  }
  const viewer = session.state.participants.find((participant) => participant.characterId === viewerCharacterId);
  const payloadKey = action === "gear" ? viewer?.gearAbilityIds?.[optionIndex] : undefined;
  const profile = viewer ? getGroupCombatActionProfile(viewer, action, payloadKey) : null;
  return profile ? requiresExplicitGroupCombatTarget(profile.ability) : false;
}

function requiresExplicitGroupCombatTarget(ability: {
  primaryTargetScope?: string;
  secondaryTargetScope?: string;
}): boolean {
  const scopes = [ability.primaryTargetScope, ability.secondaryTargetScope];
  return scopes.includes("single-enemy") || scopes.includes("single-ally-or-self");
}

export function buildGroupCombatItemsKeyboard(
  session: GroupCombatSessionRecord,
  viewerCharacterId: string,
  source?: "reply-menu",
  requestedPage = 0,
  hiddenItemIds: ReadonlySet<string> = new Set()
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const available = listAvailableGroupCombatItems(session, viewerCharacterId)
    .filter((item) => !hiddenItemIds.has(item.itemId));
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(available.length / pageSize));
  const page = Math.min(Math.max(0, Math.floor(requestedPage)), totalPages - 1);

  for (const item of available.slice(page * pageSize, (page + 1) * pageSize)) {
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

  if (totalPages > 1) {
    if (page > 0) {
      keyboard.text(
        "◀️ Назад",
        makeGroupCombatItemsMenuCallbackData(session.partyInviteToken, session.turn, page - 1, source)
      );
    }
    keyboard.text(`${page + 1}/${totalPages}`, makeGroupCombatItemsMenuCallbackData(session.partyInviteToken, session.turn, page, source));
    if (page < totalPages - 1) {
      keyboard.text(
        "Далі ▶️",
        makeGroupCombatItemsMenuCallbackData(session.partyInviteToken, session.turn, page + 1, source)
      );
    }
    keyboard.row();
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
  itemId: string;
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
  itemId: string,
  quantity: number
): string {
  const quantityLabel = quantity > 1 ? ` ×${quantity}` : "";
  return `${getGroupCombatItemPresentation(itemId)?.label ?? itemId}${quantityLabel}`;
}
