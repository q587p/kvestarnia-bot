import {
  resolveActorCombatAction,
  type CombatActorResourceState
} from "../combat/combatEngine";
import type {
  CombatActorStats,
  CombatState,
  MonsterCombatStats,
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
import {
  findMonsterAbility,
  type MonsterAbilityDefinition
} from "../../content/monsterAbilities";
import { monsters } from "../../content/monsters";
import { items } from "../../content/items";
import { monsterLoot } from "../../content/monsterFlavor";
import type { LootExpansionSourceId } from "../../content/lootExpansionV1";
import { rollMonsterSkillDamage } from "../combat/combatBalance";
import { deriveMonsterCombatStats } from "../combat/monsterCombatStats";
import { monsterAbilityAsCombatSkill } from "../combat/monsterAbilityRuntime";
import {
  rollBandageDropQuantity,
  rollMonsterLoot,
  rollPostFightBandageSlotReward
} from "../loot";
import { SeededRandomSource } from "../../shared/random";
import {
  buildBaselinePersistentFightWinXp,
  buildPersistentFightWinGold
} from "../combat/combatRewards";
import {
  resolveMonsterBarkState,
  type CombatBarkStateV1
} from "../combat/combatBarks";

export const GROUP_COMBAT_RULES_VERSION = "group-combat.v2";
export const GROUP_COMBAT_PRODUCTION_RULES_VERSION = "group-combat.v3";
export const GROUP_COMBAT_PROOF_ENCOUNTER_KEY = "proof-cellar-many";
export const GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY = "nyz-left-passage-party.v1";
export const LEFT_PASSAGE_TIER_TWO_DISCOVERY_COOLDOWN_KEY =
  "fight:left-passage-tier-two-discovery";
export const LEFT_PASSAGE_TIER_TWO_DISCOVERY_MIN_MINUTES = 13;
export const LEFT_PASSAGE_TIER_TWO_DISCOVERY_MAX_MINUTES = 23;
export const GROUP_COMBAT_TURN_LIMIT = 25;
export const GROUP_COMBAT_RECAP_LIMIT = GROUP_COMBAT_TURN_LIMIT;
export const GROUP_COMBAT_STATE_BYTE_LIMIT = 65_536;
export const GROUP_COMBAT_CARD_BYTE_LIMIT = 4_096;
export const GROUP_COMBAT_PARTICIPANT_LIMIT = 3;
export const GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT = 6;
export const GROUP_COMBAT_REPAIR_PARTICIPANT_LIMIT = 13;
const GROUP_COMBAT_BASIC_GUARD_SENTINEL = 32_767;
export const GROUP_COMBAT_SUPPORTED_ITEM_IDS = [
  "item.responsible-panic-bandage",
  "item.dense-bandage",
  "item.field-kit"
] as const;
export const GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS = [
  "monster.royal-scurry",
  "monster.smoke-without-approval",
  "monster.preapproved-bite",
  "monster.cabbage-plate",
  "monster.compound-interest",
  "monster.common-group-rally",
  "monster.approved-dam",
  "monster.classified-rustle",
  "monster.return-to-staff"
] as const;
export const GROUP_COMBAT_CANONICAL_ENEMY_DAMAGE_ABILITY_IDS = [
  "skill.strict-blessing",
  "gear.asclepius-instruction"
] as const;

export type GroupCombatStatus = "active" | "won" | "lost" | "invalid";
export type GroupCombatRulesVersion =
  | typeof GROUP_COMBAT_RULES_VERSION
  | typeof GROUP_COMBAT_PRODUCTION_RULES_VERSION;
export type GroupCombatActionKey = "attack" | "guard" | "class" | "race" | "gear" | "item";
export type GroupCombatTargetKind = "self" | "ally" | "enemy";
export type GroupCombatStatusKind =
  | "guard"
  | "response-mitigation"
  | "counter"
  | "bleed"
  | "monster-accuracy-penalty"
  | "monster-burn"
  | "monster-damage-reduction"
  | "monster-evasion"
  | "monster-outgoing-damage";

export interface GroupCombatActorSnapshot {
  characterId: string;
  telegramUserId: string;
  name: string;
  activeCosmeticTitle?: string;
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
  monsterId?: string;
  name: string;
  order: number;
  level?: number;
  hp: number;
  hpMax: number;
  attack: number;
  defense: number;
  abilityIds?: string[];
  abilityCooldowns?: Record<string, { id: string; remainingTurns: number }>;
  usedOnceAbilityIds?: string[];
  shield?: {
    sourceAbilityId: string;
    sourceEnemyId: string;
    points: number;
  };
}

export interface GroupCombatThreatParticipantSnapshot {
  characterId: string;
  rosterOrder: number;
  remortCount: number;
  decision: {
    enemyCount: 1 | 2;
    reason: "base" | "ordinary-win-streak";
    eligibleWins: number;
    secondEnemyLevelBonus: number;
  };
}

export interface GroupCombatRemortParticipantSnapshot {
  characterId: string;
  rosterOrder: number;
  remortCount: number;
}

export interface GroupCombatLeftPassageDifficultySnapshot {
  version: 1;
  origin: "nyz-left-passage-party.v1";
  locationId: string;
  encounterId: string;
  encounterToken: string;
  encounterSeed: string;
  initiatingCharacterId: string;
  initiatingRemortCount: number;
  primaryMonsterId: string;
  primaryBaseMonsterLevel: number;
  primaryEffectiveMonsterLevel: number;
  threat: {
    participants: GroupCombatThreatParticipantSnapshot[];
    sourceCharacterId: string;
    sourceRosterOrder: number;
    escalated: boolean;
    requestedSecondEnemyLevelBonus: number;
    appliedSecondEnemyLevelBonus: number;
    boostedEnemyId: string | null;
    levelCap: 23;
  };
  remort: {
    participants: GroupCombatRemortParticipantSnapshot[];
    sourceCharacterId: string;
    sourceRosterOrder: number;
    sourceRemortCount: number;
    backupAdjustments: Array<{
      enemyId: string;
      remortCount: number;
      hpMaxAdded: number;
      attackAdded: number;
    }>;
  };
  rewards: {
    winXpTotal: number;
    winGoldTotal: number;
    lossXpTotal: number;
    lootVersion: 1;
    lootSnapshot: GroupCombatLootVersionOneSnapshot;
  };
}

export interface GroupCombatLootVersionOneSnapshot {
  version: 1;
  enemies: Array<{
    enemyId: string;
    monsterId: string;
    order: number;
    participantRolls: Array<{
      characterId: string;
      items: Array<{ itemId: string; quantity: number }>;
    }>;
  }>;
}

export function deriveLeftPassageEnemyCount(input: {
  participants: Array<Pick<GroupCombatActorSnapshot, "characterId" | "level" | "remortCount">>;
  threatParticipants: GroupCombatThreatParticipantSnapshot[];
  primaryEffectiveMonsterLevel: number;
}): number {
  if (
    input.participants.length < 1 ||
    input.participants.length > GROUP_COMBAT_PARTICIPANT_LIMIT
  ) {
    throw new Error("Left-passage combat requires one to three participants.");
  }
  const threatByCharacterId = new Map(
    input.threatParticipants.map((participant) => [participant.characterId, participant])
  );
  const extraEnemies = input.participants.filter((participant) => {
    const threat = threatByCharacterId.get(participant.characterId);
    return participant.remortCount > 0 ||
      threat?.decision.enemyCount === 2 ||
      participant.level >= input.primaryEffectiveMonsterLevel + 3;
  }).length;
  return Math.min(
    GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT,
    input.participants.length + extraEnemies
  );
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
  specialActions?: number;
}

export interface GroupCombatEnemyContribution {
  enemyId: string;
  damage: number;
  healing: number;
  guardPrevented: number;
  control: number;
  damageTaken: number;
  actions: number;
  specialActions: number;
  guardedTurns: number;
}

export interface GroupCombatTimedStatus {
  id: string;
  kind: GroupCombatStatusKind;
  sourceCharacterId?: string;
  sourceEnemyId?: string;
  sourceAbilityId?: string;
  targetKind: "participant" | "enemy";
  targetId: string;
  value: number;
  remainingTurns: number;
  appliedTurn?: number;
}

export interface GroupCombatRecapEntry {
  turn: number;
  lines: string[];
  monsterBarkIds?: string[];
  snapshot?: {
    participants: Array<{
      hp: number;
      mana: number;
      cooldowns?: Array<{ id: string; remainingTurns: number }>;
      itemCooldowns?: Array<{ itemId: string; remainingTurns: number }>;
    }>;
    enemies: Array<{
      hp: number;
      cooldowns?: Array<{ id: string; remainingTurns: number }>;
      shieldPoints?: number;
    }>;
    effects?: Array<{
      kind: GroupCombatStatusKind;
      targetKind: "participant" | "enemy";
      targetId: string;
      remainingTurns: number;
    }>;
  };
}

export interface GroupCombatState {
  rulesVersion: GroupCombatRulesVersion;
  sessionId: string;
  partySessionId: string;
  encounterKey: typeof GROUP_COMBAT_PROOF_ENCOUNTER_KEY | typeof GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY;
  deterministicSeed: number;
  status: GroupCombatStatus;
  turn: number;
  participants: GroupCombatActorSnapshot[];
  enemies: GroupCombatEnemyState[];
  contributions: GroupCombatContribution[];
  enemyContributions?: GroupCombatEnemyContribution[];
  enemyBarks?: Record<string, CombatBarkStateV1>;
  statuses: GroupCombatTimedStatus[];
  recap: GroupCombatRecapEntry[];
  production?: GroupCombatLeftPassageDifficultySnapshot;
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
  rewards: GroupCombatRewards;
  effects?: {
    resourcesKey: string;
    xpKey: string;
    goldKey: string;
    itemKey: string | null;
    activityKey: string | null;
  };
}

export interface GroupCombatSettlementPlan {
  version: 1;
  policy: "rewardless-proof" | "left-passage-party";
  sessionId: string;
  outcome: "won" | "lost" | "invalid";
  completedTurn: number;
  participants: GroupCombatSettlementPlanParticipant[];
}

export interface GroupCombatSettlementReceipt {
  version: 1;
  policy: "rewardless-proof" | "left-passage-party";
  sessionId: string;
  characterId: string;
  remortCount: number;
  resources?: { hp: number; mana: number };
  rewards: GroupCombatRewards;
  effects?: NonNullable<GroupCombatSettlementPlanParticipant["effects"]>;
  manualParticipation?: boolean;
}

export interface GroupCombatResult {
  kind: "rewardless-proof" | "left-passage-party";
  outcome: "won" | "lost" | "invalid";
  completedTurn: number;
  rewards: GroupCombatRewards;
}

export interface GroupCombatRewards {
  xp: number;
  gold: number;
  items: Array<{ itemId: string; quantity: number }>;
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

  const participants = normalizeGroupCombatParticipants(input.participants);

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
    enemyContributions: enemies.map(emptyEnemyContribution),
    statuses: [],
    recap: []
  };
}

function normalizeGroupCombatParticipants(
  input: GroupCombatActorSnapshot[]
): GroupCombatActorSnapshot[] {
  return [...input]
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
}

export function createLeftPassageGroupCombatState(input: {
  sessionId: string;
  partySessionId: string;
  deterministicSeed: number;
  participants: GroupCombatActorSnapshot[];
  enemies: GroupCombatEnemyState[];
  difficulty: Omit<GroupCombatLeftPassageDifficultySnapshot, "rewards"> & {
    rewards: Omit<GroupCombatLeftPassageDifficultySnapshot["rewards"], "lootSnapshot"> & {
      lootSnapshot?: GroupCombatLootVersionOneSnapshot;
    };
  };
}): GroupCombatState {
  if (
    input.participants.length < 1 ||
    input.participants.length > GROUP_COMBAT_PARTICIPANT_LIMIT
  ) {
    throw new Error("Left-passage group combat requires one to three participants.");
  }
  if (input.enemies.length < 1 || input.enemies.length > GROUP_COMBAT_PRODUCTION_ENEMY_LIMIT) {
    throw new Error("Left-passage group combat requires one to six enemies.");
  }
  const participants = normalizeGroupCombatParticipants(input.participants);
  const enemies = [...input.enemies]
    .sort((left, right) => left.order - right.order)
    .map((enemy) => ({
      ...enemy,
      hpMax: positiveInteger(enemy.hpMax),
      hp: clampInteger(enemy.hp, 0, enemy.hpMax),
      attack: positiveInteger(enemy.attack),
      defense: nonNegativeInteger(enemy.defense),
      ...(enemy.level === undefined ? {} : { level: positiveInteger(enemy.level) })
    }));
  const production = structuredClone(input.difficulty) as GroupCombatLeftPassageDifficultySnapshot;
  production.rewards.lootSnapshot = {
    version: 1,
    enemies: []
  };
  const state: GroupCombatState = {
    rulesVersion: GROUP_COMBAT_PRODUCTION_RULES_VERSION,
    sessionId: input.sessionId,
    partySessionId: input.partySessionId,
    encounterKey: GROUP_COMBAT_LEFT_PASSAGE_ENCOUNTER_KEY,
    deterministicSeed: nonNegativeInteger(input.deterministicSeed),
    status: "active",
    turn: 1,
    participants,
    enemies,
    contributions: participants.map(emptyContribution),
    enemyContributions: enemies.map(emptyEnemyContribution),
    statuses: [],
    recap: [],
    production
  };
  state.production!.rewards.lootSnapshot = buildLeftPassageLootVersionOneSnapshot(state);
  assertGroupCombatStateBudget(state);
  return state;
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
  const monsterBarkIds: string[] = [];
  const defeatedEnemyIds = new Set(
    state.enemies.filter((enemy) => enemy.hp <= 0).map((enemy) => enemy.id)
  );
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
  for (const action of actions) {
    if (action.origin === "manual") {
      getContribution(state, action.actorCharacterId).committedActions += 1;
    }
  }

  applyBleedStatuses(state, lines);
  appendNewlyDefeatedEnemyLines(state, defeatedEnemyIds, lines);
  if (state.enemies.every((enemy) => enemy.hp <= 0)) {
    return terminalize(state, "won", lines, [], monsterBarkIds);
  }
  const respondingEnemyIds = state.enemies
    .filter((enemy) => enemy.hp > 0)
    .map((enemy) => enemy.id);

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
    applyParticipantMonsterEffects(state, actor, lines);
    if (actor.hp <= 0) {
      tickParticipantMonsterEffects(state, actor.characterId);
      continue;
    }
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
      lines.push(
        `${presentParticipantActionLabel(
          actor,
          "використовує манатку",
          GROUP_COMBAT_ITEM_NAMES[itemId]
        )}: +${healed} HP.`
      );
    } else {
      applyAbilityAction(state, actor, action, contribution, lines);
      tickGroupCombatItemCooldowns(actor);
    }
    appendNewlyDefeatedEnemyLines(state, defeatedEnemyIds, lines);
    tickParticipantMonsterEffects(state, actor.characterId);
  }

  applyEnemyPhase(state, respondingEnemyIds, lines, monsterBarkIds);
  appendNewlyDefeatedEnemyLines(state, defeatedEnemyIds, lines);
  if (state.enemies.every((enemy) => enemy.hp <= 0)) {
    return terminalize(state, "won", lines, committedConsumables, monsterBarkIds);
  }
  state.statuses = state.statuses
    .map((status) =>
      status.kind === "bleed" ||
      status.targetKind === "enemy" ||
      status.kind === "monster-accuracy-penalty" ||
      status.kind === "monster-burn"
        ? status
        : { ...status, remainingTurns: status.remainingTurns - 1 }
    )
    .filter((status) => status.remainingTurns > 0);

  if (
    state.participants.every((participant) => participant.hp <= 0) ||
    (
      state.rulesVersion === GROUP_COMBAT_RULES_VERSION &&
      state.turn >= GROUP_COMBAT_TURN_LIMIT
    )
  ) {
    return terminalize(state, "lost", lines, committedConsumables, monsterBarkIds);
  }

  state.recap = appendRecap(state, lines, monsterBarkIds);
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
  const production = state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION
    ? state.production
    : undefined;
  const orderedParticipants = [...state.participants].sort((left, right) => left.rosterOrder - right.rosterOrder);
  const eligible = orderedParticipants.filter((participant) =>
    getContribution(state, participant.characterId).committedActions > 0
  );
  const lootRewards = production && state.status === "won"
    ? buildLeftPassageEncounterLootRewards(state, eligible)
    : new Map<string, GroupCombatRewards["items"]>();
  return {
    version: 1,
    policy: production ? "left-passage-party" : "rewardless-proof",
    sessionId: state.sessionId,
    outcome: state.status,
    completedTurn: state.turn,
    participants: orderedParticipants
      .map((participant) => ({
        characterId: participant.characterId,
        remortCount: participant.remortCount,
        rosterOrder: participant.rosterOrder,
        resources: { hp: participant.hp, mana: participant.mana },
        contribution: { ...getContribution(state, participant.characterId) },
        rewards: production
          ? buildLeftPassageParticipantRewards(
              state,
              participant,
              eligible,
              lootRewards.get(participant.characterId) ?? []
            )
          : zeroRewards(),
        ...(production
          ? {
              effects: buildSettlementEffectKeys(
                state,
                participant.characterId,
                eligible[0]?.characterId === participant.characterId
              )
            }
          : {})
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
        policy: plan.policy,
        sessionId: plan.sessionId,
        characterId,
        remortCount: participant.remortCount,
        rewards: cloneRewards(participant.rewards),
        ...(plan.policy === "left-passage-party"
          ? {
              resources: { ...participant.resources },
              effects: { ...participant.effects! },
              manualParticipation: participant.contribution.committedActions > 0
            }
          : {})
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

export function isSupportedGroupCombatMonsterAbility(
  abilityId: string | undefined
): abilityId is (typeof GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS)[number] {
  return Boolean(
    abilityId &&
    (GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS as readonly string[]).includes(abilityId)
  );
}

export function filterSupportedGroupCombatMonsterAbilityIds(
  abilityIds: readonly string[]
): string[] {
  return abilityIds.filter(isSupportedGroupCombatMonsterAbility);
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
  const defenderState: CombatActorResourceState = {
    hp: target.hp,
    hpMax: target.hpMax,
    mana: 0,
    manaMax: 0
  };
  const resolved = resolveActorCombatAction({
    actorState: actorResourceState(actor),
    defenderState,
    actorStats: actorCombatStats(actor),
    defenderStats: groupCombatEnemyActorStats(state, target, actor.level, actor.characterId),
    action: "attack",
    rng: new SeededRandomSource(
      `${state.deterministicSeed}:${state.turn}:${actor.rosterOrder}:basic-attack`
    )
  });
  applyActorResourceState(actor, resolved.actorState);
  const damage = applyPlayerDamageToEnemy(
    state,
    target,
    Math.max(0, defenderState.hp - resolved.defenderState.hp)
  );
  contribution.damage += damage;
  actor.threat += damage;
  tickGroupCombatItemCooldowns(actor);
  lines.push(
    resolved.summary.actorOutcome === "miss"
      ? `${actor.name} атакує ${target.name}, але не влучає.`
      : `${actor.name} атакує ${target.name}${resolved.summary.critical ? " критично" : ""}: ${damage} шкоди.`
  );
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
  const scopedEnemyTargets = unique([...primaryTargets, ...secondaryTargets])
    .filter((targetId) => state.enemies.some((enemy) => enemy.id === targetId));
  const enemyTargets = scopedEnemyTargets.length > 0
    ? scopedEnemyTargets
    : requiresCanonicalEnemyDamageTarget(ability)
      ? state.enemies
          .filter((enemy) => enemy.hp > 0)
          .sort((left, right) => left.order - right.order)
          .slice(0, 1)
          .map((enemy) => enemy.id)
      : [];
  const primaryEnemy = getCanonicalEnemyTarget(state, enemyTargets[0]);
  const defenderState: CombatActorResourceState = primaryEnemy
    ? { hp: primaryEnemy.hp, hpMax: primaryEnemy.hpMax, mana: 0, manaMax: 0 }
    : { hp: 1, hpMax: 1, mana: 0, manaMax: 0 };
  const resolved = resolveActorCombatAction({
    actorState: actorResourceState(actor),
    defenderState,
    actorStats: actorCombatStats(actor),
    defenderStats: primaryEnemy
      ? groupCombatEnemyActorStats(state, primaryEnemy, actor.level, actor.characterId)
      : groupCombatEnemyActorStats(state, {
          id: "group-combat-support-target",
          name: "Ціль підтримки",
          order: 0,
          hp: 1,
          hpMax: 1,
          attack: 1,
          defense: 0
        }, actor.level, actor.characterId),
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

  if (resolved.summary.fumble) {
    lines.push(`${actor.name}: ${resolved.summary.fumble.line}`);
    return;
  }

  const damageEntries: Array<{ name: string; damage: number }> = [];
  const primaryDamage = primaryEnemy
    ? applyPlayerDamageToEnemy(
        state,
        primaryEnemy,
        Math.max(0, defenderState.hp - resolved.defenderState.hp)
      )
    : 0;
  let dealt = primaryDamage;
  if (primaryEnemy) {
    damageEntries.push({ name: primaryEnemy.name, damage: primaryDamage });
  }
  if (primaryEnemy) {
    primaryEnemy.hp = Math.max(0, primaryEnemy.hp);
  }
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
    const applied = applyPlayerDamageToEnemy(state, target, damage);
    dealt += applied;
    damageEntries.push({ name: target.name, damage: applied });
  }
  contribution.damage += dealt;
  contribution.specialActions = (contribution.specialActions ?? 0) + 1;
  actor.threat += dealt;

  const primarySupportTargets = isSupportScope(primaryTargetScope) ? primaryTargets : [];
  const secondarySupportTargets = ability.secondaryTargetScope && isSupportScope(ability.secondaryTargetScope)
    ? secondaryTargets
    : [];
  const healingTargets = ability.recipe?.includes("self-heal")
    ? secondarySupportTargets.length > 0 ? secondarySupportTargets : [actor.characterId]
    : primarySupportTargets.length > 0 ? primarySupportTargets : secondarySupportTargets;
  const healingEntries: Array<{ name: string; healing: number }> = [];
  if (ability.healAmount && healingTargets.length > 0) {
    for (const targetId of unique(healingTargets)) {
      const target = state.participants.find((candidate) => candidate.characterId === targetId);
      if (!target || target.hp <= 0) {
        continue;
      }
      const healed = healParticipant(target, ability.healAmount);
      contribution.healing += healed;
      actor.threat += healed * 2;
      healingEntries.push({ name: target.name, healing: healed });
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
  const allEnemyScope =
    primaryTargetScope === "all-enemies" ||
    ability.secondaryTargetScope === "all-enemies";
  const allAllyScope =
    primaryTargetScope === "all-allies-including-self" ||
    ability.secondaryTargetScope === "all-allies-including-self";
  const healingAllAllies = ability.recipe?.includes("self-heal")
    ? ability.secondaryTargetScope === "all-allies-including-self"
    : primarySupportTargets.length > 0
      ? primaryTargetScope === "all-allies-including-self"
      : ability.secondaryTargetScope === "all-allies-including-self";
  const effects: string[] = [];
  if (dealt > 0) {
    effects.push(allEnemyScope
      ? presentMultiTargetDamage(damageEntries)
      : `${dealt} шкоди`);
  }
  if (healingEntries.some((entry) => entry.healing > 0)) {
    effects.push(healingAllAllies
      ? presentMultiTargetHealing(healingEntries)
      : healingEntries.map((entry) =>
          state.participants.length === 1
            ? `+${entry.healing} HP`
            : entry.name === actor.name
              ? `собі +${entry.healing} HP`
              : `${entry.name}: +${entry.healing} HP`
        ).join(", "));
  }
  const hasProtectionEffect = Boolean(
    ability.guardReduction ||
    ability.monsterDamageReduction ||
    ability.counterDamage
  );
  if (hasProtectionEffect) {
    effects.push(allAllyScope
      ? "захист усім союзникам"
      : "захисний ефект");
  }
  const actionLabel = presentParticipantActionLabel(
    actor,
    "застосовує вміння",
    ability.label ?? ability.id
  );
  lines.push(
    resolved.summary.actorOutcome === "miss"
      ? `${actionLabel}: промах.`
      : `${actionLabel}: ${resolved.summary.critical ? "критично; " : ""}` +
        `${effects.length > 0 ? effects.join("; ") : "без прямої шкоди"}.`
  );
}

function requiresCanonicalEnemyDamageTarget(ability: CombatSkillProfile): boolean {
  const scopes = [ability.primaryTargetScope, ability.secondaryTargetScope]
    .filter((scope): scope is CombatTargetScope => Boolean(scope));
  const hasAuthoredDirectDamage = ability.recipe?.includes("direct-damage") ?? false;
  const hasEnemyScope = scopes.some((scope) =>
    scope === "single-enemy" ||
    scope === "all-enemies" ||
    scope === "lowest-hp-enemy"
  );
  if (!hasAuthoredDirectDamage || hasEnemyScope) {
    return false;
  }
  if (
    !(GROUP_COMBAT_CANONICAL_ENEMY_DAMAGE_ABILITY_IDS as readonly string[])
      .includes(ability.id)
  ) {
    throw new Error(
      `Group combat requires an explicit canonical enemy-damage classification for ${ability.id}.`
    );
  }
  return true;
}

function presentParticipantActionLabel(
  actor: GroupCombatActorSnapshot,
  action: "застосовує вміння" | "використовує манатку",
  actionLabel: string
): string {
  return `${actor.name} ${action} — ${actionLabel}`;
}

function presentMultiTargetDamage(entries: Array<{ name: string; damage: number }>): string {
  const sameDamage = entries.length > 0 &&
    entries.every((entry) => entry.damage === entries[0]!.damage);
  return sameDamage
    ? `усім ворогам — по ${entries[0]!.damage} шкоди`
    : `усім ворогам — ${entries.map((entry) => `${entry.name}: ${entry.damage} шкоди`).join(", ")}`;
}

function presentMultiTargetHealing(entries: Array<{ name: string; healing: number }>): string {
  const sameHealing = entries.length > 0 &&
    entries.every((entry) => entry.healing === entries[0]!.healing);
  return sameHealing
    ? `усім союзникам — по +${entries[0]!.healing} HP`
    : `усім союзникам — ${entries.map((entry) => `${entry.name}: +${entry.healing} HP`).join(", ")}`;
}

function groupCombatEnemyActorStats(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  fallbackLevel: number,
  attackingCharacterId?: string
): MonsterCombatStats {
  const evasionBonusPp = sumGroupCombatStatusValues(state, enemy.id, "monster-evasion");
  const outgoingDamageBp = multiplyGroupCombatStatusValues(
    state,
    enemy.id,
    "monster-outgoing-damage"
  );
  const accuracyPenaltyPp = attackingCharacterId
    ? sumGroupCombatStatusValues(
        state,
        attackingCharacterId,
        "monster-accuracy-penalty"
      )
    : 0;
  return {
    monsterId: enemy.monsterId ?? enemy.id,
    name: enemy.name,
    level: enemy.level ?? Math.max(1, fallbackLevel),
    hpMax: enemy.hpMax,
    attack: enemy.attack,
    armor: enemy.defense,
    resist: enemy.defense,
    dexterity: 5,
    tags: [],
    contextModifiers: {
      outgoingDamageMultiplier: outgoingDamageBp / 10_000,
      incomingDamageMultiplier: 1,
      accuracyDeltaPp: 0,
      evasionDeltaPp: evasionBonusPp + accuracyPenaltyPp,
      abilityWeightDelta: 0,
      signatureCooldownDelta: 0,
      flatArmorDelta: 0,
      flatResistDelta: 0,
      flatDexterityDelta: 0
    }
  };
}

function applyEnemyPhase(
  state: GroupCombatState,
  respondingEnemyIds: readonly string[],
  lines: string[],
  monsterBarkIds: string[]
): void {
  const respondingEnemies = respondingEnemyIds
    .map((enemyId) => state.enemies.find((candidate) => candidate.id === enemyId))
    .filter((candidate): candidate is GroupCombatEnemyState => Boolean(candidate))
    .sort((a, b) => a.order - b.order);
  const barkCandidates = respondingEnemies.filter((enemy) => enemy.hp > 0);
  const barkSpeaker = barkCandidates.length > 0
    ? barkCandidates[
        Math.abs(state.deterministicSeed + state.turn - 1) % barkCandidates.length
      ]
    : undefined;
  for (const enemy of respondingEnemies) {
    if (!chooseEnemyTarget(state)) {
      break;
    }
    const defeatedFinalResponder = enemy.hp <= 0;
    if (!defeatedFinalResponder) {
      tickEnemyAbilityCooldowns(enemy);
    }
    const enemyContribution = getEnemyContribution(state, enemy.id);
    enemyContribution.actions += 1;
    const ability = defeatedFinalResponder
      ? null
      : selectGroupCombatEnemyAbility(state, enemy);
    const authored = enemy.monsterId
      ? monsters.find((candidate) => candidate.id === enemy.monsterId)
      : null;
    if (authored && enemy.id === barkSpeaker?.id) {
      const monster = deriveMonsterCombatStats(
        { ...authored, level: enemy.level ?? authored.level },
        enemy.order > 0
          ? {
              remortCount: state.production?.remort.sourceRemortCount ?? 0,
              remortPressureMode: "multi"
            }
          : {}
      );
      const bark = resolveMonsterBarkState({
        ...(state.enemyBarks?.[enemy.id]
          ? { barkState: state.enemyBarks[enemy.id] }
          : {}),
        combatId: `${state.sessionId}:${enemy.id}`,
        status: "active",
        audience: "party",
        monster,
        monsterCommittedAction: true,
        monsterUsedAbility: Boolean(ability),
        monsterHpAfterHeroAction: enemy.hp
      });
      state.enemyBarks = {
        ...(state.enemyBarks ?? {}),
        [enemy.id]: bark.state
      };
      if (bark.barkId) {
        monsterBarkIds.push(bark.barkId);
      }
    }
    const special = ability
      ? executeGroupCombatEnemyAbility(state, enemy, ability, lines)
      : false;
    if (ability && special) {
      enemyContribution.specialActions += 1;
      enemy.abilityCooldowns = {
        ...(enemy.abilityCooldowns ?? {}),
        [ability.id]: {
          id: ability.id,
          remainingTurns: Math.max(1, ability.cooldownOwnActions)
        }
      };
      if (ability.oncePerFight) {
        enemy.usedOnceAbilityIds = [...new Set([...(enemy.usedOnceAbilityIds ?? []), ability.id])].sort();
      }
    } else {
      const target = chooseEnemyTarget(state);
      if (!target) {
        break;
      }
      const outgoingDamageBp = multiplyGroupCombatStatusValues(
        state,
        enemy.id,
        "monster-outgoing-damage"
      );
      const rawDamage = Math.max(
        1,
        Math.floor(Math.max(1, enemy.attack - target.defense) * outgoingDamageBp / 10_000)
      );
      const damage = applyGroupCombatEnemyDamage(state, enemy, target, rawDamage);
      enemyContribution.damage += damage;
      lines.push(
        `${enemy.name}${defeatedFinalResponder ? " востаннє" : ""} відповідає ${target.name}: ${damage} шкоди.`
      );
    }
    if (!defeatedFinalResponder) {
      tickEnemyOwnStatuses(state, enemy.id);
    }
  }
}

function applyGroupCombatEnemyDamage(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  target: GroupCombatActorSnapshot,
  rawDamage: number
): number {
    const targetContribution = getContribution(state, target.characterId);
    let damage = Math.max(0, rawDamage);
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
      const source = getContribution(state, protection.sourceCharacterId!);
      if (protection.kind === "guard") {
        source.guardPrevented += prevented;
      } else {
        source.control += prevented;
      }
    }
    damage = Math.min(target.hp, Math.max(0, damage));
    target.hp -= damage;
    targetContribution.damageTaken += damage;

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
        getContribution(state, counter.sourceCharacterId!).damage += counterDamage;
        getEnemyContribution(state, enemy.id).damageTaken += counterDamage;
        const source = state.participants.find((candidate) => candidate.characterId === counter.sourceCharacterId);
        if (source) {
          source.threat += counterDamage;
        }
      }
    }
    return damage;
}

function applyPlayerDamageToEnemy(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  rawDamage: number
): number {
  let damage = Math.min(enemy.hp, Math.max(0, Math.floor(rawDamage)));
  const reductions = state.statuses
    .filter((status) =>
      status.kind === "monster-damage-reduction" &&
      status.targetKind === "enemy" &&
      status.targetId === enemy.id &&
      status.remainingTurns > 0 &&
      status.sourceEnemyId
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const totalReductionBp = Math.min(
    10_000,
    reductions.reduce((total, status) => total + status.value, 0)
  );
  if (damage > 0 && totalReductionBp > 0) {
    const reducedDamage = Math.max(
      1,
      Math.floor(damage * (10_000 - totalReductionBp) / 10_000)
    );
    let preventionLeft = damage - reducedDamage;
    const totalAuthoredReduction = reductions.reduce(
      (total, status) => total + status.value,
      0
    );
    reductions.forEach((status, index) => {
      const prevented = index === reductions.length - 1
        ? preventionLeft
        : Math.min(
            preventionLeft,
            Math.floor(
              (damage - reducedDamage) * status.value / totalAuthoredReduction
            )
          );
      getEnemyContribution(state, status.sourceEnemyId!).guardPrevented += prevented;
      preventionLeft -= prevented;
    });
    damage = reducedDamage;
  }
  const shield = enemy.shield;
  if (shield && damage > 0) {
    const absorbed = Math.min(shield.points, damage);
    damage -= absorbed;
    shield.points -= absorbed;
    getEnemyContribution(state, shield.sourceEnemyId).guardPrevented += absorbed;
    if (shield.points <= 0) {
      delete enemy.shield;
    }
  }
  damage = Math.min(enemy.hp, damage);
  enemy.hp -= damage;
  getEnemyContribution(state, enemy.id).damageTaken += damage;
  return damage;
}

function getEnemyContribution(
  state: GroupCombatState,
  enemyId: string
): GroupCombatEnemyContribution {
  state.enemyContributions ??= state.enemies.map(emptyEnemyContribution);
  const contribution = state.enemyContributions.find((candidate) => candidate.enemyId === enemyId);
  if (!contribution) {
    throw new Error(`Missing group-combat enemy contribution for ${enemyId}.`);
  }
  return contribution;
}

function tickEnemyAbilityCooldowns(enemy: GroupCombatEnemyState): void {
  const active = Object.entries(enemy.abilityCooldowns ?? {})
    .map(([abilityId, cooldown]) => [
      abilityId,
      { id: cooldown.id, remainingTurns: Math.max(0, cooldown.remainingTurns - 1) }
    ] as const)
    .filter(([, cooldown]) => cooldown.remainingTurns > 0);
  if (active.length > 0) {
    enemy.abilityCooldowns = Object.fromEntries(active);
  } else {
    delete enemy.abilityCooldowns;
  }
}

function selectGroupCombatEnemyAbility(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState
) {
  if ((state.turn + enemy.order - 1) % 3 !== 0) {
    return null;
  }
  const available = (enemy.abilityIds ?? [])
    .map((abilityId) => findMonsterAbility(abilityId))
    .filter((ability) =>
      ability !== null &&
      isSupportedGroupCombatMonsterAbility(ability.id) &&
      (enemy.abilityCooldowns?.[ability.id]?.remainingTurns ?? 0) <= 0 &&
      (!ability.oncePerFight || !(enemy.usedOnceAbilityIds ?? []).includes(ability.id)) &&
      canUseGroupCombatEnemyAbility(state, enemy, ability)
    );
  if (available.length === 0) {
    return null;
  }
  const rng = new SeededRandomSource(
    `${state.deterministicSeed}:${state.turn}:${enemy.order}:monster-ability`
  );
  return available[rng.nextInt(0, available.length - 1)] ?? null;
}

function executeGroupCombatEnemyAbility(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition,
  lines: string[]
): boolean {
  if (!isSupportedGroupCombatMonsterAbility(ability.id)) {
    return false;
  }
  const contribution = getEnemyContribution(state, enemy.id);
  if (ability.id === "monster.smoke-without-approval") {
    let totalDamage = 0;
    const targets = livingParticipants(state);
    for (const target of targets) {
      const rawDamage = rollGroupCombatEnemyAbilityDamage(state, enemy, target, ability);
      const damage = applyGroupCombatEnemyDamage(state, enemy, target, rawDamage);
      totalDamage += damage;
      if (rawDamage > 0) {
        addOrRefreshMonsterStatus(state, {
          id: `${state.turn}:${enemy.id}:${target.characterId}:accuracy`,
          kind: "monster-accuracy-penalty",
          sourceEnemyId: enemy.id,
          sourceAbilityId: ability.id,
          targetKind: "participant",
          targetId: target.characterId,
          value: positiveInteger(Number(ability.parameters.accuracyPenaltyPp ?? 0)),
          remainingTurns: positiveInteger(Number(ability.parameters.durationTargetActivations ?? 1)),
          appliedTurn: state.turn
        });
      }
    }
    contribution.damage += totalDamage;
    contribution.control += targets.length;
    lines.push(
      `${enemy.name} застосовує ${ability.label} по всій ватазі: ${totalDamage} шкоди.`
    );
    return true;
  }
  if (ability.id === "monster.preapproved-bite") {
    const target = chooseEnemyTarget(state);
    if (!target) {
      return false;
    }
    const rawDamage = rollGroupCombatEnemyAbilityDamage(state, enemy, target, ability);
    const damage = applyGroupCombatEnemyDamage(state, enemy, target, rawDamage);
    contribution.damage += damage;
    if (rawDamage > 0) {
      addOrRefreshMonsterStatus(state, {
        id: `${state.turn}:${enemy.id}:${target.characterId}:burn`,
        kind: "monster-burn",
        sourceEnemyId: enemy.id,
        sourceAbilityId: ability.id,
        targetKind: "participant",
        targetId: target.characterId,
        value: Math.max(
          1,
          Math.floor(enemy.attack * Number(ability.parameters.burnDamageMultiplier ?? 0))
        ),
        remainingTurns: positiveInteger(Number(ability.parameters.burnTicks ?? 1)),
        appliedTurn: state.turn
      });
      contribution.control += 1;
    }
    lines.push(
      damage > 0
        ? `${enemy.name} застосовує ${ability.label} проти ${target.name}: ${damage} шкоди.`
        : `${enemy.name} застосовує ${ability.label}, але ${target.name} уникає шкоди.`
    );
    return true;
  }
  if (ability.id === "monster.royal-scurry") {
    applyEnemyDefenseEffects(state, enemy, enemy, ability);
    contribution.guardedTurns += 1;
    lines.push(`${enemy.name} застосовує ${ability.label} й укріплює власний захист.`);
    return true;
  }
  if (ability.id === "monster.cabbage-plate") {
    const healed = healEnemy(
      enemy,
      Math.max(1, Math.floor(enemy.hpMax * Number(ability.parameters.selfHealMaxHpFraction ?? 0)))
    );
    contribution.healing += healed;
    applyEnemyShield(state, enemy, enemy, ability, Number(ability.parameters.shieldMaxHpFraction ?? 0));
    lines.push(`${enemy.name} застосовує ${ability.label}: +${healed} HP і щит.`);
    return true;
  }
  if (ability.id === "monster.compound-interest") {
    const healed = healEnemy(
      enemy,
      Math.max(1, Math.floor(enemy.hpMax * Number(ability.parameters.selfHealMaxHpFraction ?? 0)))
    );
    contribution.healing += healed;
    addEnemyBuffStatus(
      state,
      enemy,
      enemy,
      ability.id,
      "monster-outgoing-damage",
      Math.floor(Number(ability.parameters.outgoingDamageMultiplier ?? 1) * 10_000),
      positiveInteger(Number(ability.parameters.durationOwnActivations ?? 1))
    );
    lines.push(`${enemy.name} застосовує ${ability.label}: +${healed} HP і сильніша відповідь.`);
    return true;
  }
  if (
    ability.id === "monster.common-group-rally" ||
    ability.id === "monster.approved-dam" ||
    ability.id === "monster.classified-rustle"
  ) {
    const allies = livingEnemies(state);
    for (const ally of allies) {
      applyEnemyDefenseEffects(state, enemy, ally, ability);
    }
    lines.push(`${enemy.name} застосовує ${ability.label} й укріплює всіх монстрів.`);
    return true;
  }
  if (ability.id === "monster.return-to-staff") {
    const ally = lowestHpEnemyAlly(state, enemy.id);
    if (!ally) {
      applyEnemyShield(
        state,
        enemy,
        enemy,
        ability,
        Number(ability.parameters.soloFallbackShieldMaxHpFraction ?? 0)
      );
      lines.push(`${enemy.name} застосовує ${ability.label} й прикривається щитом.`);
      return true;
    }
    const healed = healEnemy(
      ally,
      Math.max(1, Math.floor(ally.hpMax * Number(ability.parameters.healTargetMaxHpFraction ?? 0)))
    );
    contribution.healing += healed;
    const before = state.statuses.length;
    state.statuses = state.statuses.filter(
      (status) => !(status.targetKind === "enemy" && status.targetId === ally.id && status.kind === "bleed")
    );
    contribution.control += before - state.statuses.length;
    lines.push(`${enemy.name} застосовує ${ability.label} до ${ally.name}: +${healed} HP.`);
    return true;
  }
  return false;
}

function rollGroupCombatEnemyAbilityDamage(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  target: GroupCombatActorSnapshot,
  ability: NonNullable<ReturnType<typeof findMonsterAbility>>
): number {
  const authored = enemy.monsterId
    ? monsters.find((candidate) => candidate.id === enemy.monsterId)
    : null;
  if (!authored) {
    return Math.max(1, enemy.attack - target.defense);
  }
  const monster = deriveMonsterCombatStats(
    { ...authored, level: enemy.level ?? authored.level },
    enemy.order > 0
      ? {
          remortCount: state.production?.remort.sourceRemortCount ?? 0,
          remortPressureMode: "multi"
        }
      : {}
  );
  const modifiedMonster = {
    ...monster,
    contextModifiers: groupCombatEnemyActorStats(
      state,
      enemy,
      enemy.level ?? monster.level
    ).contextModifiers!
  };
  return rollMonsterSkillDamage(
    actorCombatStats(target),
    modifiedMonster,
    monsterAbilityAsCombatSkill(ability),
    new SeededRandomSource(
      `${state.deterministicSeed}:${state.turn}:${enemy.order}:${ability.id}:${target.rosterOrder}:damage`
    )
  );
}

function canUseGroupCombatEnemyAbility(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition
): boolean {
  if (
    ability.id === "monster.smoke-without-approval" ||
    ability.id === "monster.preapproved-bite"
  ) {
    return livingParticipants(state).length > 0;
  }
  if (
    ability.id === "monster.royal-scurry" ||
    ability.id === "monster.common-group-rally" ||
    ability.id === "monster.approved-dam" ||
    ability.id === "monster.classified-rustle"
  ) {
    return true;
  }
  if (ability.id === "monster.cabbage-plate") {
    return enemy.hp < enemy.hpMax || (enemy.shield?.points ?? 0) <= 0;
  }
  if (ability.id === "monster.compound-interest") {
    return enemy.hp < enemy.hpMax ||
      !hasGroupCombatStatus(state, enemy.id, "monster-outgoing-damage");
  }
  if (ability.id === "monster.return-to-staff") {
    const ally = lowestHpEnemyAlly(state, enemy.id);
    return ally
      ? ally.hp < ally.hpMax ||
          state.statuses.some((status) =>
            status.kind === "bleed" &&
            status.targetKind === "enemy" &&
            status.targetId === ally.id
          )
      : (enemy.shield?.points ?? 0) <= 0;
  }
  return false;
}

function livingParticipants(state: GroupCombatState): GroupCombatActorSnapshot[] {
  return state.participants
    .filter((participant) => participant.hp > 0)
    .sort((left, right) => left.rosterOrder - right.rosterOrder);
}

function livingEnemies(state: GroupCombatState): GroupCombatEnemyState[] {
  return state.enemies
    .filter((enemy) => enemy.hp > 0)
    .sort((left, right) => left.order - right.order);
}

function lowestHpEnemyAlly(
  state: GroupCombatState,
  sourceEnemyId: string
): GroupCombatEnemyState | null {
  const allies = livingEnemies(state).filter((enemy) => enemy.id !== sourceEnemyId);
  return allies.length === 0
    ? null
    : allies.reduce((lowest, candidate) =>
        compareHpRatio(candidate, lowest, "order") < 0 ? candidate : lowest
      );
}

function healEnemy(enemy: GroupCombatEnemyState, amount: number): number {
  if (enemy.hp <= 0) {
    return 0;
  }
  const before = enemy.hp;
  enemy.hp = Math.min(enemy.hpMax, enemy.hp + Math.max(0, Math.floor(amount)));
  return enemy.hp - before;
}

function applyEnemyDefenseEffects(
  state: GroupCombatState,
  source: GroupCombatEnemyState,
  target: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition
): void {
  const duration = positiveInteger(Number(ability.parameters.durationOwnActivations ?? 1));
  const shieldFraction = Number(ability.parameters.shieldMaxHpFraction ?? 0);
  if (shieldFraction > 0) {
    applyEnemyShield(state, source, target, ability, shieldFraction);
  }
  const damageReduction = Number(
    ability.parameters.damageReduction ??
    ability.parameters.selfDamageReduction ??
    0
  );
  if (damageReduction > 0) {
    addEnemyBuffStatus(
      state,
      source,
      target,
      ability.id,
      "monster-damage-reduction",
      Math.floor(damageReduction * 10_000),
      duration
    );
  }
  const evasionBonus = Number(
    ability.parameters.evasionBonusPp ??
    ability.parameters.selfEvasionBonusPp ??
    0
  );
  if (evasionBonus > 0) {
    addEnemyBuffStatus(
      state,
      source,
      target,
      ability.id,
      "monster-evasion",
      Math.floor(evasionBonus),
      duration
    );
  }
}

function applyEnemyShield(
  state: GroupCombatState,
  source: GroupCombatEnemyState,
  target: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition,
  fraction: number
): void {
  const points = Math.max(1, Math.floor(target.hpMax * Math.min(0.4, fraction)));
  if ((target.shield?.points ?? 0) >= points) {
    return;
  }
  target.shield = {
    sourceAbilityId: ability.id,
    sourceEnemyId: source.id,
    points
  };
  getEnemyContribution(state, source.id).guardedTurns += 1;
}

function addEnemyBuffStatus(
  state: GroupCombatState,
  source: GroupCombatEnemyState,
  target: GroupCombatEnemyState,
  sourceAbilityId: string,
  kind: Extract<
    GroupCombatStatusKind,
    "monster-damage-reduction" | "monster-evasion" | "monster-outgoing-damage"
  >,
  value: number,
  remainingTurns: number
): void {
  addOrRefreshMonsterStatus(state, {
    id: `${state.turn}:${source.id}:${target.id}:${kind}`,
    kind,
    sourceEnemyId: source.id,
    sourceAbilityId,
    targetKind: "enemy",
    targetId: target.id,
    value: positiveInteger(value),
    remainingTurns: positiveInteger(remainingTurns),
    appliedTurn: state.turn
  });
}

function addOrRefreshMonsterStatus(
  state: GroupCombatState,
  status: GroupCombatTimedStatus
): void {
  const existing = state.statuses.find((candidate) =>
    candidate.kind === status.kind &&
    candidate.sourceEnemyId === status.sourceEnemyId &&
    candidate.sourceAbilityId === status.sourceAbilityId &&
    candidate.targetKind === status.targetKind &&
    candidate.targetId === status.targetId
  );
  if (!existing) {
    state.statuses.push(status);
    return;
  }
  existing.value = Math.max(existing.value, status.value);
  existing.remainingTurns = Math.max(existing.remainingTurns, status.remainingTurns);
  if (status.appliedTurn !== undefined) {
    existing.appliedTurn = status.appliedTurn;
  }
}

function tickEnemyOwnStatuses(state: GroupCombatState, enemyId: string): void {
  state.statuses = state.statuses
    .map((status) =>
      status.targetKind === "enemy" &&
      status.targetId === enemyId &&
      status.kind !== "bleed" &&
      (status.appliedTurn ?? -1) < state.turn
        ? { ...status, remainingTurns: status.remainingTurns - 1 }
        : status
    )
    .filter((status) => status.remainingTurns > 0);
}

function applyParticipantMonsterEffects(
  state: GroupCombatState,
  participant: GroupCombatActorSnapshot,
  lines: string[]
): void {
  const burns = state.statuses
    .filter((status) =>
      status.kind === "monster-burn" &&
      status.targetKind === "participant" &&
      status.targetId === participant.characterId &&
      status.remainingTurns > 0
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  if (burns.length === 0) {
    return;
  }
  let totalDamage = 0;
  for (const status of burns) {
    const damage = Math.min(participant.hp, status.value);
    participant.hp -= damage;
    totalDamage += damage;
    if (status.sourceEnemyId) {
      getEnemyContribution(state, status.sourceEnemyId).damage += damage;
    }
  }
  getContribution(state, participant.characterId).damageTaken += totalDamage;
  lines.push(`🔥 ${participant.name} втрачає ${totalDamage} HP.`);
}

function tickParticipantMonsterEffects(
  state: GroupCombatState,
  characterId: string
): void {
  state.statuses = state.statuses
    .map((status) =>
      status.targetKind === "participant" &&
      status.targetId === characterId &&
      (status.kind === "monster-accuracy-penalty" || status.kind === "monster-burn")
        ? { ...status, remainingTurns: status.remainingTurns - 1 }
        : status
    )
    .filter((status) => status.remainingTurns > 0);
}

function hasGroupCombatStatus(
  state: GroupCombatState,
  targetId: string,
  kind: GroupCombatStatusKind
): boolean {
  return state.statuses.some((status) =>
    status.targetId === targetId &&
    status.kind === kind &&
    status.remainingTurns > 0
  );
}

function sumGroupCombatStatusValues(
  state: GroupCombatState,
  targetId: string,
  kind: GroupCombatStatusKind
): number {
  return state.statuses
    .filter((status) =>
      status.targetId === targetId &&
      status.kind === kind &&
      status.remainingTurns > 0
    )
    .reduce((sum, status) => sum + status.value, 0);
}

function multiplyGroupCombatStatusValues(
  state: GroupCombatState,
  targetId: string,
  kind: GroupCombatStatusKind
): number {
  return state.statuses
    .filter((status) =>
      status.targetId === targetId &&
      status.kind === kind &&
      status.remainingTurns > 0
    )
    .reduce((product, status) => Math.floor(product * status.value / 10_000), 10_000);
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
      getContribution(state, status.sourceCharacterId!).damage += damage;
      getEnemyContribution(state, enemy.id).damageTaken += damage;
      lines.push(`🩸 ${enemy.name} втрачає ${damage} HP.`);
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

function appendNewlyDefeatedEnemyLines(
  state: GroupCombatState,
  defeatedEnemyIds: Set<string>,
  lines: string[]
): void {
  const newlyDefeated = state.enemies
    .filter((enemy) => enemy.hp <= 0 && !defeatedEnemyIds.has(enemy.id))
    .sort((left, right) => left.order - right.order);

  if (newlyDefeated.length === 0) {
    return;
  }

  const nextTarget = state.enemies
    .filter((enemy) => enemy.hp > 0)
    .sort((left, right) => left.order - right.order)[0];

  for (const enemy of newlyDefeated) {
    defeatedEnemyIds.add(enemy.id);
    lines.push(
      nextTarget
        ? `🧾 Знешкоджено: ${enemy.name}. Нова ціль — ${nextTarget.name}; Корчма переставила табличку без голосування.`
        : `🧾 Знешкоджено: ${enemy.name}. У бойовій відомості Корчми навпроти супротивника стоїть «досить».`
    );
  }
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
  committedConsumables: GroupCombatCommittedConsumable[],
  monsterBarkIds: string[] = []
): GroupCombatResolution {
  state.recap = appendRecap(state, lines, monsterBarkIds);
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
    kind: state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION
      ? "left-passage-party"
      : "rewardless-proof",
    outcome: state.status,
    completedTurn: state.turn,
    rewards: state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION
      ? sumGroupCombatSettlementRewards(buildGroupCombatSettlementPlan(state)?.participants ?? [])
      : zeroRewards()
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
    guardedTurns: 0,
    specialActions: 0
  };
}

function emptyEnemyContribution(enemy: GroupCombatEnemyState): GroupCombatEnemyContribution {
  return {
    enemyId: enemy.id,
    damage: 0,
    healing: 0,
    guardPrevented: 0,
    control: 0,
    damageTaken: 0,
    actions: 0,
    specialActions: 0,
    guardedTurns: 0
  };
}

function zeroRewards(): GroupCombatRewards {
  return { xp: 0, gold: 0, items: [] };
}

function buildLeftPassageParticipantRewards(
  state: GroupCombatState,
  participant: GroupCombatActorSnapshot,
  eligible: GroupCombatActorSnapshot[],
  itemRewards: readonly GroupCombatRewards["items"][number][]
): GroupCombatRewards {
  const production = state.production;
  if (!production || !eligible.some((candidate) => candidate.characterId === participant.characterId)) {
    return zeroRewards();
  }
  const orderedEligible = [...eligible].sort((left, right) => left.rosterOrder - right.rosterOrder);
  const index = orderedEligible.findIndex((candidate) => candidate.characterId === participant.characterId);
  const xpTotal = state.status === "won"
    ? production.rewards.winXpTotal
    : state.status === "lost"
      ? production.rewards.lossXpTotal
      : 0;
  const goldTotal = state.status === "won" ? production.rewards.winGoldTotal : 0;
  return {
    xp: splitNeutral(xpTotal, orderedEligible.length, index),
    gold: splitNeutral(goldTotal, orderedEligible.length, index),
    items: itemRewards.map((item) => ({ ...item }))
  };
}

export function buildLeftPassageEncounterLootRewards(
  state: GroupCombatState,
  eligibleParticipants: readonly GroupCombatActorSnapshot[]
): Map<string, GroupCombatRewards["items"]> {
  const rewards = new Map<string, GroupCombatRewards["items"]>();
  if (
    state.rulesVersion !== GROUP_COMBAT_PRODUCTION_RULES_VERSION ||
    state.status !== "won" ||
    !state.production ||
    eligibleParticipants.length === 0
  ) {
    return rewards;
  }
  const eligible = [...eligibleParticipants].sort(
    (left, right) => left.rosterOrder - right.rosterOrder
  );
  const enemies = [...state.enemies].sort((left, right) => left.order - right.order);
  const recipientOffset = stableGroupCombatSeed(
    `${state.production.encounterSeed}:${state.partySessionId}:loot-recipient`
  ) % eligible.length;

  enemies.forEach((enemy, index) => {
    const recipient = eligible[(recipientOffset + index) % eligible.length]!;
    const frozenEnemy = state.production!.rewards.lootSnapshot.enemies.find(
      (candidate) => candidate.enemyId === enemy.id
    );
    const frozenRoll = frozenEnemy?.participantRolls.find(
      (candidate) => candidate.characterId === recipient.characterId
    );
    for (const item of frozenRoll?.items ?? []) {
      addGroupCombatLootReward(
        rewards,
        recipient.characterId,
        item.itemId,
        item.quantity
      );
    }
  });

  return rewards;
}

function buildLeftPassageLootVersionOneSnapshot(
  state: GroupCombatState
): GroupCombatLootVersionOneSnapshot {
  if (!state.production) {
    throw new Error("Production loot snapshot requires frozen encounter metadata.");
  }
  const participants = [...state.participants].sort(
    (left, right) => left.rosterOrder - right.rosterOrder
  );
  const enemies = [...state.enemies].sort((left, right) => left.order - right.order);
  return {
    version: 1,
    enemies: enemies.map((enemy) => {
      const monster = enemy.monsterId
        ? monsters.find((candidate) => candidate.id === enemy.monsterId)
        : undefined;
      if (!monster) {
        throw new Error(`Production loot snapshot requires authored monster ${enemy.monsterId ?? enemy.id}.`);
      }
      const effectiveEnemyLevel = Math.max(1, Math.floor(enemy.level ?? monster.level));
      return {
        enemyId: enemy.id,
        monsterId: monster.id,
        order: enemy.order,
        participantRolls: participants.map((participant) => {
          const rng = new SeededRandomSource(
            `${state.production!.encounterSeed}:${state.partySessionId}:loot:${enemy.order}:${monster.id}:${participant.characterId}`
          );
          const rewards = new Map<string, GroupCombatRewards["items"]>();
          const loot = rollMonsterLoot({
            monsterId: monster.id,
            monsterLoot,
            items,
            luck: participant.stats.luck,
            dropChanceMultiplier: getLeftPassageEnemyLootDropChanceMultiplier({
              effectiveEnemyLevel,
              participantLevel: participant.level
            }),
            rng,
            character: {
              level: effectiveEnemyLevel,
              classId: participant.classId,
              raceId: participant.raceId
            },
            sourceId: getGroupCombatLootExpansionSource(monster),
            sourceTags: monster.tags
          });
          if (loot.state === "dropped") {
            addGroupCombatLootReward(rewards, participant.characterId, loot.item.id, 1);
          }
          const bandageSlot = rollPostFightBandageSlotReward({
            bandageQuantity: rollBandageDropQuantity({
              luck: participant.stats.luck,
              rng
            }),
            luck: participant.stats.luck,
            rng
          });
          if (bandageSlot) {
            addGroupCombatLootReward(
              rewards,
              participant.characterId,
              bandageSlot.kind === "iskrokamin"
                ? "item.iskrokamin"
                : "item.responsible-panic-bandage",
              bandageSlot.quantity
            );
          }
          return {
            characterId: participant.characterId,
            items: rewards.get(participant.characterId) ?? []
          };
        })
      };
    })
  };
}

export function getLeftPassageEnemyLootDropChanceMultiplier(input: {
  effectiveEnemyLevel: number;
  participantLevel: number;
}): number {
  const levelDelta =
    Math.max(1, Math.floor(input.effectiveEnemyLevel)) -
    Math.max(1, Math.floor(input.participantLevel));
  return Math.min(1.5, Math.max(0.75, 1 + levelDelta * 0.05));
}

function addGroupCombatLootReward(
  rewards: Map<string, GroupCombatRewards["items"]>,
  characterId: string,
  itemId: string,
  quantity: number
): void {
  const safeQuantity = Math.max(0, Math.floor(quantity));
  if (safeQuantity <= 0) {
    return;
  }
  const current = rewards.get(characterId) ?? [];
  const existing = current.find((item) => item.itemId === itemId);
  if (existing) {
    existing.quantity += safeQuantity;
  } else {
    current.push({ itemId, quantity: safeQuantity });
  }
  rewards.set(characterId, current);
}

function getGroupCombatLootExpansionSource(monster: {
  level: number;
  tags: readonly string[];
}): LootExpansionSourceId {
  const tags = new Set(monster.tags);
  if (["food", "kitchen", "pan", "cheese"].some((tag) => tags.has(tag))) {
    return "kitchen_dungeon";
  }
  if (
    ["bureaucracy", "paper", "queue", "tax", "audit", "deadline", "calendar"].some(
      (tag) => tags.has(tag)
    )
  ) {
    return "bureaucracy_wing";
  }
  if (["forest", "garden", "druid", "frog"].some((tag) => tags.has(tag))) {
    return "forest_sidequest";
  }
  return monster.level >= 10 ? "elite_mob" : "trash_mob";
}

function splitNeutral(total: number, count: number, index: number): number {
  if (count <= 0 || index < 0) {
    return 0;
  }
  const safeTotal = nonNegativeInteger(total);
  return Math.floor(safeTotal / count) + (index < safeTotal % count ? 1 : 0);
}

function buildSettlementEffectKeys(
  state: GroupCombatState,
  characterId: string,
  recordsEncounterActivity: boolean
): NonNullable<GroupCombatSettlementPlanParticipant["effects"]> {
  const prefix = `group-combat:${state.sessionId}:participant:${characterId}`;
  return {
    resourcesKey: `${prefix}:resources`,
    xpKey: `${prefix}:xp`,
    goldKey: `${prefix}:gold`,
    itemKey: `${prefix}:common-item`,
    activityKey: recordsEncounterActivity && state.status === "won"
      ? `group-combat:${state.sessionId}:activity`
      : null
  };
}

function cloneRewards(rewards: GroupCombatRewards): GroupCombatRewards {
  return {
    xp: rewards.xp,
    gold: rewards.gold,
    items: rewards.items.map((item) => ({ ...item }))
  };
}

export function sumGroupCombatSettlementRewards(
  participants: readonly GroupCombatSettlementPlanParticipant[]
): GroupCombatRewards {
  const items: GroupCombatRewards["items"] = [];
  for (const participant of participants) {
    for (const reward of participant.rewards.items) {
      const existing = items.find((item) => item.itemId === reward.itemId);
      if (existing) {
        existing.quantity += reward.quantity;
      } else {
        items.push({ ...reward });
      }
    }
  }
  return {
    xp: participants.reduce((sum, row) => sum + row.rewards.xp, 0),
    gold: participants.reduce((sum, row) => sum + row.rewards.gold, 0),
    items
  };
}

export function buildLeftPassageEncounterRewardBudget(input: {
  participantLevels: readonly number[];
  enemies: ReadonlyArray<{ baseLevel: number; effectiveLevel: number }>;
  deterministicKey: string;
}): {
  winXpTotal: number;
  winGoldTotal: number;
  lossXpTotal: number;
} {
  const characterLevel = Math.max(
    1,
    ...input.participantLevels.map((level) => Math.max(1, Math.floor(level)))
  );
  const winXpTotal = input.enemies.reduce((sum, enemy) => (
    sum + buildBaselinePersistentFightWinXp({
      characterLevel,
      baseMonsterLevel: Math.max(1, Math.floor(enemy.baseLevel)),
      effectiveMonsterLevel: Math.max(1, Math.floor(enemy.effectiveLevel))
    })
  ), 0);
  const goldRng = new SeededRandomSource(`${input.deterministicKey}:gold`);
  const winGoldTotal = input.enemies.reduce(
    (sum) => sum + buildPersistentFightWinGold(characterLevel, goldRng),
    0
  );
  return {
    winXpTotal: Math.max(2, winXpTotal),
    winGoldTotal,
    lossXpTotal: Math.max(0, Math.floor(winXpTotal / 5))
  };
}

export function stableGroupCombatSeed(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function getLeftPassageTierTwoDiscoveryMinutes(
  deterministicSeed: number
): number {
  const span =
    LEFT_PASSAGE_TIER_TWO_DISCOVERY_MAX_MINUTES -
    LEFT_PASSAGE_TIER_TWO_DISCOVERY_MIN_MINUTES +
    1;
  return (
    LEFT_PASSAGE_TIER_TWO_DISCOVERY_MIN_MINUTES +
    (Math.max(0, Math.floor(deterministicSeed)) % span)
  );
}

function appendRecap(
  state: GroupCombatState,
  lines: string[],
  monsterBarkIds: string[] = []
): GroupCombatRecapEntry[] {
  const effects = state.statuses
    .filter((status) => status.remainingTurns > 0)
    .map((status) => ({
      kind: status.kind,
      targetKind: status.targetKind,
      targetId: status.targetId,
      remainingTurns: status.remainingTurns
    }));
  const entry: GroupCombatRecapEntry = {
    turn: state.turn,
    lines: lines.slice(0, 13),
    ...(monsterBarkIds.length > 0 ? { monsterBarkIds: monsterBarkIds.slice(0, 6) } : {}),
    snapshot: {
      participants: state.participants.map((participant) => {
        const cooldowns = getActiveGroupCombatCooldowns(participant);
        const itemCooldowns = Object.values(participant.combatItems?.cooldowns ?? {})
          .filter((cooldown) => cooldown.remainingTurns > 0)
          .map((cooldown) => ({
            itemId: cooldown.itemId,
            remainingTurns: cooldown.remainingTurns
          }))
          .sort((left, right) => left.itemId.localeCompare(right.itemId));
        return {
          hp: participant.hp,
          mana: participant.mana,
          ...(cooldowns.length > 0 ? { cooldowns } : {}),
          ...(itemCooldowns.length > 0 ? { itemCooldowns } : {})
        };
      }),
      enemies: state.enemies.map((enemy) => {
        const cooldowns = Object.values(enemy.abilityCooldowns ?? {})
          .filter((cooldown) => cooldown.remainingTurns > 0)
          .map((cooldown) => ({ id: cooldown.id, remainingTurns: cooldown.remainingTurns }))
          .sort((left, right) => left.id.localeCompare(right.id));
        return {
          hp: enemy.hp,
          ...(cooldowns.length > 0 ? { cooldowns } : {}),
          ...(enemy.shield?.points ? { shieldPoints: enemy.shield.points } : {})
        };
      }),
      ...(effects.length > 0 ? { effects } : {})
    }
  };
  return [...state.recap, entry].slice(-GROUP_COMBAT_RECAP_LIMIT);
}

function getActiveGroupCombatCooldowns(
  participant: GroupCombatActorSnapshot
): Array<{ id: string; remainingTurns: number }> {
  const entries = [
    ...(participant.cooldowns?.skill ? [participant.cooldowns.skill] : []),
    ...Object.values(participant.cooldowns?.abilities ?? {})
  ];
  const byId = new Map<string, { id: string; remainingTurns: number }>();
  for (const cooldown of entries) {
    if (cooldown.remainingTurns > 0) {
      byId.set(cooldown.id, { id: cooldown.id, remainingTurns: cooldown.remainingTurns });
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
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
  "item.responsible-panic-bandage": "🩹 Бинт відповідальної паніки",
  "item.dense-bandage": "🩹 Щільний бинт",
  "item.field-kit": "⚕️ Польова аптечка"
};
