import {
  resolveActorCombatAction,
  type CombatActorResourceState
} from "../combat/combatEngine";
import type {
  CombatActorStats,
  CombatState,
  PlayerAbilityFumblesState
} from "../combat/combatState";
import {
  getCombatClassAbilityProfile,
  getCombatRaceAbilityProfile,
  type CombatSkillProfile,
  type CombatTargetScope
} from "../combat/combatActions";
import type { CharacterStats } from "../characters/starterStats";
import { mantokAbilityGrantDefinitions } from "../../content/mantokAbilityGrants";
import { SeededRandomSource } from "../../shared/random";

export const GROUP_COMBAT_RULES_VERSION = "group-combat.v2";
export const GROUP_COMBAT_PROOF_ENCOUNTER_KEY = "proof-cellar-many";
export const GROUP_COMBAT_RECAP_LIMIT = 5;
export const GROUP_COMBAT_TURN_LIMIT = 25;
export const GROUP_COMBAT_STATE_BYTE_LIMIT = 32_768;
export const GROUP_COMBAT_CARD_BYTE_LIMIT = 4_096;
export const GROUP_COMBAT_PARTICIPANT_LIMIT = 3;
export const GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT = 13;
const GROUP_COMBAT_BASIC_GUARD_SENTINEL = 32_767;
export const GROUP_COMBAT_SUPPORTED_ITEM_IDS = [
  "item.responsible-panic-bandage",
  "item.dense-bandage",
  "item.field-kit"
] as const;

export type GroupCombatStatus = "active" | "won" | "lost" | "invalid";
export type GroupCombatActionKey = "attack" | "guard" | "aid" | "class" | "race" | "gear" | "item";
export type GroupCombatTargetKind = "self" | "ally" | "enemy";
export type GroupCombatStatusKind = "guard" | "response-mitigation" | "counter" | "bleed";

export interface GroupCombatActorSnapshot {
  characterId: string;
  telegramUserId: string;
  name: string;
  remortCount: number;
  rosterOrder: number;
  classId: string;
  raceId: string;
  level: number;
  hp: number;
  hpMax: number;
  mana: number;
  manaMax: number;
  attack: number;
  defense: number;
  support: number;
  stats: CharacterStats;
  equipmentItemIds: string[];
  gearAbilityIds: string[];
  combatItemQuantities: Record<string, number>;
  combatItems?: CombatState["combatItems"];
  threat: number;
  cooldowns?: CombatState["cooldowns"];
  playerAbilityFumbles?: PlayerAbilityFumblesState;
}

export interface GroupCombatEnemyState {
  id: string;
  name: string;
  order: number;
  hp: number;
  hpMax: number;
  attack: number;
  defense: number;
}

export interface GroupCombatContribution {
  characterId: string;
  damage: number;
  healing: number;
  guardPrevented: number;
  control: number;
  damageTaken: number;
  committedActions: number;
  guardedTurns: number;
}

export interface GroupCombatTimedStatus {
  id: string;
  kind: GroupCombatStatusKind;
  sourceCharacterId: string;
  targetKind: "participant" | "enemy";
  targetId: string;
  value: number;
  remainingTurns: number;
}

export interface GroupCombatRecapEntry {
  turn: number;
  lines: string[];
}

export interface GroupCombatState {
  rulesVersion: typeof GROUP_COMBAT_RULES_VERSION;
  sessionId: string;
  partySessionId: string;
  encounterKey: typeof GROUP_COMBAT_PROOF_ENCOUNTER_KEY;
  deterministicSeed: number;
  status: GroupCombatStatus;
  turn: number;
  participants: GroupCombatActorSnapshot[];
  enemies: GroupCombatEnemyState[];
  contributions: GroupCombatContribution[];
  statuses: GroupCombatTimedStatus[];
  recap: GroupCombatRecapEntry[];
}

export interface GroupCombatAction {
  actorCharacterId: string;
  turn: number;
  action: GroupCombatActionKey;
  targetKind: GroupCombatTargetKind;
  targetId: string;
  payloadKey?: string;
  origin: "manual" | "timeout";
}

export interface GroupCombatSettlementPlanParticipant {
  characterId: string;
  remortCount: number;
  rosterOrder: number;
  resources: { hp: number; mana: number };
  contribution: GroupCombatContribution;
  rewards: { xp: 0; gold: 0; items: [] };
}

export interface GroupCombatSettlementPlan {
  version: 1;
  policy: "rewardless-proof";
  sessionId: string;
  outcome: "won" | "lost" | "invalid";
  completedTurn: number;
  participants: GroupCombatSettlementPlanParticipant[];
}

export interface GroupCombatSettlementReceipt {
  version: 1;
  policy: "rewardless-proof";
  sessionId: string;
  characterId: string;
  remortCount: number;
  rewards: { xp: 0; gold: 0; items: [] };
}

export interface GroupCombatResult {
  kind: "rewardless-proof";
  outcome: "won" | "lost" | "invalid";
  completedTurn: number;
  rewards: {
    xp: 0;
    gold: 0;
    items: [];
  };
}

export interface GroupCombatCommittedConsumable {
  characterId: string;
  itemId: (typeof GROUP_COMBAT_SUPPORTED_ITEM_IDS)[number];
}

export interface GroupCombatResolution {
  state: GroupCombatState;
  result: GroupCombatResult | null;
  settlementPlan: GroupCombatSettlementPlan | null;
  committedConsumables: GroupCombatCommittedConsumable[];
}

export interface GroupCombatActionProfile {
  action: Extract<GroupCombatActionKey, "class" | "race" | "gear">;
  ability: CombatSkillProfile;
}

export function createGroupCombatProofState(input: {
  sessionId: string;
  partySessionId: string;
  deterministicSeed: number;
  participants: GroupCombatActorSnapshot[];
}): GroupCombatState {
  if (input.participants.length < 2 || input.participants.length > GROUP_COMBAT_PARTICIPANT_LIMIT) {
    throw new Error("Group combat proof requires two or three participants.");
  }

  const participants = [...input.participants]
    .sort((left, right) => left.rosterOrder - right.rosterOrder)
    .map((participant) => ({
      ...participant,
      hp: clampInteger(participant.hp, 0, participant.hpMax),
      hpMax: positiveInteger(participant.hpMax),
      mana: clampInteger(participant.mana, 0, participant.manaMax),
      manaMax: nonNegativeInteger(participant.manaMax),
      attack: positiveInteger(participant.attack),
      defense: nonNegativeInteger(participant.defense),
      support: positiveInteger(participant.support),
      classId: participant.classId ?? "class.unknown",
      raceId: participant.raceId ?? "race.unknown",
      level: positiveInteger(participant.level ?? 1),
      stats: normalizeStats(participant.stats ?? {
        strength: participant.attack,
        dexterity: 5,
        intelligence: participant.support,
        charisma: participant.support,
        luck: 5
      }),
      equipmentItemIds: [...(participant.equipmentItemIds ?? [])].sort(),
      gearAbilityIds: [...(participant.gearAbilityIds ?? [])].sort(),
      combatItemQuantities: Object.entries(participant.combatItemQuantities ?? {})
        .filter(([itemId, quantity]) => isSupportedGroupCombatItem(itemId) && quantity > 0)
        .sort(([left], [right]) => left.localeCompare(right))
        .reduce<Record<string, number>>((quantities, [itemId, quantity]) => {
          quantities[itemId] = positiveInteger(quantity);
          return quantities;
        }, {}),
      ...(participant.combatItems ? { combatItems: structuredClone(participant.combatItems) } : {}),
      threat: nonNegativeInteger(participant.threat ?? 0),
      ...(participant.cooldowns ? { cooldowns: structuredClone(participant.cooldowns) } : {}),
      ...(participant.playerAbilityFumbles
        ? { playerAbilityFumbles: structuredClone(participant.playerAbilityFumbles) }
        : {})
    }));

  const enemies = participants.map((_, index): GroupCombatEnemyState => {
    const hpMax = 10 + participants.length * 2 + index * 2;
    return {
      id: `proof-enemy-${index + 1}`,
      name: PROOF_ENEMY_NAMES[index] ?? `Підвальний гуркіт №${index + 1}`,
      order: index,
      hp: hpMax,
      hpMax,
      attack: 4 + index,
      defense: index
    };
  });

  return {
    rulesVersion: GROUP_COMBAT_RULES_VERSION,
    sessionId: input.sessionId,
    partySessionId: input.partySessionId,
    encounterKey: GROUP_COMBAT_PROOF_ENCOUNTER_KEY,
    deterministicSeed: nonNegativeInteger(input.deterministicSeed),
    status: "active",
    turn: 1,
    participants,
    enemies,
    contributions: participants.map(emptyContribution),
    statuses: [],
    recap: []
  };
}

export function getGroupCombatActionProfile(
  actor: GroupCombatActorSnapshot,
  action: GroupCombatActionKey,
  payloadKey?: string
): GroupCombatActionProfile | null {
  if (action === "class") {
    if (actor.classId === "class.unknown") {
      return null;
    }
    return { action, ability: getCombatClassAbilityProfile(actor.classId) };
  }
  if (action === "race") {
    const ability = getCombatRaceAbilityProfile(actor.raceId);
    return ability ? { action, ability } : null;
  }
  if (action !== "gear" || !payloadKey || !actor.gearAbilityIds.includes(payloadKey)) {
    return null;
  }
  const grant = mantokAbilityGrantDefinitions.find((candidate) =>
    "combat" in candidate &&
    candidate.combat?.profile.id === payloadKey &&
    actor.level >= candidate.minLevel
  );
  return grant && "combat" in grant && grant.combat
    ? { action, ability: grant.combat.profile }
    : null;
}

export function resolveGroupCombatTargets(
  state: GroupCombatState,
  actorCharacterId: string,
  scope: CombatTargetScope,
  explicitTargetId?: string
): string[] {
  const actor = state.participants.find((candidate) => candidate.characterId === actorCharacterId);
  if (!actor || actor.hp <= 0) {
    return [];
  }
  const allies = state.participants
    .filter((candidate) => candidate.hp > 0)
    .sort((left, right) => left.rosterOrder - right.rosterOrder);
  const enemies = state.enemies
    .filter((candidate) => candidate.hp > 0)
    .sort((left, right) => left.order - right.order);

  if (scope === "self") {
    return [actor.characterId];
  }
  if (scope === "single-ally-or-self") {
    const target = allies.find((candidate) => candidate.characterId === explicitTargetId);
    return target ? [target.characterId] : [];
  }
  if (scope === "all-allies-including-self") {
    return allies.map((candidate) => candidate.characterId);
  }
  if (scope === "lowest-hp-ally") {
    return allies.length === 0
      ? []
      : [allies.reduce((lowest, candidate) =>
          compareHpRatio(candidate, lowest, "rosterOrder") < 0 ? candidate : lowest
        ).characterId];
  }
  if (scope === "all-enemies") {
    return enemies.map((candidate) => candidate.id);
  }
  if (scope === "lowest-hp-enemy") {
    return enemies.length === 0
      ? []
      : [enemies.reduce((lowest, candidate) =>
          compareHpRatio(candidate, lowest, "order") < 0 ? candidate : lowest
        ).id];
  }
  const target = enemies.find((candidate) => candidate.id === explicitTargetId);
  return target ? [target.id] : [];
}

function resolveCommittedAbilityTargets(
  state: GroupCombatState,
  actorCharacterId: string,
  scope: CombatTargetScope,
  explicitTargetId?: string
): string[] {
  if (scope !== "single-enemy") {
    return resolveGroupCombatTargets(state, actorCharacterId, scope, explicitTargetId);
  }
  const target = getCanonicalEnemyTarget(state, explicitTargetId);
  return target ? [target.id] : [];
}

function isSupportScope(scope: CombatTargetScope): boolean {
  return scope === "self" ||
    scope === "single-ally-or-self" ||
    scope === "all-allies-including-self" ||
    scope === "lowest-hp-ally";
}

export function validateGroupCombatAction(
  state: GroupCombatState,
  action: GroupCombatAction
): "ok" | "stale" | "actor-unavailable" | "invalid-target" | "action-unavailable" {
  if (state.status !== "active" || action.turn !== state.turn) {
    return "stale";
  }
  const actor = state.participants.find((candidate) => candidate.characterId === action.actorCharacterId);
  if (!actor || actor.hp <= 0) {
    return "actor-unavailable";
  }
  if (action.action === "attack") {
    return action.targetKind === "enemy" && resolveGroupCombatTargets(
      state,
      actor.characterId,
      "single-enemy",
      action.targetId
    ).length === 1
      ? "ok"
      : "invalid-target";
  }
  if (action.action === "guard") {
    return action.targetKind === "self" && action.targetId === actor.characterId ? "ok" : "invalid-target";
  }
  if (action.action === "aid") {
    return action.targetKind === "ally" && state.participants.some(
      (target) =>
        target.characterId === action.targetId &&
        target.characterId !== actor.characterId &&
        target.hp > 0 &&
        target.hp < target.hpMax
    )
      ? "ok"
      : "invalid-target";
  }
  if (action.action === "item") {
    return action.targetKind !== "self" || action.targetId !== actor.characterId
      ? "invalid-target"
      : isSupportedGroupCombatItem(action.payloadKey) &&
          (actor.combatItemQuantities?.[action.payloadKey] ?? 0) > 0 &&
          isGroupCombatItemAvailable(actor, action.payloadKey) &&
          canHealWithGroupCombatItem(actor, action.payloadKey)
        ? "ok"
        : "action-unavailable";
  }

  const profile = getGroupCombatActionProfile(actor, action.action, action.payloadKey);
  if (!profile || !isAbilityAvailable(actor, profile.ability)) {
    return "action-unavailable";
  }
  const scopes = [profile.ability.primaryTargetScope, profile.ability.secondaryTargetScope]
    .filter((scope): scope is CombatTargetScope => Boolean(scope));
  const explicitScope = scopes.find((scope) => scope === "single-enemy" || scope === "single-ally-or-self");
  if (explicitScope) {
    const expectedKind = explicitScope === "single-enemy"
      ? "enemy"
      : action.targetId === actor.characterId ? "self" : "ally";
    if (action.targetKind !== expectedKind || resolveGroupCombatTargets(
      state,
      actor.characterId,
      explicitScope,
      action.targetId
    ).length === 0) {
      return "invalid-target";
    }
  }
  return scopes.some((scope) => resolveGroupCombatTargets(
    state,
    actor.characterId,
    scope,
    action.targetId
  ).length > 0)
    ? "ok"
    : "invalid-target";
}

export function buildGroupCombatTimeoutAction(state: GroupCombatState, characterId: string): GroupCombatAction {
  return {
    actorCharacterId: characterId,
    turn: state.turn,
    action: "guard",
    targetKind: "self",
    targetId: characterId,
    origin: "timeout"
  };
}

export function resolveGroupCombatTurn(
  current: GroupCombatState,
  submittedActions: readonly GroupCombatAction[]
): GroupCombatResolution {
  if (current.status !== "active") {
    const state = cloneGroupCombatState(current);
    return {
      state,
      result: buildTerminalResult(state),
      settlementPlan: buildGroupCombatSettlementPlan(state),
      committedConsumables: []
    };
  }

  const state = cloneGroupCombatState(current);
  const lines: string[] = [];
  applyBleedStatuses(state, lines);
  if (state.enemies.every((enemy) => enemy.hp <= 0)) {
    return terminalize(state, "won", lines, []);
  }

  const livingActors = state.participants.filter((participant) => participant.hp > 0);
  const actionsByActor = new Map(submittedActions.map((action) => [action.actorCharacterId, { ...action }]));
  const actions = livingActors.map(
    (actor) => actionsByActor.get(actor.characterId) ?? buildGroupCombatTimeoutAction(state, actor.characterId)
  );
  for (const action of actions) {
    if (validateGroupCombatAction(state, action) !== "ok") {
      throw new Error(`Invalid group-combat action for ${action.actorCharacterId}.`);
    }
  }

  const committedConsumables: GroupCombatCommittedConsumable[] = [];
  for (const actorAtStart of livingActors) {
    if (state.enemies.every((enemy) => enemy.hp <= 0)) {
      break;
    }
    const actor = state.participants.find((candidate) => candidate.characterId === actorAtStart.characterId)!;
    if (actor.hp <= 0) {
      continue;
    }
    const action = actionsByActor.get(actor.characterId) ?? buildGroupCombatTimeoutAction(state, actor.characterId);
    const contribution = getContribution(state, actor.characterId);
    contribution.committedActions += 1;
    if (action.action === "attack") {
      applyBasicAttack(state, actor, action, contribution, lines);
    } else if (action.action === "guard") {
      if (action.origin === "manual") {
        tickActorAfterCommittedAction(actor);
        tickGroupCombatItemCooldowns(actor);
      }
      addProtectionStatus(
        state,
        actor.characterId,
        actor.characterId,
        "guard",
        GROUP_COMBAT_BASIC_GUARD_SENTINEL
      );
      contribution.guardedTurns += 1;
      actor.threat += 2;
      lines.push(action.origin === "timeout" ? `${actor.name} мовчить і стає в захист.` : `${actor.name} стає в захист.`);
    } else if (action.action === "aid") {
      tickActorAfterCommittedAction(actor);
      tickGroupCombatItemCooldowns(actor);
      const target = state.participants.find((candidate) => candidate.characterId === action.targetId)!;
      const healed = healParticipant(target, Math.max(1, Math.floor(actor.support / 2)));
      contribution.healing += healed;
      actor.threat += healed * 2;
      lines.push(healed > 0
        ? `${actor.name} підтримує ${target.name}: +${healed} HP.`
        : `${actor.name} підстраховує ${target.name}, але лікувати вже нічого.`);
    } else if (action.action === "item") {
      const itemId = action.payloadKey as GroupCombatCommittedConsumable["itemId"];
      tickActorAfterCommittedAction(actor);
      tickGroupCombatItemCooldowns(actor);
      const healed = applyCombatItem(actor, itemId);
      recordGroupCombatItemUse(actor, itemId);
      actor.combatItemQuantities[itemId] = (actor.combatItemQuantities[itemId] ?? 0) - 1;
      if ((actor.combatItemQuantities[itemId] ?? 0) <= 0) {
        delete actor.combatItemQuantities[itemId];
      }
      contribution.healing += healed;
      actor.threat += healed * 2;
      committedConsumables.push({ characterId: actor.characterId, itemId });
      lines.push(`${actor.name} використовує ${GROUP_COMBAT_ITEM_NAMES[itemId]}: +${healed} HP.`);
    } else {
      applyAbilityAction(state, actor, action, contribution, lines);
      tickGroupCombatItemCooldowns(actor);
    }
  }

  if (state.enemies.every((enemy) => enemy.hp <= 0)) {
    return terminalize(state, "won", lines, committedConsumables);
  }

  applyEnemyPhase(state, lines);
  if (state.enemies.every((enemy) => enemy.hp <= 0)) {
    return terminalize(state, "won", lines, committedConsumables);
  }
  state.statuses = state.statuses
    .map((status) => status.kind === "bleed" ? status : { ...status, remainingTurns: status.remainingTurns - 1 })
    .filter((status) => status.remainingTurns > 0);

  if (state.participants.every((participant) => participant.hp <= 0) || state.turn >= GROUP_COMBAT_TURN_LIMIT) {
    return terminalize(state, "lost", lines, committedConsumables);
  }

  state.recap = appendRecap(state.recap, { turn: state.turn, lines });
  state.turn += 1;
  assertGroupCombatStateBudget(state);
  return { state, result: null, settlementPlan: null, committedConsumables };
}

export function invalidateGroupCombatState(current: GroupCombatState): GroupCombatResolution {
  const state = cloneGroupCombatState(current);
  state.status = "invalid";
  return {
    state,
    result: buildTerminalResult(state),
    settlementPlan: buildGroupCombatSettlementPlan(state),
    committedConsumables: []
  };
}

export function buildGroupCombatSettlementPlan(state: GroupCombatState): GroupCombatSettlementPlan | null {
  if (state.status === "active") {
    return null;
  }
  return {
    version: 1,
    policy: "rewardless-proof",
    sessionId: state.sessionId,
    outcome: state.status,
    completedTurn: state.turn,
    participants: [...state.participants]
      .sort((left, right) => left.rosterOrder - right.rosterOrder)
      .map((participant) => ({
        characterId: participant.characterId,
        remortCount: participant.remortCount,
        rosterOrder: participant.rosterOrder,
        resources: { hp: participant.hp, mana: participant.mana },
        contribution: { ...getContribution(state, participant.characterId) },
        rewards: zeroRewards()
      }))
  };
}

export function buildGroupCombatSettlementReceipt(
  plan: GroupCombatSettlementPlan,
  characterId: string
): GroupCombatSettlementReceipt | null {
  const participant = plan.participants.find((candidate) => candidate.characterId === characterId);
  return participant
    ? {
        version: 1,
        policy: "rewardless-proof",
        sessionId: plan.sessionId,
        characterId,
        remortCount: participant.remortCount,
        rewards: zeroRewards()
      }
    : null;
}

export function cloneGroupCombatState(state: GroupCombatState): GroupCombatState {
  return structuredClone(state);
}

export function assertGroupCombatStateBudget(state: GroupCombatState): void {
  const bytes = Buffer.byteLength(JSON.stringify(state), "utf8");
  if (bytes > GROUP_COMBAT_STATE_BYTE_LIMIT) {
    throw new Error(`Group-combat state exceeds ${GROUP_COMBAT_STATE_BYTE_LIMIT} bytes.`);
  }
}

export function isSupportedGroupCombatItem(
  itemId: string | undefined
): itemId is (typeof GROUP_COMBAT_SUPPORTED_ITEM_IDS)[number] {
  return Boolean(itemId && (GROUP_COMBAT_SUPPORTED_ITEM_IDS as readonly string[]).includes(itemId));
}

function applyBasicAttack(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  action: GroupCombatAction,
  contribution: GroupCombatContribution,
  lines: string[]
): void {
  const target = getCanonicalEnemyTarget(state, action.targetId);
  if (!target) {
    return;
  }
  const damage = Math.min(target.hp, Math.max(1, actor.attack - target.defense));
  target.hp -= damage;
  contribution.damage += damage;
  actor.threat += damage;
  tickActorAfterCommittedAction(actor);
  tickGroupCombatItemCooldowns(actor);
  lines.push(`${actor.name} б’є «${target.name}» на ${damage}.`);
}

function applyAbilityAction(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  action: GroupCombatAction,
  contribution: GroupCombatContribution,
  lines: string[]
): void {
  const profile = getGroupCombatActionProfile(actor, action.action, action.payloadKey);
  if (!profile) {
    throw new Error(`Missing group-combat profile for ${action.action}.`);
  }
  const ability = profile.ability;
  const primaryTargetScope = ability.primaryTargetScope ?? "single-enemy";
  const primaryTargets = resolveCommittedAbilityTargets(
    state,
    actor.characterId,
    primaryTargetScope,
    action.targetId
  );
  const secondaryTargets = ability.secondaryTargetScope
    ? resolveCommittedAbilityTargets(state, actor.characterId, ability.secondaryTargetScope, action.targetId)
    : [];
  const enemyTargets = unique([...primaryTargets, ...secondaryTargets])
    .filter((targetId) => state.enemies.some((enemy) => enemy.id === targetId));
  const primaryEnemy = getCanonicalEnemyTarget(state, enemyTargets[0]);
  const defenderState: CombatActorResourceState = primaryEnemy
    ? { hp: primaryEnemy.hp, hpMax: primaryEnemy.hpMax, mana: 0, manaMax: 0 }
    : { hp: 1, hpMax: 1, mana: 0, manaMax: 0 };
  const resolved = resolveActorCombatAction({
    actorState: actorResourceState(actor),
    defenderState,
    actorStats: actorCombatStats(actor),
    defenderStats: {
      monsterId: primaryEnemy?.id ?? "group-combat-support-target",
      ...(primaryEnemy ? { name: primaryEnemy.name } : {}),
      level: Math.max(1, actor.level),
      hpMax: primaryEnemy?.hpMax ?? 1,
      attack: primaryEnemy?.attack ?? 1,
      armor: primaryEnemy?.defense ?? 0,
      resist: primaryEnemy?.defense ?? 0,
      dexterity: 5,
      tags: []
    },
    action: action.action === "class"
      ? "skill"
      : action.action === "race" || action.action === "gear"
        ? action.action
        : "attack",
    ...(action.action === "gear" ? { skillProfile: ability } : {}),
    fumbleSeed: `${state.sessionId}:${actor.characterId}:${ability.id}`,
    rng: new SeededRandomSource(`${state.deterministicSeed}:${state.turn}:${actor.rosterOrder}:${ability.id}`)
  });
  applyActorResourceState(actor, resolved.actorState);
  if (primaryEnemy) {
    primaryEnemy.hp = resolved.defenderState.hp;
  }

  if (resolved.summary.fumble) {
    lines.push(`${actor.name}: ${resolved.summary.fumble.line}`);
    return;
  }

  let dealt = primaryEnemy ? Math.max(0, defenderState.hp - primaryEnemy.hp) : 0;
  const otherEnemyIds = enemyTargets.filter((targetId) => targetId !== primaryEnemy?.id);
  for (const [index, targetId] of otherEnemyIds.entries()) {
    const target = getCanonicalEnemyTarget(state, targetId);
    if (!target) {
      continue;
    }
    const ratio = ability.recipe?.includes("primary-plus-splash") && index > -1
      ? Math.max(0.1, ability.secondaryMultiplier ?? 0.3)
      : 1;
    const damage = resolved.summary.actorDamage <= 0
      ? 0
      : Math.min(target.hp, Math.max(1, Math.floor(resolved.summary.actorDamage * ratio)));
    target.hp -= damage;
    dealt += damage;
  }
  contribution.damage += dealt;
  actor.threat += dealt;

  const primarySupportTargets = isSupportScope(primaryTargetScope) ? primaryTargets : [];
  const secondarySupportTargets = ability.secondaryTargetScope && isSupportScope(ability.secondaryTargetScope)
    ? secondaryTargets
    : [];
  const healingTargets = ability.recipe?.includes("self-heal")
    ? secondarySupportTargets.length > 0 ? secondarySupportTargets : [actor.characterId]
    : primarySupportTargets.length > 0 ? primarySupportTargets : secondarySupportTargets;
  if (ability.healAmount && healingTargets.length > 0) {
    for (const targetId of unique(healingTargets)) {
      const target = state.participants.find((candidate) => candidate.characterId === targetId);
      if (!target || target.hp <= 0) {
        continue;
      }
      const healed = healParticipant(target, ability.healAmount);
      contribution.healing += healed;
      actor.threat += healed * 2;
    }
  }
  const protectionTargets = secondarySupportTargets.length > 0
    ? secondarySupportTargets
    : primarySupportTargets.length > 0
      ? primarySupportTargets
      : [actor.characterId];
  for (const targetId of unique(protectionTargets)) {
    if (ability.guardReduction && ability.recipe?.includes("ally-guard")) {
      addProtectionStatus(state, actor.characterId, targetId, "guard", ability.guardReduction);
    }
    if (ability.monsterDamageReduction && ability.recipe?.includes("response-mitigation")) {
      addProtectionStatus(
        state,
        actor.characterId,
        targetId,
        "response-mitigation",
        ability.monsterDamageReduction
      );
    }
    if (ability.counterDamage && ability.recipe?.includes("counter")) {
      addProtectionStatus(state, actor.characterId, targetId, "counter", ability.counterDamage);
    }
  }
  maybeAddGearBleed(state, actor, action, primaryEnemy);
  lines.push(`${actor.name} застосовує «${ability.label}»${dealt > 0 ? `: ${dealt} шкоди` : ""}.`);
}

function applyEnemyPhase(state: GroupCombatState, lines: string[]): void {
  for (const enemy of state.enemies.filter((candidate) => candidate.hp > 0).sort((a, b) => a.order - b.order)) {
    const target = chooseEnemyTarget(state);
    if (!target) {
      break;
    }
    const contribution = getContribution(state, target.characterId);
    const rawDamage = Math.max(1, enemy.attack - target.defense);
    let damage = rawDamage;
    const protections = state.statuses
      .filter((status) =>
        status.targetKind === "participant" &&
        status.targetId === target.characterId &&
        status.remainingTurns > 0 &&
        (status.kind === "guard" || status.kind === "response-mitigation")
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const protection of protections) {
      const prevented = protection.kind === "guard" && protection.value === GROUP_COMBAT_BASIC_GUARD_SENTINEL
        ? Math.max(0, damage - Math.max(1, Math.floor(damage / 2)))
        : Math.min(damage, protection.value);
      damage -= prevented;
      const source = getContribution(state, protection.sourceCharacterId);
      if (protection.kind === "guard") {
        source.guardPrevented += prevented;
      } else {
        source.control += prevented;
      }
    }
    damage = Math.min(target.hp, Math.max(0, damage));
    target.hp -= damage;
    contribution.damageTaken += damage;
    lines.push(`«${enemy.name}» відповідає ${target.name}: ${damage} шкоди.`);

    if (damage > 0 && target.hp > 0) {
      const counters = state.statuses
        .filter((status) =>
          status.kind === "counter" &&
          status.targetKind === "participant" &&
          status.targetId === target.characterId &&
          status.remainingTurns > 0
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      for (const counter of counters) {
        const counterDamage = Math.min(enemy.hp, counter.value);
        enemy.hp -= counterDamage;
        getContribution(state, counter.sourceCharacterId).damage += counterDamage;
        const source = state.participants.find((candidate) => candidate.characterId === counter.sourceCharacterId);
        if (source) {
          source.threat += counterDamage;
        }
      }
    }
  }
}

function chooseEnemyTarget(state: GroupCombatState): GroupCombatActorSnapshot | null {
  const living = state.participants.filter((participant) => participant.hp > 0);
  return living.sort((left, right) =>
    right.threat - left.threat ||
    compareHpRatio(left, right, "rosterOrder") ||
    left.rosterOrder - right.rosterOrder
  )[0] ?? null;
}

function applyBleedStatuses(state: GroupCombatState, lines: string[]): void {
  const statuses = state.statuses
    .filter((status) => status.kind === "bleed" && status.remainingTurns > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const status of statuses) {
    const enemy = state.enemies.find((candidate) => candidate.id === status.targetId && candidate.hp > 0);
    if (enemy) {
      const damage = Math.min(enemy.hp, status.value);
      enemy.hp -= damage;
      getContribution(state, status.sourceCharacterId).damage += damage;
      lines.push(`🩸 «${enemy.name}» втрачає ${damage} HP.`);
    }
    status.remainingTurns -= 1;
  }
  state.statuses = state.statuses.filter((status) => status.remainingTurns > 0);
}

function maybeAddGearBleed(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  action: GroupCombatAction,
  enemy: GroupCombatEnemyState | null
): void {
  if (action.action !== "gear" || !enemy || !action.payloadKey) {
    return;
  }
  const grant = mantokAbilityGrantDefinitions.find(
    (candidate) => "combat" in candidate && candidate.combat?.profile.id === action.payloadKey
  );
  if (!grant || !("combat" in grant) || grant.combat?.kind !== "bleeding-strike" || !grant.combat.bleed) {
    return;
  }
  state.statuses.push({
    id: `${state.turn}:${actor.characterId}:${enemy.id}:bleed`,
    kind: "bleed",
    sourceCharacterId: actor.characterId,
    targetKind: "enemy",
    targetId: enemy.id,
    value: grant.combat.bleed.damagePerActivation,
    remainingTurns: grant.combat.bleed.remainingHeroActivations
  });
}

function addProtectionStatus(
  state: GroupCombatState,
  sourceCharacterId: string,
  targetId: string,
  kind: Extract<GroupCombatStatusKind, "guard" | "response-mitigation" | "counter">,
  value: number
): void {
  state.statuses.push({
    id: `${state.turn}:${sourceCharacterId}:${targetId}:${kind}`,
    kind,
    sourceCharacterId,
    targetKind: "participant",
    targetId,
    value: positiveInteger(value),
    remainingTurns: 1
  });
}

function actorResourceState(actor: GroupCombatActorSnapshot): CombatActorResourceState {
  return {
    hp: actor.hp,
    hpMax: actor.hpMax,
    mana: actor.mana,
    manaMax: actor.manaMax,
    ...(actor.cooldowns ? { cooldowns: structuredClone(actor.cooldowns) } : {}),
    ...(actor.playerAbilityFumbles
      ? { playerAbilityFumbles: structuredClone(actor.playerAbilityFumbles) }
      : {})
  };
}

function actorCombatStats(actor: GroupCombatActorSnapshot): CombatActorStats {
  return {
    ...actor.stats,
    level: actor.level,
    hpMax: actor.hpMax,
    manaMax: actor.manaMax,
    classId: actor.classId,
    raceId: actor.raceId,
    armor: actor.defense,
    resist: actor.defense,
    weaponDamage: actor.attack
  };
}

function applyActorResourceState(actor: GroupCombatActorSnapshot, resource: CombatActorResourceState): void {
  actor.hp = resource.hp;
  actor.mana = resource.mana;
  if (resource.cooldowns) {
    actor.cooldowns = resource.cooldowns;
  } else {
    delete actor.cooldowns;
  }
  if (resource.playerAbilityFumbles) {
    actor.playerAbilityFumbles = resource.playerAbilityFumbles;
  } else {
    delete actor.playerAbilityFumbles;
  }
}

function tickActorAfterCommittedAction(actor: GroupCombatActorSnapshot): void {
  const dummy = resolveActorCombatAction({
    actorState: actorResourceState(actor),
    defenderState: { hp: 1, hpMax: 1, mana: 0, manaMax: 0 },
    actorStats: actorCombatStats(actor),
    defenderStats: {
      monsterId: "group-combat-cooldown-tick",
      level: actor.level,
      hpMax: 1,
      attack: 1,
      armor: 0,
      resist: 0,
      dexterity: 1,
      tags: []
    },
    action: "defend",
    rng: new SeededRandomSource(0)
  });
  applyActorResourceState(actor, dummy.actorState);
}

function isAbilityAvailable(actor: GroupCombatActorSnapshot, ability: CombatSkillProfile): boolean {
  if (actor.mana < ability.manaCost) {
    return false;
  }
  const cooldown = actor.cooldowns?.abilities?.[ability.id];
  return !cooldown || cooldown.remainingTurns <= 0;
}

function isGroupCombatItemAvailable(
  actor: GroupCombatActorSnapshot,
  itemId: GroupCombatCommittedConsumable["itemId"]
): boolean {
  if (itemId === "item.dense-bandage") {
    return (actor.combatItems?.cooldowns?.[itemId]?.remainingTurns ?? 0) <= 0;
  }
  if (itemId === "item.field-kit") {
    return (actor.combatItems?.uses?.[itemId]?.count ?? 0) === 0;
  }
  return true;
}

function canHealWithGroupCombatItem(
  actor: GroupCombatActorSnapshot,
  itemId: GroupCombatCommittedConsumable["itemId"]
): boolean {
  return itemId === "item.field-kit"
    ? actor.hp < Math.ceil(actor.hpMax * 0.93)
    : actor.hp < actor.hpMax;
}

function recordGroupCombatItemUse(
  actor: GroupCombatActorSnapshot,
  itemId: GroupCombatCommittedConsumable["itemId"]
): void {
  if (itemId === "item.dense-bandage") {
    actor.combatItems = {
      ...(actor.combatItems ?? {}),
      cooldowns: {
        ...(actor.combatItems?.cooldowns ?? {}),
        [itemId]: { itemId, remainingTurns: 5 }
      }
    };
    return;
  }
  if (itemId === "item.field-kit") {
    actor.combatItems = {
      ...(actor.combatItems ?? {}),
      uses: {
        ...(actor.combatItems?.uses ?? {}),
        [itemId]: {
          itemId,
          count: (actor.combatItems?.uses?.[itemId]?.count ?? 0) + 1
        }
      }
    };
  }
}

function tickGroupCombatItemCooldowns(actor: GroupCombatActorSnapshot): void {
  const current = actor.combatItems?.cooldowns;
  if (!current) {
    return;
  }
  const cooldowns = Object.fromEntries(
    Object.entries(current)
      .map(([itemId, cooldown]) => [
        itemId,
        { itemId: cooldown.itemId, remainingTurns: Math.max(0, cooldown.remainingTurns - 1) }
      ] as const)
      .filter(([, cooldown]) => cooldown.remainingTurns > 0)
  );
  const uses = actor.combatItems?.uses;
  if (Object.keys(cooldowns).length > 0 || uses) {
    actor.combatItems = {
      ...(Object.keys(cooldowns).length > 0 ? { cooldowns } : {}),
      ...(uses ? { uses: structuredClone(uses) } : {})
    };
  } else {
    delete actor.combatItems;
  }
}

function applyCombatItem(
  actor: GroupCombatActorSnapshot,
  itemId: GroupCombatCommittedConsumable["itemId"]
): number {
  if (itemId === "item.field-kit") {
    const targetHp = Math.ceil(actor.hpMax * 0.93);
    return healParticipant(actor, Math.max(0, targetHp - actor.hp));
  }
  return healParticipant(actor, itemId === "item.dense-bandage" ? 42 : 7);
}

function healParticipant(target: GroupCombatActorSnapshot, amount: number): number {
  if (target.hp <= 0) {
    return 0;
  }
  const before = target.hp;
  target.hp = Math.min(target.hpMax, target.hp + Math.max(0, Math.floor(amount)));
  return target.hp - before;
}

function getCanonicalEnemyTarget(
  state: GroupCombatState,
  preferredId: string | undefined
): GroupCombatEnemyState | null {
  return state.enemies.find((enemy) => enemy.id === preferredId && enemy.hp > 0) ??
    state.enemies.filter((enemy) => enemy.hp > 0).sort((left, right) => left.order - right.order)[0] ??
    null;
}

function getContribution(state: GroupCombatState, characterId: string): GroupCombatContribution {
  const contribution = state.contributions.find((candidate) => candidate.characterId === characterId);
  if (!contribution) {
    throw new Error(`Missing group-combat contribution for ${characterId}.`);
  }
  return contribution;
}

function terminalize(
  state: GroupCombatState,
  outcome: "won" | "lost",
  lines: string[],
  committedConsumables: GroupCombatCommittedConsumable[]
): GroupCombatResolution {
  state.recap = appendRecap(state.recap, { turn: state.turn, lines });
  state.status = outcome;
  assertGroupCombatStateBudget(state);
  return {
    state,
    result: buildTerminalResult(state),
    settlementPlan: buildGroupCombatSettlementPlan(state),
    committedConsumables
  };
}

function buildTerminalResult(state: GroupCombatState): GroupCombatResult | null {
  if (state.status === "active") {
    return null;
  }
  return {
    kind: "rewardless-proof",
    outcome: state.status,
    completedTurn: state.turn,
    rewards: zeroRewards()
  };
}

function emptyContribution(participant: GroupCombatActorSnapshot): GroupCombatContribution {
  return {
    characterId: participant.characterId,
    damage: 0,
    healing: 0,
    guardPrevented: 0,
    control: 0,
    damageTaken: 0,
    committedActions: 0,
    guardedTurns: 0
  };
}

function zeroRewards(): { xp: 0; gold: 0; items: [] } {
  return { xp: 0, gold: 0, items: [] };
}

function appendRecap(recap: GroupCombatRecapEntry[], entry: GroupCombatRecapEntry): GroupCombatRecapEntry[] {
  return [...recap, { turn: entry.turn, lines: entry.lines.slice(0, 13) }].slice(-GROUP_COMBAT_RECAP_LIMIT);
}

function compareHpRatio<T extends { hp: number; hpMax: number }>(
  left: T,
  right: T,
  orderKey: "rosterOrder" | "order"
): number {
  const ratio = left.hp * right.hpMax - right.hp * left.hpMax;
  if (ratio !== 0) {
    return ratio;
  }
  return Number(left[orderKey as keyof T]) - Number(right[orderKey as keyof T]);
}

function normalizeStats(stats: CharacterStats): CharacterStats {
  return {
    strength: nonNegativeInteger(stats.strength),
    dexterity: nonNegativeInteger(stats.dexterity),
    intelligence: nonNegativeInteger(stats.intelligence),
    charisma: nonNegativeInteger(stats.charisma),
    luck: nonNegativeInteger(stats.luck)
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function positiveInteger(value: number): number {
  return Math.max(1, nonNegativeInteger(value));
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(minimum, nonNegativeInteger(value)), Math.max(minimum, nonNegativeInteger(maximum)));
}

const PROOF_ENEMY_NAMES = ["Комірний Шурхіт", "Сходовий Гуп", "Підвальний Перераховувач"] as const;
const GROUP_COMBAT_ITEM_NAMES: Record<GroupCombatCommittedConsumable["itemId"], string> = {
  "item.responsible-panic-bandage": "«Бинт відповідальної паніки»",
  "item.dense-bandage": "«Щільний бинт»",
  "item.field-kit": "«Польову аптечку»"
};
