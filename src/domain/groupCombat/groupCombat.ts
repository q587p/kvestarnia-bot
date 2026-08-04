import {
  resolveActorCombatAction,
  tickActorCooldowns,
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
  consumableManatkaUseDefinitions,
  findConsumableManatkaUse
} from "../../content/consumableManatkaUses";
import {
  findMonsterAbility,
  monsterAbilities,
  type MonsterAbilityDefinition
} from "../../content/monsterAbilities";
import { monsters } from "../../content/monsters";
import { rollFleeSuccess, rollMonsterSkillDamage } from "../combat/combatBalance";
import { deriveMonsterCombatStats } from "../combat/monsterCombatStats";
import { resolveCombatResponseItemDelta } from "../combat/responseItemEffect";
import {
  compileMonsterAbilityExecutionPlan,
  compileMonsterAbilityRecipe,
  getMonsterAbilityParameterCoverage,
  getMonsterAbilityEffectContract,
  resolveMonsterLandedHitReaction,
  resolveMonsterShieldBreakRetaliationDamage,
  type MonsterAbilityComponentTrigger,
  type MonsterAbilityEffectKind,
  type MonsterAbilityEffectPolarity,
  type MonsterAbilityPlanComponent,
  type MonsterAbilityRuntimeStateV1,
  monsterAbilityAsCombatSkill
} from "../combat/monsterAbilityRuntime";
import { SeededRandomSource } from "../../shared/random";
import {
  buildBaselinePersistentFightWinXp,
  buildPersistentFightWinGold
} from "../combat/combatRewards";
import {
  resolveMonsterBarkState,
  type CombatBarkStateV1
} from "../combat/combatBarks";
import {
  deriveGroupCombatProductionV1MonsterStats,
  findGroupCombatProductionV1Monster,
  getGroupCombatProductionV1LootCandidates,
  GROUP_COMBAT_PRODUCTION_V1_ABILITY_IDS,
  listGroupCombatProductionV1Abilities,
  resolveGroupCombatProductionV1MonsterAbilities,
  type GroupCombatProductionV1LootCandidate,
  type GroupCombatProductionV1Rarity
} from "./groupCombatProductionV1Resolver";

export const GROUP_COMBAT_RULES_VERSION = "group-combat.v2";
export const GROUP_COMBAT_PRODUCTION_RULES_VERSION = "group-combat.v3";
export const GROUP_COMBAT_LOSS_REWARD_POLICY = "defeated-enemies-half-xp.v1";
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
const GROUP_COMBAT_PERCENT_GUARD_SENTINEL = 100_000;
export const GROUP_COMBAT_SUPPORTED_ITEM_IDS = [
  "item.responsible-panic-bandage",
  "item.dense-bandage",
  "item.field-kit",
  ...consumableManatkaUseDefinitions.map((entry) => entry.itemId)
] as readonly string[];
export const GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS =
  GROUP_COMBAT_PRODUCTION_V1_ABILITY_IDS;
export const GROUP_COMBAT_CANONICAL_ENEMY_DAMAGE_ABILITY_IDS = [
  "skill.strict-blessing",
  "gear.asclepius-instruction"
] as const;

export function assertGroupCombatMonsterAbilityExecutionContract(
  abilities: readonly MonsterAbilityDefinition[] = monsterAbilities
): void {
  for (const ability of abilities) {
    const coverage = getMonsterAbilityParameterCoverage(ability);
    const authoredParameters = Object.keys(ability.parameters);
    if (
      coverage.length !== authoredParameters.length ||
      new Set(coverage.map((entry) => entry.parameter)).size !== authoredParameters.length
    ) {
      throw new Error(`Incomplete GroupCombat monster parameter coverage for ${ability.id}.`);
    }
    for (let cycle = 1; cycle <= 6; cycle += 1) {
      const plan = compileMonsterAbilityExecutionPlan({
        ability,
        state: { turn: cycle } as CombatState,
        runtime: {
          ownActionCount: cycle,
          lastDirectHeroDamage: 23
        } as MonsterAbilityRuntimeStateV1
      });
      for (const component of plan.components) {
        if (!isSupportedGroupCombatPlanComponent(component)) {
          throw new Error(
            `Unsupported GroupCombat monster component ${ability.id}:${component.kind}:${component.effectKind ?? "immediate"}.`
          );
        }
      }
    }
  }
}

function isSupportedGroupCombatPlanComponent(
  component: MonsterAbilityPlanComponent
): boolean {
  switch (component.kind) {
    case "heal":
    case "shield":
    case "mana-drain":
    case "cleanse":
    case "remove-positive":
    case "cooldown-pressure":
    case "reapply-expired":
      return true;
    case "runtime-effect":
      if (!component.effectKind) {
        return false;
      }
      switch (component.effectKind) {
        case "accuracy":
        case "evasion":
        case "outgoing-damage":
        case "incoming-damage":
        case "mark":
        case "burn":
        case "bleed":
        case "ability-lock":
        case "mana-cost-pressure":
        case "reflect":
        case "status-resistance":
        case "flee":
        case "crit":
        case "slow":
        case "confusion":
        case "cooldown-pressure":
        case "next-attack-bonus":
        case "counter":
        case "repeat-penalty":
          return true;
      }
  }
}

export type GroupCombatStatus = "active" | "won" | "lost" | "invalid";
export type GroupCombatRulesVersion =
  | typeof GROUP_COMBAT_RULES_VERSION
  | typeof GROUP_COMBAT_PRODUCTION_RULES_VERSION;
export type GroupCombatActionKey = "attack" | "guard" | "class" | "race" | "gear" | "item" | "flee";
export type GroupCombatTargetKind = "self" | "ally" | "enemy";
export type GroupCombatStatusKind =
  | "guard"
  | "response-mitigation"
  | "counter"
  | "bleed"
  | "monster-accuracy-penalty"
  | "monster-burn"
  | "monster-incoming-damage"
  | "monster-damage-reduction"
  | "monster-evasion"
  | "monster-outgoing-damage";
export type GroupCombatPresentedEffectKind =
  | GroupCombatStatusKind
  | MonsterAbilityEffectKind;
export const GROUP_COMBAT_COMPACT_EFFECT_KIND_BY_KIND = {
  guard: "g",
  "response-mitigation": "r",
  counter: "c",
  bleed: "b",
  "monster-accuracy-penalty": "0",
  "monster-burn": "1",
  "monster-incoming-damage": "2",
  "monster-damage-reduction": "3",
  "monster-evasion": "4",
  "monster-outgoing-damage": "5",
  accuracy: "a",
  evasion: "e",
  "outgoing-damage": "o",
  "incoming-damage": "i",
  mark: "m",
  burn: "u",
  "ability-lock": "l",
  "mana-cost-pressure": "p",
  reflect: "f",
  "status-resistance": "s",
  flee: "x",
  crit: "q",
  slow: "w",
  confusion: "n",
  "cooldown-pressure": "d",
  "next-attack-bonus": "z",
  "repeat-penalty": "y"
} as const satisfies Record<GroupCombatPresentedEffectKind, string>;
export type GroupCombatCompactPresentedEffectKind =
  (typeof GROUP_COMBAT_COMPACT_EFFECT_KIND_BY_KIND)[GroupCombatPresentedEffectKind];
export type GroupCombatPresentedEffectTargetKind = "participant" | "enemy";

export const GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND = {
  guard: "participant",
  "response-mitigation": "participant",
  counter: "participant",
  bleed: "enemy",
  "monster-accuracy-penalty": "participant",
  "monster-burn": "participant",
  "monster-incoming-damage": "participant",
  "monster-damage-reduction": "enemy",
  "monster-evasion": "enemy",
  "monster-outgoing-damage": "enemy"
} as const satisfies Record<GroupCombatStatusKind, GroupCombatPresentedEffectTargetKind>;

let presentedEffectTargetSides:
  | ReadonlyMap<GroupCombatPresentedEffectKind, ReadonlySet<GroupCombatPresentedEffectTargetKind>>
  | undefined;

function getGroupCombatPresentedEffectTargetSideMap(): ReadonlyMap<
  GroupCombatPresentedEffectKind,
  ReadonlySet<GroupCombatPresentedEffectTargetKind>
> {
  if (presentedEffectTargetSides) {
    return presentedEffectTargetSides;
  }
  const sides = new Map<
    GroupCombatPresentedEffectKind,
    Set<GroupCombatPresentedEffectTargetKind>
  >();
  const add = (
    kind: GroupCombatPresentedEffectKind,
    targetKind: GroupCombatPresentedEffectTargetKind
  ): void => {
    const current = sides.get(kind) ?? new Set<GroupCombatPresentedEffectTargetKind>();
    current.add(targetKind);
    sides.set(kind, current);
  };
  for (const [kind, targetKind] of Object.entries(GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND) as Array<[
    GroupCombatStatusKind,
    GroupCombatPresentedEffectTargetKind
  ]>) {
    add(kind, targetKind);
  }
  for (const ability of listGroupCombatProductionV1Abilities()) {
    for (let cycle = 1; cycle <= 6; cycle += 1) {
      const plan = compileMonsterAbilityExecutionPlan({
        ability,
        state: { turn: cycle } as CombatState,
        runtime: {
          ownActionCount: cycle,
          lastDirectHeroDamage: 23
        } as MonsterAbilityRuntimeStateV1
      });
      for (const component of plan.components) {
        if (component.kind === "runtime-effect" && component.effectKind) {
          add(
            component.effectKind,
            component.target === "hero" ? "participant" : "enemy"
          );
        }
      }
    }
  }
  presentedEffectTargetSides = sides;
  return sides;
}

export function getGroupCombatPresentedEffectTargetSides(
  kind: GroupCombatPresentedEffectKind
): readonly GroupCombatPresentedEffectTargetKind[] {
  const sides = getGroupCombatPresentedEffectTargetSideMap().get(kind);
  return (["participant", "enemy"] as const).filter((side) => sides?.has(side));
}

export function isGroupCombatPresentedEffectTargetSideAllowed(
  kind: GroupCombatPresentedEffectKind,
  targetKind: GroupCombatPresentedEffectTargetKind
): boolean {
  return getGroupCombatPresentedEffectTargetSideMap().get(kind)?.has(targetKind) === true;
}

export function assertGroupCombatPresentedEffectTargetSide(
  kind: GroupCombatPresentedEffectKind,
  targetKind: GroupCombatPresentedEffectTargetKind
): void {
  if (!isGroupCombatPresentedEffectTargetSideAllowed(kind, targetKind)) {
    throw new Error(`GroupCombat effect ${kind} cannot target ${targetKind}.`);
  }
}

export function deriveGroupCombatPresentedEffectPolarity(
  kind: GroupCombatPresentedEffectKind,
  targetKind: "participant" | "enemy"
): MonsterAbilityEffectPolarity {
  switch (kind) {
    case "guard":
    case "response-mitigation":
    case "counter":
    case "monster-accuracy-penalty":
      return "beneficial";
    case "bleed":
    case "monster-burn":
    case "monster-incoming-damage":
      return "harmful";
    case "monster-damage-reduction":
    case "monster-evasion":
    case "monster-outgoing-damage":
      return "beneficial";
  }
  if (
    kind === "reflect" ||
    kind === "status-resistance" ||
    kind === "next-attack-bonus"
  ) {
    return targetKind === "enemy" ? "beneficial" : "neutral";
  }
  return targetKind === "participant" ? "harmful" : "beneficial";
}

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
  fleeAttempts?: number;
  fledAtTurn?: number;
  cooldowns?: CombatState["cooldowns"];
  playerAbilityFumbles?: PlayerAbilityFumblesState;
  lastActionKey?: GroupCombatActionKey;
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
  abilityOwnActionCount?: number;
  lastActionKind?: "attack" | "ability";
  lastAbilityId?: string;
  lastDirectParticipantDamage?: number;
  shield?: {
    sourceAbilityId: string;
    sourceEnemyId: string;
    points: number;
  };
}

export interface GroupCombatMonsterAbilityEffect {
  id: string;
  sourceEnemyId: string;
  sourceAbilityId: string;
  targetKind: "participant" | "enemy";
  targetId: string;
  kind: MonsterAbilityEffectKind;
  value: number;
  polarity: MonsterAbilityEffectPolarity;
  removable: boolean;
  trigger: MonsterAbilityComponentTrigger;
  triggerId?: string;
  remainingSourceActivations?: number;
  remainingTargetActivations?: number;
  charges?: number;
  lockSource?: "class" | "race";
  lockedAbilityId?: string;
  reapplication?: {
    sourceEnemyId: string;
    sourceAbilityId: string;
    turn: number;
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
  primaryStartingHp: number;
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
    lossPolicy?: typeof GROUP_COMBAT_LOSS_REWARD_POLICY;
    lootVersion: 1;
    lootSnapshot: GroupCombatLootVersionOneSnapshot;
  };
  canonicalV1: GroupCombatProductionV1Evidence;
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

export interface GroupCombatProductionV1EnemyEvidence {
  enemyId: string;
  monsterId: string;
  name: string;
  order: number;
  level: number;
  baseRewardLevel: number;
  hpMax: number;
  attack: number;
  defense: number;
  combatStats: {
    dexterity: number;
    spellPower?: number;
    tags: string[];
  };
  abilities: MonsterAbilityDefinition[];
}

export interface GroupCombatProductionV1Evidence {
  version: 1;
  enemies: GroupCombatProductionV1EnemyEvidence[];
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

export interface GroupCombatRecapSnapshot {
  enemyFocusCharacterId?: string;
  participants: Array<{
    hp: number;
    mana: number;
    fleeAttempts?: number;
    fledAtTurn?: number;
    cooldowns?: Array<{ id: string; remainingTurns: number }>;
    itemCooldowns?: Array<{ itemId: string; remainingTurns: number }>;
  }>;
  enemies: Array<{
    hp: number;
    cooldowns?: Array<{ id: string; remainingTurns: number }>;
    shieldPoints?: number;
  }>;
  effects?: Array<{
    kind: GroupCombatPresentedEffectKind;
    targetKind: "participant" | "enemy";
    targetId: string;
    remainingTurns: number;
  }>;
}

export interface GroupCombatCompactRecapSnapshot {
  f?: number;
  p: Array<[
    hp: number,
    mana: number,
    cooldowns: Array<[id: string, remainingTurns: number]> | null,
    itemCooldowns: Array<[itemId: string, remainingTurns: number]> | null,
    fleeAttempts: number | null,
    fledAtTurn: number | null
  ]>;
  e: Array<[
    hp: number,
    cooldowns: Array<[id: string, remainingTurns: number]> | null,
    shieldPoints: number | null
  ]>;
  x?: string | Array<[
    kind: GroupCombatPresentedEffectKind,
    targetKind: "participant" | "enemy",
    targetId: string,
    remainingTurns: number
  ]>;
}

export interface GroupCombatRecapEntry {
  turn: number;
  lines: string[];
  monsterBarkIds?: string[];
  snapshot?: GroupCombatRecapSnapshot | GroupCombatCompactRecapSnapshot;
}

export function expandGroupCombatRecapSnapshot(
  snapshot: GroupCombatRecapEntry["snapshot"],
  state?: {
    participants: Array<{ characterId: string }>;
    enemies: Array<{ id: string }>;
  }
): GroupCombatRecapSnapshot | undefined {
  if (!snapshot) {
    return undefined;
  }
  if ("participants" in snapshot) {
    return snapshot;
  }
  const enemyFocusCharacterId = snapshot.f === undefined
    ? undefined
    : state?.participants[snapshot.f]?.characterId;
  return {
    ...(enemyFocusCharacterId === undefined ? {} : { enemyFocusCharacterId }),
    participants: snapshot.p.map(([
      hp,
      mana,
      cooldowns,
      itemCooldowns,
      fleeAttempts,
      fledAtTurn
    ]) => ({
      hp,
      mana,
      ...(cooldowns
        ? { cooldowns: cooldowns.map(([id, remainingTurns]) => ({ id, remainingTurns })) }
        : {}),
      ...(itemCooldowns
        ? {
            itemCooldowns: itemCooldowns.map(([itemId, remainingTurns]) => ({
              itemId,
              remainingTurns
            }))
          }
        : {}),
      ...(fleeAttempts === null ? {} : { fleeAttempts }),
      ...(fledAtTurn === null ? {} : { fledAtTurn })
    })),
    enemies: snapshot.e.map(([hp, cooldowns, shieldPoints]) => ({
      hp,
      ...(cooldowns
        ? { cooldowns: cooldowns.map(([id, remainingTurns]) => ({ id, remainingTurns })) }
        : {}),
      ...(shieldPoints === null ? {} : { shieldPoints })
    })),
    ...(snapshot.x
      ? {
          effects: typeof snapshot.x === "string"
            ? expandGroupCombatPackedEffects(snapshot.x, state)
            : snapshot.x.map(([kind, targetKind, targetId, remainingTurns]) => ({
                kind,
                targetKind,
                targetId,
                remainingTurns
              }))
        }
      : {})
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
  abilityEffects?: GroupCombatMonsterAbilityEffect[];
  expiredAbilityEffects?: GroupCombatMonsterAbilityEffect[];
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
  manualParticipation?: boolean;
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
  itemId: string;
}

interface GroupCombatPendingResponseItem {
  actor: GroupCombatActorSnapshot;
  itemId: GroupCombatCommittedConsumable["itemId"];
  kind: "guard" | "evade";
  percent: number;
  lineIndex: number;
  used: boolean;
  preventedDamage: number;
  preventedHarmfulOnHitConsequenceCount: number;
  damageAfter: number;
  enemyId?: string;
  enemyName?: string;
}

export interface GroupCombatResolution {
  state: GroupCombatState;
  result: GroupCombatResult | null;
  settlementPlan: GroupCombatSettlementPlan | null;
  committedConsumables: GroupCombatCommittedConsumable[];
}

export interface GroupCombatResolutionOptions {
  blockedConsumables?: readonly GroupCombatCommittedConsumable[];
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
  difficulty: Omit<GroupCombatLeftPassageDifficultySnapshot, "rewards" | "canonicalV1"> & {
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
  state.production!.canonicalV1 = buildGroupCombatProductionV1Evidence(state);
  assertGroupCombatMonsterAbilityExecutionContract(
    state.production!.canonicalV1.enemies.flatMap((enemy) => enemy.abilities)
  );
  assertGroupCombatStateBudget(state);
  return state;
}

export function buildGroupCombatProductionV1Evidence(
  state: GroupCombatState
): GroupCombatProductionV1Evidence {
  if (!state.production) {
    throw new Error("Production-v1 evidence requires frozen encounter metadata.");
  }
  return {
    version: 1,
    enemies: [...state.enemies]
      .sort((left, right) => left.order - right.order)
      .map((enemy) => {
        const authored = enemy.monsterId
          ? findGroupCombatProductionV1Monster(enemy.monsterId)
          : null;
        if (!authored || enemy.level === undefined) {
          throw new Error(`Production-v1 evidence requires authored monster ${enemy.monsterId ?? enemy.id}.`);
        }
        const combatStats = deriveGroupCombatProductionV1MonsterStats({
          monsterId: authored.id,
          effectiveLevel: enemy.level,
          ...(enemy.order > 0
            ? {
                remortCount: state.production!.remort.sourceRemortCount,
                remortPressureMode: "multi" as const
              }
            : {})
        });
        if (!combatStats) {
          throw new Error(`Production-v1 evidence cannot resolve monster ${authored.id}.`);
        }
        const abilities = resolveGroupCombatProductionV1MonsterAbilities({
          monsterId: authored.id,
          effectiveLevel: enemy.level
        });
        if (
          enemy.name !== authored.name ||
          enemy.hpMax !== combatStats.hpMax ||
          enemy.attack !== combatStats.attack ||
          enemy.defense !== Math.max(combatStats.armor, combatStats.resist) ||
          (enemy.abilityIds ?? []).join("\0") !==
            abilities.map((ability) => ability.id).join("\0")
        ) {
          throw new Error(`Production-v1 enemy ${enemy.id} is not canonical.`);
        }
        return {
          enemyId: enemy.id,
          monsterId: authored.id,
          name: enemy.name,
          order: enemy.order,
          level: enemy.level,
          baseRewardLevel: authored.level,
          hpMax: enemy.hpMax,
          attack: enemy.attack,
          defense: enemy.defense,
          combatStats: {
            dexterity: combatStats.dexterity,
            tags: [...combatStats.tags]
          },
          abilities
        };
      })
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
  if (!actor || !isActiveGroupCombatParticipant(actor)) {
    return [];
  }
  const allies = state.participants
    .filter(isActiveGroupCombatParticipant)
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
  if (!actor || !isActiveGroupCombatParticipant(actor)) {
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
  if (action.action === "flee") {
    return action.origin === "manual" &&
      action.targetKind === "self" &&
      action.targetId === actor.characterId
      ? "ok"
      : "invalid-target";
  }
  if (action.action === "item") {
    return action.targetKind !== "self" || action.targetId !== actor.characterId
      ? "invalid-target"
      : isSupportedGroupCombatItem(action.payloadKey) &&
          (actor.combatItemQuantities?.[action.payloadKey] ?? 0) > 0 &&
          isGroupCombatItemAvailable(actor, action.payloadKey) &&
          canUseGroupCombatItem(state, actor, action.payloadKey)
        ? "ok"
        : "action-unavailable";
  }

  const profile = getGroupCombatActionProfile(actor, action.action, action.payloadKey);
  if (
    !profile ||
    isGroupCombatAbilityLocked(state, actor, action) ||
    !isAbilityAvailableWithMonsterPressure(state, actor, profile.ability)
  ) {
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

function isGroupCombatAbilityLocked(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  action: GroupCombatAction
): boolean {
  const locks = activeAbilityEffects(state, "participant", actor.characterId, "ability-lock");
  if (locks.length === 0) {
    return false;
  }
  const profile = getGroupCombatActionProfile(actor, action.action, action.payloadKey);
  return locks.some((effect) =>
    (effect.lockedAbilityId !== undefined && profile?.ability.id === effect.lockedAbilityId) ||
    (effect.lockSource !== undefined && action.action === effect.lockSource)
  );
}

export function deriveGroupCombatLockedAbilityId(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  sourceEnemyId: string,
  sourceAbilityId: string
): string | null {
  const abilityIds = [
    getGroupCombatActionProfile(actor, "class")?.ability.id,
    getGroupCombatActionProfile(actor, "race")?.ability.id,
    ...[...actor.gearAbilityIds]
      .sort((left, right) => left.localeCompare(right))
      .map((abilityId) => getGroupCombatActionProfile(actor, "gear", abilityId)?.ability.id)
  ].filter((abilityId): abilityId is string => Boolean(abilityId));
  if (abilityIds.length === 0) {
    return null;
  }
  const rng = new SeededRandomSource(
    `${state.deterministicSeed}:${sourceEnemyId}:${sourceAbilityId}:${actor.characterId}:ability-lock`
  );
  return abilityIds[rng.nextInt(0, abilityIds.length - 1)] ?? null;
}

function isAbilityAvailableWithMonsterPressure(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  ability: CombatSkillProfile
): boolean {
  return isAbilityAvailable(actor, ability) &&
    actor.mana >= getEffectiveGroupCombatAbilityManaCost(state, actor, ability);
}

export function getEffectiveGroupCombatAbilityManaCost(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  ability: CombatSkillProfile
): number {
  const baseCost = Math.max(0, Math.floor(ability.manaCost ?? 0));
  if (baseCost === 0) {
    return 0;
  }
  const pressure = activeAbilityEffects(
    state,
    "participant",
    actor.characterId,
    "mana-cost-pressure"
  ).reduce((sum, effect) => sum + Math.max(0, Math.floor(effect.value)), 0);
  return baseCost + pressure;
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
  submittedActions: readonly GroupCombatAction[],
  options: GroupCombatResolutionOptions = {}
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
  const currentEnemyFocusCharacterId = getGroupCombatEnemyFocusTarget(state)?.characterId ?? null;
  const damageBeforeTurn = new Map(
    state.contributions.map((contribution) => [contribution.characterId, contribution.damage])
  );
  const defeatedEnemyIds = new Set(
    state.enemies.filter((enemy) => enemy.hp <= 0).map((enemy) => enemy.id)
  );
  const livingActors = state.participants.filter(isActiveGroupCombatParticipant);
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
    return terminalize(
      state,
      "won",
      lines,
      [],
      monsterBarkIds,
      currentEnemyFocusCharacterId
    );
  }
  const respondingEnemyIds = state.enemies
    .filter((enemy) => enemy.hp > 0)
    .map((enemy) => enemy.id);

  const committedConsumables: GroupCombatCommittedConsumable[] = [];
  const pendingResponseItems = new Map<string, GroupCombatPendingResponseItem>();
  const blockedConsumables = new Set(
    (options.blockedConsumables ?? []).map((entry) => `${entry.characterId}\0${entry.itemId}`)
  );
  for (const actorAtStart of livingActors) {
    if (state.enemies.every((enemy) => enemy.hp <= 0)) {
      break;
    }
    const actor = state.participants.find((candidate) => candidate.characterId === actorAtStart.characterId)!;
    if (!isActiveGroupCombatParticipant(actor)) {
      continue;
    }
    const submittedAction =
      actionsByActor.get(actor.characterId) ??
      buildGroupCombatTimeoutAction(state, actor.characterId);
    const action = applyGroupCombatConfusion(state, actor, submittedAction);
    const contribution = getContribution(state, actor.characterId);
    applyParticipantMonsterEffects(state, actor, lines);
    if (actor.hp <= 0) {
      tickParticipantMonsterEffects(state, actor.characterId);
      continue;
    }
    if (action.action === "attack") {
      applyBasicAttack(state, actor, action, contribution, lines);
    } else if (action.action === "guard") {
      tickActorAfterCommittedAction(actor);
      tickGroupCombatItemCooldowns(actor);
      addProtectionStatus(
        state,
        actor.characterId,
        actor.characterId,
        "guard",
        GROUP_COMBAT_BASIC_GUARD_SENTINEL
      );
      contribution.guardedTurns += 1;
      lines.push(
        action.origin === "timeout"
          ? `${actor.name} мовчить і стає в захист.`
          : `${actor.name} стає в захист.`
      );
    } else if (action.action === "flee") {
      applyFleeAction(state, actor, lines);
    } else if (action.action === "item") {
      const itemId = action.payloadKey as GroupCombatCommittedConsumable["itemId"];
      tickActorAfterCommittedAction(actor);
      tickGroupCombatItemCooldowns(actor);
      if (
        blockedConsumables.has(`${actor.characterId}\0${itemId}`) ||
        !canUseGroupCombatItem(state, actor, itemId)
      ) {
        lines.push(
          `${presentParticipantActionLabel(
            actor,
            "не витрачає манатку",
            getGroupCombatItemPresentation(itemId)?.label ?? itemId
          )}: ефекту вже нема на що подіяти, тож манатка лишається в торбі.`
        );
        actor.lastActionKey = action.action;
        tickParticipantMonsterEffects(state, actor.characterId);
        continue;
      }
      const responseEffect = getGroupCombatResponseItemEffect(itemId);
      if (responseEffect) {
        const lineIndex = lines.length;
        lines.push("");
        pendingResponseItems.set(actor.characterId, {
          actor,
          itemId,
          ...responseEffect,
          lineIndex,
          used: false,
          preventedDamage: 0,
          preventedHarmfulOnHitConsequenceCount: 0,
          damageAfter: 0
        });
      } else {
        const restored = applyCombatItem(state, actor, itemId);
        recordGroupCombatItemUse(actor, itemId);
        decrementGroupCombatItemQuantity(actor, itemId);
        contribution.healing += restored.healing;
        contribution.damage += restored.damage;
        committedConsumables.push({ characterId: actor.characterId, itemId });
        lines.push(
          `${presentParticipantActionLabel(
            actor,
            "використовує манатку",
            getGroupCombatItemPresentation(itemId)?.label ?? itemId
          )}: ${restored.line}.`
        );
      }
    } else {
      applyAbilityAction(state, actor, action, contribution, lines);
      tickGroupCombatItemCooldowns(actor);
    }
    actor.lastActionKey = action.action;
    appendNewlyDefeatedEnemyLines(state, defeatedEnemyIds, lines);
    tickParticipantMonsterEffects(state, actor.characterId);
  }

  applyEnemyPhase(state, respondingEnemyIds, lines, monsterBarkIds, pendingResponseItems);
  for (const pending of pendingResponseItems.values()) {
    const label = getGroupCombatItemPresentation(pending.itemId)?.label ?? pending.itemId;
    if (!pending.used) {
      lines[pending.lineIndex] = `${presentParticipantActionLabel(
        pending.actor,
        "не витрачає манатку",
        label
      )}: жодна відповідь не дала корисного ефекту, тож манатка лишається в торбі.`;
      continue;
    }
    recordGroupCombatItemUse(pending.actor, pending.itemId);
    decrementGroupCombatItemQuantity(pending.actor, pending.itemId);
    committedConsumables.push({ characterId: pending.actor.characterId, itemId: pending.itemId });
    const response = pending.kind === "evade"
      ? pending.preventedDamage > 0
        ? `${pending.enemyName ?? "Ворог"} не влучає саме цією відповіддю`
        : `${pending.enemyName ?? "Ворог"}: шкідливий наслідок цієї відповіді не спрацьовує`
      : `${pending.enemyName ?? "Ворог"}: відвернуто ${pending.preventedDamage} шкоди, пройшло ${pending.damageAfter}`;
    lines[pending.lineIndex] = `${presentParticipantActionLabel(
      pending.actor,
      "використовує манатку",
      label
    )}: ${response}.`;
  }
  pruneExpiredGroupCombatAbilityEffects(state);
  appendNewlyDefeatedEnemyLines(state, defeatedEnemyIds, lines);
  recordGroupCombatTurnDamageForFocus(state, damageBeforeTurn);
  // Match persistent PvE: defeating the final enemy is a win even when the
  // same landed hit triggers a lethal counter, reflect or shield-break reaction.
  if (state.enemies.every((enemy) => enemy.hp <= 0)) {
    return terminalize(
      state,
      "won",
      lines,
      committedConsumables,
      monsterBarkIds,
      currentEnemyFocusCharacterId
    );
  }
  state.statuses = state.statuses
    .map((status) =>
      status.kind === "bleed" ||
      status.targetKind === "enemy" ||
      status.kind === "monster-accuracy-penalty" ||
      status.kind === "monster-burn" ||
      status.kind === "monster-incoming-damage"
        ? status
        : { ...status, remainingTurns: status.remainingTurns - 1 }
    )
    .filter((status) => status.remainingTurns > 0);

  if (
    state.participants.every((participant) => !isActiveGroupCombatParticipant(participant)) ||
    (
      state.rulesVersion === GROUP_COMBAT_RULES_VERSION &&
      state.turn >= GROUP_COMBAT_TURN_LIMIT
    )
  ) {
    return terminalize(
      state,
      "lost",
      lines,
      committedConsumables,
      monsterBarkIds,
      currentEnemyFocusCharacterId
    );
  }

  const nextEnemyFocus = getGroupCombatEnemyFocusTarget(state);
  if (
    nextEnemyFocus &&
    currentEnemyFocusCharacterId &&
    nextEnemyFocus.characterId !== currentEnemyFocusCharacterId
  ) {
    lines.push(`🎯 На наступний хід увага ворогів переходить на ${nextEnemyFocus.name}.`);
  }

  state.recap = appendRecap(state, lines, monsterBarkIds, currentEnemyFocusCharacterId);
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
    isGroupCombatManualRewardParticipant(state, participant.characterId)
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
        ...(participant.fledAtTurn !== undefined ? { manualParticipation: false } : {}),
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
              manualParticipation:
                participant.manualParticipation ??
                (participant.contribution.committedActions > 0)
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
    throw new Error(
      `Group-combat state uses ${bytes} bytes and exceeds ${GROUP_COMBAT_STATE_BYTE_LIMIT} bytes.`
    );
  }
}

export function isSupportedGroupCombatItem(
  itemId: string | undefined
): itemId is string {
  return Boolean(itemId && GROUP_COMBAT_SUPPORTED_ITEM_IDS.includes(itemId));
}

export function isGroupCombatManualRewardParticipant(
  state: GroupCombatState,
  characterId: string
): boolean {
  const participant = state.participants.find(
    (candidate) => candidate.characterId === characterId
  );
  return Boolean(
    participant &&
    participant.fledAtTurn === undefined &&
    getContribution(state, characterId).committedActions > 0
  );
}

export function buildGroupCombatFleeExitReceipt(
  state: GroupCombatState,
  characterId: string
): GroupCombatSettlementReceipt | null {
  if (
    state.rulesVersion !== GROUP_COMBAT_PRODUCTION_RULES_VERSION
  ) {
    return null;
  }
  const participant = state.participants.find(
    (candidate) =>
      candidate.characterId === characterId &&
      candidate.fledAtTurn !== undefined
  );
  if (!participant) {
    return null;
  }
  return {
    version: 1,
    policy: "left-passage-party",
    sessionId: state.sessionId,
    characterId,
    remortCount: participant.remortCount,
    resources: { hp: participant.hp, mana: participant.mana },
    rewards: zeroRewards(),
    effects: buildSettlementEffectKeys(state, characterId, false),
    manualParticipation: false
  };
}

export function isSupportedGroupCombatMonsterAbility(
  abilityId: string | undefined
): abilityId is string {
  return Boolean(
    abilityId &&
    GROUP_COMBAT_SUPPORTED_MONSTER_ABILITY_IDS.includes(abilityId)
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
  const reactionLines: string[] = [];
  const damage = applyPlayerDamageToEnemy(
    state,
    target,
    Math.max(0, defenderState.hp - resolved.defenderState.hp),
    actor.characterId,
    "attack",
    reactionLines
  );
  contribution.damage += damage;
  tickGroupCombatItemCooldowns(actor);
  lines.push(
    resolved.summary.actorOutcome === "miss"
      ? `${actor.name} атакує ${target.name}, але не влучає.`
      : `${actor.name} атакує ${target.name}${resolved.summary.critical ? " критично" : ""}: ${damage} шкоди.`
  );
  lines.push(...reactionLines);
}

function applyFleeAction(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  lines: string[]
): void {
  const primaryEnemy = livingEnemies(state)[0];
  if (!primaryEnemy) {
    return;
  }
  const attempt = (actor.fleeAttempts ?? 0) + 1;
  const fleePenaltyPp = activeAbilityEffects(
    state,
    "participant",
    actor.characterId,
    "flee"
  ).reduce((sum, effect) => sum + Math.max(0, effect.value), 0);
  const fled = rollFleeSuccess(
    actorCombatStats(actor),
    groupCombatEnemyActorStats(state, primaryEnemy, actor.level, actor.characterId),
    new SeededRandomSource(
      `${state.deterministicSeed}:${state.turn}:${actor.rosterOrder}:flee:${attempt}:${primaryEnemy.order}`
    ),
    attempt,
    fleePenaltyPp
  );
  actor.fleeAttempts = attempt;
  tickActorAfterCommittedAction(actor);
  tickGroupCombatItemCooldowns(actor);
  if (!fled) {
    lines.push(
      `${actor.name} пробує відступити, але Лівий прохід не відпускає. Спроба ${attempt}.`
    );
    return;
  }
  actor.fledAtTurn = state.turn;
  actor.threat = 0;
  state.statuses = state.statuses.filter(
    (status) => !(status.targetKind === "participant" && status.targetId === actor.characterId)
  );
  lines.push(`${actor.name} виривається з бою. Спроба ${attempt} вдалася.`);
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
  const baseManaCost = Math.max(0, Math.floor(ability.manaCost ?? 0));
  const effectiveManaCost = getEffectiveGroupCombatAbilityManaCost(state, actor, ability);
  applyActorResourceState(actor, resolved.actorState);
  actor.mana = Math.max(0, actor.mana - Math.max(0, effectiveManaCost - baseManaCost));

  if (resolved.summary.fumble) {
    lines.push(`${actor.name}: ${resolved.summary.fumble.line}`);
    return;
  }

  const reactionLines: string[] = [];
  const damageEntries: Array<{ name: string; damage: number }> = [];
  const primaryDamage = primaryEnemy
    ? applyPlayerDamageToEnemy(
        state,
        primaryEnemy,
        Math.max(0, defenderState.hp - resolved.defenderState.hp),
        actor.characterId,
        action.action,
        reactionLines
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
    const applied = applyPlayerDamageToEnemy(
      state,
      target,
      damage,
      actor.characterId,
      action.action,
      reactionLines
    );
    dealt += applied;
    damageEntries.push({ name: target.name, damage: applied });
  }
  contribution.damage += dealt;
  contribution.specialActions = (contribution.specialActions ?? 0) + 1;

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
      if (!target || !isActiveGroupCombatParticipant(target)) {
        continue;
      }
      const healed = healParticipant(target, ability.healAmount);
      contribution.healing += healed;
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
  lines.push(...reactionLines);
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
  action: "застосовує вміння" | "використовує манатку" | "не витрачає манатку",
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
  monsterBarkIds: string[],
  pendingResponseItems: Map<string, GroupCombatPendingResponseItem>
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
    if (!getGroupCombatEnemyFocusTarget(state)) {
      break;
    }
    const defeatedFinalResponder = enemy.hp <= 0;
    if (!defeatedFinalResponder) {
      tickEnemyAbilityCooldowns(enemy);
      tickEnemyAbilityEffects(state, enemy.id);
      enemy.abilityOwnActionCount = (enemy.abilityOwnActionCount ?? 0) + 1;
    }
    const enemyContribution = getEnemyContribution(state, enemy.id);
    enemyContribution.actions += 1;
    const ability = defeatedFinalResponder
      ? null
      : selectGroupCombatEnemyAbility(state, enemy);
    const frozen = state.production?.canonicalV1.enemies.find(
      (candidate) => candidate.enemyId === enemy.id
    );
    const authored = !frozen && enemy.monsterId
      ? monsters.find((candidate) => candidate.id === enemy.monsterId)
      : null;
    if ((frozen || authored) && enemy.id === barkSpeaker?.id) {
      const monster = frozen
        ? {
            monsterId: frozen.monsterId,
            name: frozen.name,
            level: frozen.level,
            hpMax: frozen.hpMax,
            attack: frozen.attack,
            armor: frozen.defense,
            resist: frozen.defense,
            dexterity: frozen.combatStats.dexterity,
            tags: [...frozen.combatStats.tags]
          }
        : deriveMonsterCombatStats(
            { ...authored!, level: enemy.level ?? authored!.level },
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
      ? executeGroupCombatEnemyAbility(state, enemy, ability, lines, pendingResponseItems)
      : false;
    if (ability && special) {
      enemy.lastActionKind = "ability";
      enemy.lastAbilityId = ability.id;
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
      enemy.lastActionKind = "attack";
      delete enemy.lastAbilityId;
      const target = getGroupCombatEnemyFocusTarget(state);
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
      const damage = applyGroupCombatEnemyDamage(state, enemy, target, rawDamage, pendingResponseItems);
      enemy.lastDirectParticipantDamage = damage;
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

export function applyGroupCombatEnemyDamage(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  target: GroupCombatActorSnapshot,
  rawDamage: number,
  pendingResponseItems?: Map<string, GroupCombatPendingResponseItem>,
  evaluateHarmfulOnHitConsequences?: (damageAfterEarlierProtection: number) => number
): number {
    const targetContribution = getContribution(state, target.characterId);
    let damage = Math.max(0, rawDamage);
    const evasionPenaltyPp = activeAbilityEffects(
      state,
      "participant",
      target.characterId,
      "evasion"
    ).reduce((sum, effect) => sum + effect.value, 0);
    if (
      damage <= 0 &&
      evasionPenaltyPp > 0 &&
      new SeededRandomSource(
        `${state.deterministicSeed}:${state.turn}:${enemy.id}:${target.characterId}:evasion-penalty`
      ).nextFloat() < Math.min(0.95, evasionPenaltyPp / 100)
    ) {
      damage = Math.max(1, enemy.attack - target.defense);
    }
    damage = Math.floor(
      damage *
      multiplyAbilityEffectValues(
        state,
        "enemy",
        enemy.id,
        "outgoing-damage",
        1
      ) *
      consumeNextAttackBonus(state, enemy.id)
    );
    if (damage > 0) {
      damage = Math.floor(
        damage * consumeMarkMultiplier(state, target.characterId)
      );
    }
    damage = Math.floor(
      damage *
      multiplyGroupCombatStatusValues(state, target.characterId, "monster-incoming-damage") /
      10_000
    );
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
        : protection.kind === "response-mitigation" && protection.value >= GROUP_COMBAT_PERCENT_GUARD_SENTINEL
          ? Math.min(damage, Math.floor(damage * Math.min(100, protection.value - GROUP_COMBAT_PERCENT_GUARD_SENTINEL) / 100))
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
    const itemResponse = pendingResponseItems?.get(target.characterId);
    if (itemResponse && !itemResponse.used) {
      const delta = resolveCombatResponseItemDelta({
        damage,
        harmfulOnHitConsequenceCount: evaluateHarmfulOnHitConsequences?.(damage) ?? 0
      }, itemResponse);
      if (delta.eligible) {
        damage = delta.damageAfter;
        itemResponse.used = true;
        itemResponse.preventedDamage = delta.preventedDamage;
        itemResponse.preventedHarmfulOnHitConsequenceCount =
          delta.preventedHarmfulOnHitConsequenceCount;
        itemResponse.damageAfter = damage;
        itemResponse.enemyId = enemy.id;
        itemResponse.enemyName = enemy.name;
        getContribution(state, target.characterId).control +=
          delta.preventedDamage + delta.preventedHarmfulOnHitConsequenceCount;
      }
    }
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
      }
    }
    return damage;
}

function didEvadeGroupCombatResponse(
  pendingResponseItems: ReadonlyMap<string, GroupCombatPendingResponseItem>,
  target: GroupCombatActorSnapshot,
  enemy: GroupCombatEnemyState
): boolean {
  const pending = pendingResponseItems.get(target.characterId);
  return Boolean(
    pending?.used &&
    pending.kind === "evade" &&
    pending.enemyId === enemy.id
  );
}

function countActualGroupCombatHarmfulOnHitConsequences(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition,
  plan: ReturnType<typeof compileMonsterAbilityExecutionPlan>,
  target: GroupCombatActorSnapshot,
  damageAfterEarlierProtection: number
): number {
  if (damageAfterEarlierProtection <= 0) {
    return 0;
  }
  return plan.components.filter((component) => {
    if (!component.directHitRequired || component.target !== "hero") {
      return false;
    }
    if (!isHarmfulGroupCombatHeroComponent(component, ability.id)) {
      return false;
    }
    return wouldApplyGroupCombatHarmfulOnHitComponent(
      state,
      enemy,
      ability,
      component,
      target
    );
  }).length;
}

function isHarmfulGroupCombatHeroComponent(
  component: MonsterAbilityPlanComponent,
  sourceAbilityId: string
): boolean {
  if (component.kind === "runtime-effect" && component.effectKind) {
    return getMonsterAbilityEffectContract({
      target: "hero",
      kind: component.effectKind,
      value: component.value ?? 0,
      sourceAbilityId
    }).polarity === "harmful";
  }
  return component.kind === "mana-drain" ||
    component.kind === "remove-positive" ||
    component.kind === "cooldown-pressure";
}

function wouldApplyGroupCombatHarmfulOnHitComponent(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition,
  component: MonsterAbilityPlanComponent,
  target: GroupCombatActorSnapshot
): boolean {
  if (component.kind === "runtime-effect" && component.effectKind) {
    const probe = cloneGroupCombatState(state);
    const probeEnemy = probe.enemies.find((candidate) => candidate.id === enemy.id);
    if (!probeEnemy) {
      return false;
    }
    return addOrMergeGroupCombatAbilityEffect(
      { state: probe, enemy: probeEnemy, ability },
      component,
      "participant",
      target.characterId
    );
  }
  if (component.kind === "mana-drain") {
    return target.mana > 0 && Math.floor(component.value ?? 0) > 0;
  }
  if (component.kind === "remove-positive") {
    return (state.abilityEffects ?? []).some((effect) =>
      effect.targetKind === "participant" &&
      effect.targetId === target.characterId &&
      effect.polarity === "beneficial" &&
      effect.removable
    ) || state.statuses.some((status) =>
      status.targetKind === "participant" &&
      status.targetId === target.characterId &&
      (status.kind === "guard" ||
        status.kind === "response-mitigation" ||
        status.kind === "counter")
    );
  }
  if (component.kind === "cooldown-pressure") {
    return Math.floor(component.value ?? 0) > 0 && Boolean(
      target.cooldowns?.skill || Object.keys(target.cooldowns?.abilities ?? {}).length > 0
    );
  }
  return false;
}

function wouldAddOrRefreshMonsterStatusChange(
  state: GroupCombatState,
  status: GroupCombatTimedStatus
): boolean {
  const existing = state.statuses.find((candidate) =>
    candidate.kind === status.kind &&
    candidate.sourceEnemyId === status.sourceEnemyId &&
    candidate.sourceAbilityId === status.sourceAbilityId &&
    candidate.targetKind === status.targetKind &&
    candidate.targetId === status.targetId
  );
  return !existing ||
    status.value > existing.value ||
    status.remainingTurns > existing.remainingTurns ||
    (status.appliedTurn !== undefined && status.appliedTurn !== existing.appliedTurn);
}

function applyPlayerDamageToEnemy(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  rawDamage: number,
  sourceCharacterId?: string,
  sourceActionKey?: GroupCombatActionKey,
  reactionLines: string[] = []
): number {
  let damage = Math.min(enemy.hp, Math.max(0, Math.floor(rawDamage)));
  if (sourceCharacterId) {
    const accuracyPenalty = activeAbilityEffects(
      state,
      "participant",
      sourceCharacterId,
      "accuracy"
    ).reduce((sum, effect) => sum + effect.value, 0);
    const evasionBonus = activeAbilityEffects(
      state,
      "enemy",
      enemy.id,
      "evasion"
    ).reduce((sum, effect) => sum + effect.value, 0);
    if (
      damage > 0 &&
      new SeededRandomSource(
        `${state.deterministicSeed}:${state.turn}:${sourceCharacterId}:${enemy.id}:ability-evasion`
      ).nextFloat() < Math.min(0.95, (accuracyPenalty + evasionBonus) / 100)
    ) {
      damage = 0;
    }
    const outgoingMultiplier = multiplyAbilityEffectValues(
      state,
      "participant",
      sourceCharacterId,
      "outgoing-damage",
      1
    );
    const repeatPenalty = consumeRepeatedActionPenalty(
      state,
      sourceCharacterId,
      sourceActionKey
    );
    const slowReduction = Math.min(
      0.35,
      activeAbilityEffects(state, "participant", sourceCharacterId, "slow")
        .reduce((sum, effect) => sum + effect.value, 0) / 100
    );
    const critReduction = Math.min(
      0.2,
      activeAbilityEffects(state, "participant", sourceCharacterId, "crit")
        .reduce((sum, effect) => sum + effect.value, 0) / 200
    );
    const confusionReduction = activeAbilityEffects(
      state,
      "participant",
      sourceCharacterId,
      "confusion"
    ).length > 0
      ? 0.1
      : 0;
    damage = Math.max(
      damage > 0 ? 1 : 0,
      Math.floor(
        damage *
        outgoingMultiplier *
        repeatPenalty *
        (1 - slowReduction - critReduction - confusionReduction)
      )
    );
  }
  const runtimeReduction = activeAbilityEffects(
    state,
    "enemy",
    enemy.id,
    "incoming-damage"
  ).reduce((factor, effect) => factor * Math.max(0, 1 - effect.value), 1);
  damage = Math.max(damage > 0 ? 1 : 0, Math.floor(damage * runtimeReduction));
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
      if (sourceCharacterId) {
        applyGroupCombatShieldBreakRetaliation(
          state,
          sourceCharacterId,
          shield.sourceEnemyId,
          shield.sourceAbilityId,
          reactionLines
        );
      }
    } else if (absorbed > 0) {
      armGroupCombatShieldSurvivalBonus(
        state,
        enemy,
        shield.sourceEnemyId,
        shield.sourceAbilityId
      );
    }
  }
  damage = Math.min(enemy.hp, damage);
  enemy.hp -= damage;
  getEnemyContribution(state, enemy.id).damageTaken += damage;
  if (damage > 0 && sourceCharacterId) {
    applyGroupCombatReflectAndCounter(
      state,
      enemy,
      sourceCharacterId,
      reactionLines
    );
  }
  return damage;
}

function applyGroupCombatShieldBreakRetaliation(
  state: GroupCombatState,
  targetCharacterId: string,
  sourceEnemyId: string,
  sourceAbilityId: string,
  reactionLines: string[]
): void {
  const source = state.enemies.find((enemy) => enemy.id === sourceEnemyId);
  const target = state.participants.find(
    (participant) => participant.characterId === targetCharacterId
  );
  const ability = source
    ? findGroupCombatEnemyAbility(state, source, sourceAbilityId)
    : null;
  if (!source || !target || !ability) {
    return;
  }
  const authoredDamage = resolveMonsterShieldBreakRetaliationDamage({
    monsterAttack: source.attack,
    sourceAbility: ability
  });
  if (authoredDamage <= 0) {
    return;
  }
  const damage = Math.min(
    target.hp,
    authoredDamage
  );
  target.hp -= damage;
  getContribution(state, targetCharacterId).damageTaken += damage;
  getEnemyContribution(state, sourceEnemyId).damage += damage;
  reactionLines.push(
    `💥 ${source.name}: щит розбито, ${target.name} отримує ${damage} шкоди.`
  );
}

function armGroupCombatShieldSurvivalBonus(
  state: GroupCombatState,
  target: GroupCombatEnemyState,
  sourceEnemyId: string,
  sourceAbilityId: string
): void {
  const source = state.enemies.find((enemy) => enemy.id === sourceEnemyId);
  const ability = source
    ? findGroupCombatEnemyAbility(state, source, sourceAbilityId)
    : null;
  if (!source || !ability) {
    return;
  }
  const plan = compileMonsterAbilityExecutionPlan({
    ability,
    state: { turn: state.turn } as CombatState,
    runtime: {
      ownActionCount: source.abilityOwnActionCount ?? 1,
      lastDirectHeroDamage: source.lastDirectParticipantDamage
    } as MonsterAbilityRuntimeStateV1
  });
  const component = plan.components.find(
    (candidate) =>
      candidate.kind === "runtime-effect" &&
      candidate.trigger === "on-shield-survived" &&
      candidate.effectKind === "next-attack-bonus"
  );
  if (component) {
    addOrMergeGroupCombatAbilityEffect(
      { state, enemy: source, ability },
      component,
      "enemy",
      target.id
    );
  }
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
    .map((abilityId) => findGroupCombatEnemyAbility(state, enemy, abilityId))
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

function findGroupCombatEnemyAbility(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  abilityId: string
): MonsterAbilityDefinition | null {
  if (state.rulesVersion === GROUP_COMBAT_PRODUCTION_RULES_VERSION) {
    return state.production?.canonicalV1.enemies
      .find((candidate) => candidate.enemyId === enemy.id)
      ?.abilities.find((candidate) => candidate.id === abilityId) ?? null;
  }
  return findMonsterAbility(abilityId);
}

function executeGroupCombatEnemyAbility(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition,
  lines: string[],
  pendingResponseItems: Map<string, GroupCombatPendingResponseItem>
): boolean {
  if (!isSupportedGroupCombatMonsterAbility(ability.id)) {
    return false;
  }
  const contribution = getEnemyContribution(state, enemy.id);
  if (ability.id === "monster.smoke-without-approval") {
    let totalDamage = 0;
    let appliedPenaltyCount = 0;
    const targets = livingParticipants(state);
    for (const target of targets) {
      const rawDamage = rollGroupCombatEnemyAbilityDamage(state, enemy, target, ability);
      const accuracyStatus: GroupCombatTimedStatus = {
        id: `${state.turn}:${enemy.id}:${target.characterId}:accuracy`,
        kind: "monster-accuracy-penalty",
        sourceEnemyId: enemy.id,
        sourceAbilityId: ability.id,
        targetKind: GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND["monster-accuracy-penalty"],
        targetId: target.characterId,
        value: positiveInteger(Number(ability.parameters.accuracyPenaltyPp ?? 0)),
        remainingTurns: positiveInteger(Number(ability.parameters.durationTargetActivations ?? 1)),
        appliedTurn: state.turn
      };
      const damage = applyGroupCombatEnemyDamage(
        state,
        enemy,
        target,
        rawDamage,
        pendingResponseItems,
        () => rawDamage > 0 && wouldAddOrRefreshMonsterStatusChange(state, accuracyStatus) ? 1 : 0
      );
      totalDamage += damage;
      if (rawDamage > 0 && !didEvadeGroupCombatResponse(pendingResponseItems, target, enemy)) {
        addOrRefreshMonsterStatus(state, accuracyStatus);
        appliedPenaltyCount += 1;
      }
    }
    contribution.damage += totalDamage;
    contribution.control += appliedPenaltyCount;
    lines.push(
      `${enemy.name} застосовує ${ability.label} по всій ватазі: ${totalDamage} шкоди.`
    );
    return true;
  }
  if (ability.id === "monster.preapproved-bite") {
    const target = getGroupCombatEnemyFocusTarget(state);
    if (!target) {
      return false;
    }
    const rawDamage = rollGroupCombatEnemyAbilityDamage(state, enemy, target, ability);
    const burnStatus: GroupCombatTimedStatus = {
      id: `${state.turn}:${enemy.id}:${target.characterId}:burn`,
      kind: "monster-burn",
      sourceEnemyId: enemy.id,
      sourceAbilityId: ability.id,
      targetKind: GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND["monster-burn"],
      targetId: target.characterId,
      value: Math.max(
        1,
        Math.floor(enemy.attack * Number(ability.parameters.burnDamageMultiplier ?? 0))
      ),
      remainingTurns: positiveInteger(Number(ability.parameters.burnTicks ?? 1)),
      appliedTurn: state.turn
    };
    const damage = applyGroupCombatEnemyDamage(
      state,
      enemy,
      target,
      rawDamage,
      pendingResponseItems,
      () => rawDamage > 0 && wouldAddOrRefreshMonsterStatusChange(state, burnStatus) ? 1 : 0
    );
    contribution.damage += damage;
    if (rawDamage > 0 && !didEvadeGroupCombatResponse(pendingResponseItems, target, enemy)) {
      addOrRefreshMonsterStatus(state, burnStatus);
      contribution.control += 1;
    }
    lines.push(
      damage > 0
        ? `${enemy.name} застосовує ${ability.label} проти ${target.name}: ${damage} шкоди.`
        : `${enemy.name} застосовує ${ability.label}, але ${target.name} уникає шкоди.`
    );
    return true;
  }
  if (ability.id === "monster.ledger-charge") {
    const target = getGroupCombatEnemyFocusTarget(state);
    if (!target) {
      return false;
    }
    const rawDamage = rollGroupCombatEnemyAbilityDamage(state, enemy, target, ability);
    const damage = applyGroupCombatEnemyDamage(state, enemy, target, rawDamage, pendingResponseItems);
    contribution.damage += damage;
    lines.push(
      damage > 0
        ? `${enemy.name} застосовує ${ability.label} проти ${target.name}: ${damage} шкоди.`
        : `${enemy.name} застосовує ${ability.label}, але ${target.name} уникає шкоди.`
    );
    return true;
  }
  if (ability.id === "monster.ledger-audit") {
    const target = getGroupCombatEnemyFocusTarget(state);
    if (!target) {
      return false;
    }
    const manaDrain = Math.min(
      target.mana,
      Math.max(0, Math.floor(Number(ability.parameters.manaDrain ?? 0)))
    );
    target.mana -= manaDrain;
    const duration = positiveInteger(
      Number(ability.parameters.durationTargetActivations ?? 1)
    );
    addOrRefreshMonsterStatus(state, {
      id: `${state.turn}:${enemy.id}:${target.characterId}:incoming-damage`,
      kind: "monster-incoming-damage",
      sourceEnemyId: enemy.id,
      sourceAbilityId: ability.id,
      targetKind: GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND["monster-incoming-damage"],
      targetId: target.characterId,
      value: Math.floor(
        Number(ability.parameters.markIncomingDamageMultiplier ?? 1) * 10_000
      ),
      remainingTurns: duration,
      appliedTurn: state.turn
    });
    contribution.control += 1;
    lines.push(
      `${enemy.name} застосовує ${ability.label} проти ${target.name}: ` +
      `${manaDrain > 0 ? `мана -${manaDrain}; ` : ""}` +
      `отримана шкода посилена на ${duration} дії.`
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
  return executeGenericGroupCombatEnemyAbility(state, enemy, ability, lines, pendingResponseItems);
}

function executeGenericGroupCombatEnemyAbility(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition,
  lines: string[],
  pendingResponseItems: Map<string, GroupCombatPendingResponseItem>
): boolean {
  const recipe = compileMonsterAbilityRecipe(ability);
  const plan = compileMonsterAbilityExecutionPlan({
    ability,
    state: { turn: state.turn } as CombatState,
    runtime: {
      ownActionCount: enemy.abilityOwnActionCount ?? 1,
      lastDirectHeroDamage: enemy.lastDirectParticipantDamage
    } as MonsterAbilityRuntimeStateV1
  });
  const contribution = getEnemyContribution(state, enemy.id);
  const participantTargets = resolveMonsterAbilityParticipantTargets(state, ability);
  const enemyTargets = resolveMonsterAbilityEnemyTargets(state, enemy, ability);
  const effects: string[] = [];
  let applied = false;
  const directHitParticipantIds = new Set<string>();
  const evadedParticipantIds = new Set<string>();

  if (plan.directDamage && participantTargets.length > 0) {
    let totalDamage = 0;
    for (const target of participantTargets) {
      const rawDamage = rollGroupCombatEnemyAbilityDamage(state, enemy, target, ability);
      const damage = applyGroupCombatEnemyDamage(
        state,
        enemy,
        target,
        rawDamage,
        pendingResponseItems,
        (damageAfterEarlierProtection) => countActualGroupCombatHarmfulOnHitConsequences(
          state,
          enemy,
          ability,
          plan,
          target,
          damageAfterEarlierProtection
        )
      );
      totalDamage += damage;
      if (didEvadeGroupCombatResponse(pendingResponseItems, target, enemy)) {
        evadedParticipantIds.add(target.characterId);
      }
      if (damage > 0) {
        directHitParticipantIds.add(target.characterId);
      }
    }
    contribution.damage += totalDamage;
    enemy.lastDirectParticipantDamage = totalDamage;
    effects.push(
      participantTargets.length > 1
        ? `${totalDamage} шкоди всій ватазі`
        : `${totalDamage} шкоди ${participantTargets[0]!.name}`
    );
    applied = true;
  }

  const manaDrain = Math.max(0, Math.floor(abilityNumber(ability, "manaDrain")));
  if (manaDrain > 0 && !plan.components.some((component) => component.kind === "mana-drain")) {
    let drained = 0;
    for (const target of participantTargets.filter((entry) => !evadedParticipantIds.has(entry.characterId))) {
      const amount = Math.min(target.mana, manaDrain);
      target.mana -= amount;
      drained += amount;
    }
    if (drained > 0) {
      effects.push(`мана -${drained}`);
      contribution.control += participantTargets.length;
      applied = true;
    }
  }

  const markMultiplier = abilityNumber(ability, "markIncomingDamageMultiplier");
  if (
    markMultiplier > 1 &&
    !plan.components.some((component) => component.effectKind === "mark")
  ) {
    const duration = monsterAbilityTargetDuration(ability);
    const affectedTargets = participantTargets.filter((entry) => !evadedParticipantIds.has(entry.characterId));
    for (const target of affectedTargets) {
      addOrRefreshMonsterStatus(state, {
        id: `${state.turn}:${enemy.id}:${target.characterId}:incoming-damage`,
        kind: "monster-incoming-damage",
        sourceEnemyId: enemy.id,
        sourceAbilityId: ability.id,
        targetKind: GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND["monster-incoming-damage"],
        targetId: target.characterId,
        value: Math.floor(Math.min(1.75, markMultiplier) * 10_000),
        remainingTurns: duration,
        appliedTurn: state.turn
      });
    }
    if (affectedTargets.length > 0) {
      effects.push("наступна отримана шкода посилена");
      contribution.control += affectedTargets.length;
      applied = true;
    }
  }

  const accuracyPenalty = Math.max(
    abilityNumber(ability, "targetAccuracyPenaltyPp"),
    abilityNumber(ability, "accuracyAndEvasionPenaltyPp")
  );
  if (
    recipe.heroEffects.includes("accuracy") &&
    accuracyPenalty > 0 &&
    !plan.components.some((component) => component.effectKind === "accuracy")
  ) {
    const duration = monsterAbilityTargetDuration(ability);
    const affectedTargets = participantTargets.filter((entry) => !evadedParticipantIds.has(entry.characterId));
    for (const target of affectedTargets) {
      addOrRefreshMonsterStatus(state, {
        id: `${state.turn}:${enemy.id}:${target.characterId}:accuracy`,
        kind: "monster-accuracy-penalty",
        sourceEnemyId: enemy.id,
        sourceAbilityId: ability.id,
        targetKind: GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND["monster-accuracy-penalty"],
        targetId: target.characterId,
        value: Math.floor(Math.min(35, accuracyPenalty)),
        remainingTurns: duration,
        appliedTurn: state.turn
      });
    }
    if (affectedTargets.length > 0) {
      effects.push("влучність ватаги послаблена");
      contribution.control += affectedTargets.length;
      applied = true;
    }
  }

  const ongoingDamageFraction = Math.max(
    plan.selectedRider === null
      ? abilityNumber(ability, "burnDamageMultiplier")
      : 0,
    plan.selectedRider === null
      ? abilityNumber(ability, "bleedDamageMultiplier")
      : 0
  );
  if (
    ongoingDamageFraction > 0 &&
    !plan.components.some((component) =>
      component.effectKind === "burn" || component.effectKind === "bleed"
    )
  ) {
    const duration = Math.max(
      monsterAbilityTargetDuration(ability),
      Math.floor(abilityNumber(ability, "burnTicks")),
      Math.floor(abilityNumber(ability, "bleedTicks"))
    );
    const affectedTargets = participantTargets.filter((entry) => !evadedParticipantIds.has(entry.characterId));
    for (const target of affectedTargets) {
      addOrRefreshMonsterStatus(state, {
        id: `${state.turn}:${enemy.id}:${target.characterId}:ongoing-damage`,
        kind: "monster-burn",
        sourceEnemyId: enemy.id,
        sourceAbilityId: ability.id,
        targetKind: GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND["monster-burn"],
        targetId: target.characterId,
        value: Math.max(1, Math.floor(enemy.attack * Math.min(0.35, ongoingDamageFraction))),
        remainingTurns: duration,
        appliedTurn: state.turn
      });
    }
    if (affectedTargets.length > 0) {
      effects.push("тривала шкода");
      contribution.control += affectedTargets.length;
      applied = true;
    }
  }

  const healFraction = Math.max(
    abilityNumber(ability, "selfHealMaxHpFraction"),
    abilityNumber(ability, "healTargetMaxHpFraction")
  );
  if (healFraction > 0 && !plan.components.some((component) => component.kind === "heal")) {
    let healed = 0;
    for (const target of enemyTargets) {
      healed += healEnemy(
        target,
        Math.max(1, Math.floor(target.hpMax * Math.min(0.4, healFraction)))
      );
    }
    if (healed > 0) {
      contribution.healing += healed;
      effects.push(`монстри відновили ${healed} HP`);
      applied = true;
    }
  }

  const shieldFraction = Math.max(
    abilityNumber(ability, "shieldMaxHpFraction"),
    abilityNumber(ability, "fallbackShieldMaxHpFraction"),
    abilityNumber(ability, "soloFallbackShieldMaxHpFraction")
  );
  if (shieldFraction > 0 && !plan.components.some((component) => component.kind === "shield")) {
    for (const target of enemyTargets) {
      applyEnemyShield(state, enemy, target, ability, shieldFraction);
    }
    effects.push(enemyTargets.length > 1 ? "щит усім монстрам" : "щит");
    applied = true;
  }

  const reduction = Math.max(
    abilityNumber(ability, "damageReduction"),
    abilityNumber(ability, "selfDamageReduction")
  );
  const evasion = Math.max(
    abilityNumber(ability, "evasionBonusPp"),
    abilityNumber(ability, "selfEvasionBonusPp")
  );
  if (
    (reduction > 0 || evasion > 0) &&
    !plan.components.some((component) =>
      component.effectKind === "incoming-damage" ||
      component.effectKind === "evasion"
    )
  ) {
    for (const target of enemyTargets) {
      applyEnemyDefenseEffects(state, enemy, target, ability);
    }
    effects.push("захист монстрів посилено");
    applied = true;
  }

  const outgoing = abilityNumber(ability, "outgoingDamageMultiplier");
  if (
    outgoing > 1 &&
    !plan.components.some((component) => component.effectKind === "outgoing-damage")
  ) {
    for (const target of enemyTargets) {
      addEnemyBuffStatus(
        state,
        enemy,
        target,
        ability.id,
        "monster-outgoing-damage",
        Math.floor(Math.min(1.35, outgoing) * 10_000),
        monsterAbilityOwnDuration(ability)
      );
    }
    effects.push("відповідь монстрів посилено");
    applied = true;
  }

  if (
    ability.parameters.cleanseNegativeEffects &&
    !plan.components.some((component) => component.kind === "cleanse")
  ) {
    const targetIds = new Set(enemyTargets.map((target) => target.id));
    const before = state.statuses.length;
    state.statuses = state.statuses.filter((status) =>
      !(status.targetKind === "enemy" && targetIds.has(status.targetId) && status.kind === "bleed")
    );
    if (state.statuses.length < before) {
      effects.push("послаблення знято");
      contribution.control += before - state.statuses.length;
      applied = true;
    }
  }

  if (
    ability.parameters.removePositiveEffects &&
    !plan.components.some((component) => component.kind === "remove-positive")
  ) {
    const targetIds = new Set(participantTargets.map((target) => target.characterId));
    const before = state.statuses.length;
    state.statuses = state.statuses.filter((status) =>
      !(
        status.targetKind === "participant" &&
        targetIds.has(status.targetId) &&
        (status.kind === "guard" || status.kind === "response-mitigation" || status.kind === "counter")
      )
    );
    if (state.statuses.length < before) {
      effects.push("захист ватаги збито");
      contribution.control += before - state.statuses.length;
      applied = true;
    }
  }

  const compiled = applyCompiledGroupCombatAbilityComponents({
    state,
    enemy,
    ability,
    plan,
    participantTargets,
    enemyTargets,
    directHitParticipantIds
  });
  if (compiled.effects.length > 0) {
    effects.push(...compiled.effects);
    contribution.control += compiled.control;
    applied = true;
  }

  const otherControl =
    recipe.heroEffects.length > 0 ||
    recipe.monsterEffects.length > 0 ||
    recipe.immediate.cooldownPressure ||
    recipe.immediate.reapplyExpired;
  if (!applied && otherControl) {
    return false;
  }

  if (!applied) {
    return false;
  }
  lines.push(
    `${enemy.name} застосовує ${ability.label}` +
    `${effects.length > 0 ? `: ${effects.join("; ")}` : ""}.`
  );
  return true;
}

function applyCompiledGroupCombatAbilityComponents(input: {
  state: GroupCombatState;
  enemy: GroupCombatEnemyState;
  ability: MonsterAbilityDefinition;
  plan: ReturnType<typeof compileMonsterAbilityExecutionPlan>;
  participantTargets: GroupCombatActorSnapshot[];
  enemyTargets: GroupCombatEnemyState[];
  directHitParticipantIds: ReadonlySet<string>;
}): { effects: string[]; control: number } {
  const effects: string[] = [];
  let control = 0;
  for (const component of input.plan.components) {
    if (component.trigger === "on-shield-survived") {
      continue;
    }
    if (
      component.directHitRequired &&
      input.directHitParticipantIds.size === 0
    ) {
      continue;
    }
    const targets = component.target === "hero"
      ? input.participantTargets
        .filter((target) =>
          !component.directHitRequired ||
          input.directHitParticipantIds.has(target.characterId)
        )
        .map((target) => ({
          kind: "participant" as const,
          id: target.characterId,
          participant: target
        }))
      : input.enemyTargets.map((target) => ({
          kind: "enemy" as const,
          id: target.id,
          enemy: target
        }));
    if (targets.length === 0) {
      continue;
    }
    let appliedCount = 0;
    for (const target of targets) {
      if (component.kind === "runtime-effect" && component.effectKind) {
        if (addOrMergeGroupCombatAbilityEffect(input, component, target.kind, target.id)) {
          appliedCount += 1;
        }
        continue;
      }
      if (component.kind === "heal" && target.kind === "enemy" && target.enemy) {
        const healed = healEnemy(
          target.enemy,
          Math.max(1, Math.floor(target.enemy.hpMax * Math.min(0.4, component.value ?? 0)))
        );
        getEnemyContribution(input.state, input.enemy.id).healing += healed;
        appliedCount += healed > 0 ? 1 : 0;
        continue;
      }
      if (component.kind === "shield" && target.kind === "enemy" && target.enemy) {
        const before = target.enemy.shield?.points ?? 0;
        applyEnemyShield(
          input.state,
          input.enemy,
          target.enemy,
          input.ability,
          Math.min(0.4, component.value ?? 0)
        );
        appliedCount += (target.enemy.shield?.points ?? 0) > before ? 1 : 0;
        continue;
      }
      if (component.kind === "mana-drain" && target.kind === "participant" && target.participant) {
        const drained = Math.min(
          target.participant.mana,
          Math.max(0, Math.floor(component.value ?? 0))
        );
        target.participant.mana -= drained;
        appliedCount += drained > 0 ? 1 : 0;
        continue;
      }
      if (component.kind === "cleanse" && target.kind === "enemy") {
        const before = input.state.abilityEffects?.length ?? 0;
        const statusBefore = input.state.statuses.length;
        input.state.abilityEffects = (input.state.abilityEffects ?? []).filter((effect) =>
          !(
            effect.targetKind === "enemy" &&
            effect.targetId === target.id &&
            effect.polarity === "harmful" &&
            effect.removable
          )
        );
        input.state.statuses = input.state.statuses.filter((status) =>
          !(
            status.targetKind === "enemy" &&
            status.targetId === target.id &&
            status.kind === "bleed"
          )
        );
        appliedCount +=
          before -
          input.state.abilityEffects.length +
          statusBefore -
          input.state.statuses.length;
        continue;
      }
      if (component.kind === "remove-positive" && target.kind === "participant") {
        const before = input.state.abilityEffects?.length ?? 0;
        const statusBefore = input.state.statuses.length;
        input.state.abilityEffects = (input.state.abilityEffects ?? []).filter((effect) =>
          !(
            effect.targetKind === "participant" &&
            effect.targetId === target.id &&
            effect.polarity === "beneficial" &&
            effect.removable
          )
        );
        input.state.statuses = input.state.statuses.filter((status) =>
          !(
            status.targetKind === "participant" &&
            status.targetId === target.id &&
            (status.kind === "guard" ||
              status.kind === "response-mitigation" ||
              status.kind === "counter")
          )
        );
        appliedCount +=
          before -
          (input.state.abilityEffects?.length ?? 0) +
          statusBefore -
          input.state.statuses.length;
        continue;
      }
      if (
        component.kind === "cooldown-pressure" &&
        target.kind === "participant" &&
        target.participant
      ) {
        appliedCount += extendGroupCombatLongestCooldown(
          target.participant,
          Math.max(0, Math.floor(component.value ?? 0))
        )
          ? 1
          : 0;
        continue;
      }
      if (component.kind === "reapply-expired") {
        const expired = [...(input.state.expiredAbilityEffects ?? [])]
          .reverse()
          .find((effect) =>
            effect.targetKind === target.kind &&
            effect.targetId === target.id &&
            effect.polarity === "harmful" &&
            effect.removable
          );
        if (expired) {
          const restored = restoreCanonicalExpiredGroupCombatAbilityEffect(
            input.state,
            expired,
            input.enemy,
            input.ability
          );
          if (restored) {
            input.state.abilityEffects ??= [];
            input.state.abilityEffects.push(restored);
            appliedCount += 1;
          }
        }
      }
    }
    if (appliedCount > 0) {
      effects.push(presentCompiledGroupCombatComponent(component, appliedCount));
      control += appliedCount;
    }
  }
  return { effects: [...new Set(effects)], control };
}

function restoreCanonicalExpiredGroupCombatAbilityEffect(
  state: GroupCombatState,
  expired: GroupCombatMonsterAbilityEffect,
  reapplyingEnemy: GroupCombatEnemyState,
  reapplyingAbility: MonsterAbilityDefinition
): GroupCombatMonsterAbilityEffect | null {
  const semanticSource = state.enemies.find((enemy) => enemy.id === expired.sourceEnemyId);
  const semanticAbility = semanticSource
    ? findGroupCombatEnemyAbility(state, semanticSource, expired.sourceAbilityId)
    : null;
  if (!semanticSource || !semanticAbility) {
    return null;
  }
  const target = expired.targetKind === "participant" ? "hero" : "monster";
  let authoredComponent: MonsterAbilityPlanComponent | null = null;
  for (let turn = 1; turn <= 6 && !authoredComponent; turn += 1) {
    for (let ownActionCount = 1; ownActionCount <= 6 && !authoredComponent; ownActionCount += 1) {
      authoredComponent = compileMonsterAbilityExecutionPlan({
        ability: semanticAbility,
        state: { turn } as CombatState,
        runtime: {
          ownActionCount,
          lastDirectHeroDamage: semanticSource.lastDirectParticipantDamage
        } as MonsterAbilityRuntimeStateV1
      }).components.find((candidate) =>
        candidate.kind === "runtime-effect" &&
        candidate.target === target &&
        candidate.effectKind === expired.kind &&
        candidate.value === expired.value &&
        candidate.trigger === expired.trigger &&
        candidate.triggerId === expired.triggerId
      ) ?? null;
    }
  }
  if (!authoredComponent) {
    return null;
  }
  return {
    id: `${state.turn}:${reapplyingEnemy.id}:${reapplyingAbility.id}:reapply:${expired.targetId}`,
    sourceEnemyId: expired.sourceEnemyId,
    sourceAbilityId: expired.sourceAbilityId,
    targetKind: expired.targetKind,
    targetId: expired.targetId,
    kind: expired.kind,
    value: expired.value,
    polarity: expired.polarity,
    removable: expired.removable,
    trigger: expired.trigger,
    ...(expired.triggerId ? { triggerId: expired.triggerId } : {}),
    ...(authoredComponent.durationOwnActivations
      ? { remainingSourceActivations: authoredComponent.durationOwnActivations }
      : {}),
    ...(authoredComponent.durationTargetActivations
      ? { remainingTargetActivations: authoredComponent.durationTargetActivations }
      : {}),
    ...(authoredComponent.charges ? { charges: authoredComponent.charges } : {}),
    ...(expired.lockSource ? { lockSource: expired.lockSource } : {}),
    ...(expired.lockedAbilityId ? { lockedAbilityId: expired.lockedAbilityId } : {}),
    reapplication: {
      sourceEnemyId: reapplyingEnemy.id,
      sourceAbilityId: reapplyingAbility.id,
      turn: state.turn
    }
  };
}

function addOrMergeGroupCombatAbilityEffect(
  input: {
    state: GroupCombatState;
    enemy: GroupCombatEnemyState;
    ability: MonsterAbilityDefinition;
  },
  component: MonsterAbilityPlanComponent,
  targetKind: "participant" | "enemy",
  targetId: string
): boolean {
  if (!component.effectKind) {
    return false;
  }
  assertGroupCombatPresentedEffectTargetSide(component.effectKind, targetKind);
  const target = targetKind === "participant" ? "hero" : "monster";
  const contract = getMonsterAbilityEffectContract({
    sourceAbilityId: input.ability.id,
    sourceActor: "monster",
    target,
    kind: component.effectKind,
    value: component.value ?? 0
  });
  const lockedAbilityId =
    component.effectKind === "ability-lock" &&
    component.sourceParameter === "lockAnyOneAbility" &&
    targetKind === "participant"
      ? deriveGroupCombatLockedAbilityId(
          input.state,
          input.state.participants.find((participant) => participant.characterId === targetId)!,
          input.enemy.id,
          input.ability.id
        )
      : null;
  if (
    component.effectKind === "ability-lock" &&
    component.sourceParameter === "lockAnyOneAbility" &&
    !lockedAbilityId
  ) {
    return false;
  }
  const next: GroupCombatMonsterAbilityEffect = {
    id: `${input.state.turn}:${input.enemy.id}:${input.ability.id}:${component.effectKind}:${component.triggerId ?? "effect"}:${targetId}`,
    sourceEnemyId: input.enemy.id,
    sourceAbilityId: input.ability.id,
    targetKind,
    targetId,
    kind: component.effectKind,
    value: component.value ?? 0,
    polarity: contract.polarity,
    removable: contract.removable,
    trigger: component.trigger,
    ...(component.triggerId ? { triggerId: component.triggerId } : {}),
    ...(component.lockSource ? { lockSource: component.lockSource } : {}),
    ...(lockedAbilityId ? { lockedAbilityId } : {}),
    ...(component.durationOwnActivations
      ? { remainingSourceActivations: component.durationOwnActivations }
      : {}),
    ...(component.durationTargetActivations
      ? { remainingTargetActivations: component.durationTargetActivations }
      : {}),
    ...(component.charges ? { charges: component.charges } : {})
  };
  input.state.abilityEffects ??= [];
  const index = input.state.abilityEffects.findIndex((effect) =>
    effect.sourceEnemyId === next.sourceEnemyId &&
    effect.sourceAbilityId === next.sourceAbilityId &&
    effect.targetKind === next.targetKind &&
    effect.targetId === next.targetId &&
    effect.kind === next.kind &&
    effect.trigger === next.trigger &&
    effect.triggerId === next.triggerId
  );
  if (index < 0) {
    input.state.abilityEffects.push(next);
    return true;
  }
  const current = input.state.abilityEffects[index]!;
  const merged: GroupCombatMonsterAbilityEffect = {
    ...current,
    id: next.id,
    value:
      next.kind === "outgoing-damage" && next.value < 1
        ? Math.min(current.value, next.value)
        : Math.max(current.value, next.value),
    ...(current.remainingSourceActivations !== undefined ||
    next.remainingSourceActivations !== undefined
      ? {
          remainingSourceActivations: Math.max(
            current.remainingSourceActivations ?? 0,
            next.remainingSourceActivations ?? 0
          )
        }
      : {}),
    ...(current.remainingTargetActivations !== undefined ||
    next.remainingTargetActivations !== undefined
      ? {
          remainingTargetActivations: Math.max(
            current.remainingTargetActivations ?? 0,
            next.remainingTargetActivations ?? 0
          )
        }
      : {}),
    ...(current.charges !== undefined || next.charges !== undefined
      ? { charges: Math.max(current.charges ?? 0, next.charges ?? 0) }
      : {})
  };
  input.state.abilityEffects[index] = merged;
  return JSON.stringify(current) !== JSON.stringify(merged);
}

function presentCompiledGroupCombatComponent(
  component: MonsterAbilityPlanComponent,
  count: number
): string {
  const targets = count > 1 ? ` (${count} цілі)` : "";
  switch (component.kind) {
    case "heal":
      return `відновлення HP${targets}`;
    case "shield":
      return `щит${targets}`;
    case "mana-drain":
      return `втрата мани${targets}`;
    case "cleanse":
      return `послаблення знято${targets}`;
    case "remove-positive":
      return `підсилення збито${targets}`;
    case "cooldown-pressure":
      return `відсап подовжено${targets}`;
    case "reapply-expired":
      return `прострочене послаблення повернулося${targets}`;
    case "runtime-effect":
      return `${presentMonsterAbilityEffectKind(component.effectKind!)}${targets}`;
  }
}

function presentMonsterAbilityEffectKind(kind: MonsterAbilityEffectKind): string {
  const labels: Record<MonsterAbilityEffectKind, string> = {
    accuracy: "влучність змінено",
    evasion: "ухилення змінено",
    "outgoing-damage": "силу шкоди змінено",
    "incoming-damage": "вхідну шкоду змінено",
    mark: "мітку накладено",
    burn: "підпал накладено",
    bleed: "кровотечу накладено",
    "ability-lock": "вміння заблоковано",
    "mana-cost-pressure": "вартість мани підвищено",
    reflect: "відбиття шкоди готове",
    "status-resistance": "стійкість до станів посилено",
    flee: "відступ ускладнено",
    crit: "критичний удар послаблено",
    slow: "швидкість знижено",
    confusion: "цілі сплутано",
    "cooldown-pressure": "відсап подовжено",
    "next-attack-bonus": "наступну атаку посилено",
    counter: "контрудар готовий",
    "repeat-penalty": "повтор дії передбачено"
  };
  return labels[kind];
}

function extendGroupCombatLongestCooldown(
  actor: GroupCombatActorSnapshot,
  extension: number
): boolean {
  if (extension <= 0) {
    return false;
  }
  const cooldowns = Object.values(actor.cooldowns?.abilities ?? {});
  if (actor.cooldowns?.skill) {
    cooldowns.push(actor.cooldowns.skill);
  }
  const longest = cooldowns.sort((left, right) =>
    right.remainingTurns - left.remainingTurns || left.id.localeCompare(right.id)
  )[0];
  if (!longest) {
    return false;
  }
  longest.remainingTurns += extension;
  return true;
}

function resolveMonsterAbilityParticipantTargets(
  state: GroupCombatState,
  ability: MonsterAbilityDefinition
): GroupCombatActorSnapshot[] {
  const living = livingParticipants(state);
  if (ability.targetScopes.includes("all-enemies")) {
    return living;
  }
  if (ability.targetScopes.includes("lowest-hp-enemy")) {
    return living.length > 0
      ? [living.reduce((lowest, candidate) =>
          compareHpRatio(candidate, lowest, "rosterOrder") < 0 ? candidate : lowest
        )]
      : [];
  }
  const target = getGroupCombatEnemyFocusTarget(state);
  return target ? [target] : [];
}

function resolveMonsterAbilityEnemyTargets(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition
): GroupCombatEnemyState[] {
  if (ability.targetScopes.includes("all-allies")) {
    return livingEnemies(state);
  }
  if (ability.targetScopes.includes("lowest-hp-ally")) {
    const ally = lowestHpEnemyAlly(state, enemy.id);
    return [ally ?? enemy];
  }
  return [enemy];
}

function abilityNumber(
  ability: MonsterAbilityDefinition,
  key: keyof MonsterAbilityDefinition["parameters"]
): number {
  const value = ability.parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function monsterAbilityTargetDuration(ability: MonsterAbilityDefinition): number {
  return positiveInteger(abilityNumber(ability, "durationTargetActivations") || 1);
}

function monsterAbilityOwnDuration(ability: MonsterAbilityDefinition): number {
  return positiveInteger(abilityNumber(ability, "durationOwnActivations") || 1);
}

function rollGroupCombatEnemyAbilityDamage(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  target: GroupCombatActorSnapshot,
  ability: NonNullable<ReturnType<typeof findMonsterAbility>>
): number {
  const frozen = state.production?.canonicalV1.enemies.find(
    (candidate) => candidate.enemyId === enemy.id
  );
  const authored = !frozen && enemy.monsterId
    ? monsters.find((candidate) => candidate.id === enemy.monsterId)
    : null;
  const monster = frozen
    ? {
        ...groupCombatEnemyActorStats(state, enemy, enemy.level ?? target.level),
        dexterity: frozen.combatStats.dexterity,
        ...(frozen.combatStats.spellPower === undefined
          ? {}
          : { spellPower: frozen.combatStats.spellPower }),
        tags: [...frozen.combatStats.tags]
      }
    : authored
      ? deriveMonsterCombatStats(
          { ...authored, level: enemy.level ?? authored.level },
          enemy.order > 0
            ? {
                remortCount: state.production?.remort.sourceRemortCount ?? 0,
                remortPressureMode: "multi"
              }
            : {}
        )
      : null;
  if (!monster) {
    return Math.max(1, enemy.attack - target.defense);
  }
  const modifiedMonster = {
    ...monster,
    contextModifiers: groupCombatEnemyActorStats(
      state,
      enemy,
      enemy.level ?? monster.level
    ).contextModifiers!
  };
  let damage = rollMonsterSkillDamage(
    actorCombatStats(target),
    modifiedMonster,
    monsterAbilityAsCombatSkill(ability),
    new SeededRandomSource(
      `${state.deterministicSeed}:${state.turn}:${enemy.order}:${ability.id}:${target.rosterOrder}:damage`
    )
  );
  const plan = compileMonsterAbilityExecutionPlan({
    ability,
    state: { turn: state.turn } as CombatState,
    runtime: {
      ownActionCount: enemy.abilityOwnActionCount ?? 1,
      lastDirectHeroDamage: enemy.lastDirectParticipantDamage
    } as MonsterAbilityRuntimeStateV1
  });
  if (
    plan.directDamageModifiers.bonusMultiplierBelowHalfHp > 0 &&
    enemy.hp * 2 <= enemy.hpMax
  ) {
    damage = Math.floor(
      damage *
      (1 + plan.directDamageModifiers.bonusMultiplierBelowHalfHp)
    );
  }
  if (
    plan.directDamageModifiers.bonusMultiplierAgainstDebuffedTarget > 0 &&
    (
      activeAbilityEffects(
        state,
        "participant",
        target.characterId
      ).some((effect) => effect.polarity === "harmful") ||
      state.statuses.some((status) =>
        status.targetKind === "participant" &&
        status.targetId === target.characterId &&
        status.sourceEnemyId !== undefined
      )
    )
  ) {
    damage = Math.floor(
      damage *
      (1 + plan.directDamageModifiers.bonusMultiplierAgainstDebuffedTarget)
    );
  }
  return damage;
}

function canUseGroupCombatEnemyAbility(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  ability: MonsterAbilityDefinition
): boolean {
  if (
    ability.id === "monster.smoke-without-approval" ||
    ability.id === "monster.preapproved-bite" ||
    ability.id === "monster.ledger-charge" ||
    ability.id === "monster.ledger-audit"
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
  const recipe = compileMonsterAbilityRecipe(ability);
  return livingParticipants(state).length > 0 && (
    recipe.directDamage ||
    recipe.heroEffects.length > 0 ||
    recipe.monsterEffects.length > 0 ||
    Object.values(recipe.immediate).some(Boolean)
  );
}

function livingParticipants(state: GroupCombatState): GroupCombatActorSnapshot[] {
  return state.participants
    .filter(isActiveGroupCombatParticipant)
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
    targetKind: GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND[kind],
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
  const runtimeDamage = activeAbilityEffects(
    state,
    "participant",
    participant.characterId
  ).filter((effect) => effect.kind === "burn" || effect.kind === "bleed");
  if (burns.length === 0 && runtimeDamage.length === 0) {
    return;
  }
  let totalDamage = 0;
  let burnDamage = 0;
  let bleedDamage = 0;
  for (const status of burns) {
    const damage = Math.min(participant.hp, status.value);
    participant.hp -= damage;
    totalDamage += damage;
    burnDamage += damage;
    if (status.sourceEnemyId) {
      getEnemyContribution(state, status.sourceEnemyId).damage += damage;
    }
  }
  for (const effect of runtimeDamage) {
    const source = state.enemies.find(
      (enemy) => enemy.id === effect.sourceEnemyId
    );
    const damage = Math.min(
      participant.hp,
      Math.max(1, Math.floor((source?.attack ?? 1) * effect.value))
    );
    participant.hp -= damage;
    totalDamage += damage;
    if (effect.kind === "bleed") {
      bleedDamage += damage;
    } else {
      burnDamage += damage;
    }
    getEnemyContribution(state, effect.sourceEnemyId).damage += damage;
  }
  getContribution(state, participant.characterId).damageTaken += totalDamage;
  if (burnDamage > 0) {
    lines.push(`🔥 ${participant.name}: горіння, −${burnDamage} HP.`);
  }
  if (bleedDamage > 0) {
    lines.push(`🩸 ${participant.name}: кровотеча, −${bleedDamage} HP.`);
  }
}

function tickParticipantMonsterEffects(
  state: GroupCombatState,
  characterId: string
): void {
  state.statuses = state.statuses
    .map((status) =>
      status.targetKind === "participant" &&
      status.targetId === characterId &&
      (
        status.kind === "monster-accuracy-penalty" ||
        status.kind === "monster-burn" ||
        status.kind === "monster-incoming-damage"
      )
        ? { ...status, remainingTurns: status.remainingTurns - 1 }
        : status
    )
    .filter((status) => status.remainingTurns > 0);
  tickGroupCombatAbilityEffects(state, "participant", characterId);
}

function tickEnemyAbilityEffects(
  state: GroupCombatState,
  enemyId: string
): void {
  tickGroupCombatAbilityEffects(state, "enemy", enemyId);
}

function tickGroupCombatAbilityEffects(
  state: GroupCombatState,
  targetKind: "participant" | "enemy",
  targetId: string
): void {
  const expired: GroupCombatMonsterAbilityEffect[] = [];
  state.abilityEffects = (state.abilityEffects ?? []).flatMap((effect) => {
    let next = effect;
    if (
      targetKind === "participant" &&
      effect.targetKind === targetKind &&
      effect.targetId === targetId &&
      effect.remainingTargetActivations !== undefined
    ) {
      next = {
        ...next,
        remainingTargetActivations: Math.max(
          0,
          effect.remainingTargetActivations - 1
        )
      };
    }
    if (
      targetKind === "enemy" &&
      effect.sourceEnemyId === targetId &&
      effect.remainingSourceActivations !== undefined
    ) {
      next = {
        ...next,
        remainingSourceActivations: Math.max(
          0,
          effect.remainingSourceActivations - 1
        )
      };
    }
    if (
      next.remainingTargetActivations === 0 ||
      next.remainingSourceActivations === 0 ||
      next.charges === 0
    ) {
      expired.push(toExpiredGroupCombatAbilityEffect(next));
      return [];
    }
    return [next];
  });
  if (expired.length > 0) {
    state.expiredAbilityEffects = [
      ...(state.expiredAbilityEffects ?? []),
      ...expired.map(toExpiredGroupCombatAbilityEffect)
    ].slice(-6);
  }
}

function toExpiredGroupCombatAbilityEffect(
  effect: GroupCombatMonsterAbilityEffect
): GroupCombatMonsterAbilityEffect {
  const expired = { ...effect };
  if (expired.remainingTargetActivations === 0) {
    delete expired.remainingTargetActivations;
  }
  if (expired.remainingSourceActivations === 0) {
    delete expired.remainingSourceActivations;
  }
  if (expired.charges === 0) {
    delete expired.charges;
  }
  return expired;
}

function pruneExpiredGroupCombatAbilityEffects(state: GroupCombatState): void {
  const expired = (state.abilityEffects ?? []).filter((effect) =>
    effect.remainingTargetActivations === 0 ||
    effect.remainingSourceActivations === 0 ||
    effect.charges === 0
  );
  state.abilityEffects = (state.abilityEffects ?? []).filter((effect) =>
    effect.remainingTargetActivations !== 0 &&
    effect.remainingSourceActivations !== 0 &&
    effect.charges !== 0
  );
  if (expired.length > 0) {
    state.expiredAbilityEffects = [
      ...(state.expiredAbilityEffects ?? []),
      ...expired.map(toExpiredGroupCombatAbilityEffect)
    ].slice(-6);
  }
}

function activeAbilityEffects(
  state: GroupCombatState,
  targetKind: "participant" | "enemy",
  targetId: string,
  kind?: MonsterAbilityEffectKind
): GroupCombatMonsterAbilityEffect[] {
  return (state.abilityEffects ?? []).filter((effect) =>
    effect.targetKind === targetKind &&
    effect.targetId === targetId &&
    (kind === undefined || effect.kind === kind) &&
    effect.remainingSourceActivations !== 0 &&
    effect.remainingTargetActivations !== 0 &&
    effect.charges !== 0
  );
}

function multiplyAbilityEffectValues(
  state: GroupCombatState,
  targetKind: "participant" | "enemy",
  targetId: string,
  kind: MonsterAbilityEffectKind,
  identity: number
): number {
  return activeAbilityEffects(state, targetKind, targetId, kind)
    .reduce((product, effect) => product * effect.value, identity);
}

function consumeMarkMultiplier(
  state: GroupCombatState,
  characterId: string
): number {
  const marks = activeAbilityEffects(
    state,
    "participant",
    characterId,
    "mark"
  );
  let multiplier = 1;
  for (const mark of marks) {
    multiplier *= Math.max(1, mark.value);
    if (mark.charges !== undefined) {
      mark.charges = Math.max(0, mark.charges - 1);
    }
  }
  return multiplier;
}

function consumeNextAttackBonus(
  state: GroupCombatState,
  enemyId: string
): number {
  const effects = activeAbilityEffects(
    state,
    "enemy",
    enemyId,
    "next-attack-bonus"
  );
  let multiplier = 1;
  for (const effect of effects) {
    multiplier *= Math.max(1, effect.value);
    if (effect.charges !== undefined) {
      effect.charges = Math.max(0, effect.charges - 1);
    }
  }
  return multiplier;
}

function consumeRepeatedActionPenalty(
  state: GroupCombatState,
  characterId: string,
  actionKey?: GroupCombatActionKey
): number {
  const actor = state.participants.find(
    (candidate) => candidate.characterId === characterId
  );
  const effects = activeAbilityEffects(
    state,
    "participant",
    characterId,
    "repeat-penalty"
  );
  if (
    !actor?.lastActionKey ||
    actor.lastActionKey !== actionKey ||
    effects.length === 0
  ) {
    return 1;
  }
  let multiplier = 1;
  for (const effect of effects) {
    multiplier *= Math.max(0.1, 1 - effect.value / 100);
    if (effect.charges !== undefined) {
      effect.charges = Math.max(0, effect.charges - 1);
    }
  }
  return multiplier;
}

function applyGroupCombatReflectAndCounter(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  sourceCharacterId: string,
  reactionLines: string[]
): void {
  const actor = state.participants.find(
    (candidate) => candidate.characterId === sourceCharacterId
  );
  if (!actor || actor.hp <= 0) {
    return;
  }
  const retaliations = activeAbilityEffects(
    state,
    "enemy",
    enemy.id
  ).filter((effect) => effect.kind === "reflect" || effect.kind === "counter");
  for (const effect of retaliations) {
    const ability = findGroupCombatEnemyAbility(
      state,
      enemy,
      effect.sourceAbilityId
    );
    if (!ability) {
      continue;
    }
    const reaction = resolveMonsterLandedHitReaction({
      kind: effect.kind as "reflect" | "counter",
      effectValue: effect.value,
      monsterAttack: enemy.attack,
      sourceAbility: ability,
      rng: new SeededRandomSource(
        `${state.deterministicSeed}:${state.turn}:${enemy.id}:${sourceCharacterId}:${effect.id}:counter`
      )
    });
    const damage = Math.min(actor.hp, reaction.damage);
    actor.hp -= damage;
    getContribution(state, sourceCharacterId).damageTaken += damage;
    getEnemyContribution(state, enemy.id).damage += damage;
    if (reaction.consumeCharge && effect.charges !== undefined) {
      effect.charges = Math.max(0, effect.charges - 1);
    }
    if (damage > 0) {
      reactionLines.push(
        effect.kind === "reflect"
          ? `🪞 ${enemy.name}: відбиття в ${actor.name} — ${damage} шкоди.`
          : `↩️ ${enemy.name}: контрудар по ${actor.name} — ${damage} шкоди.`
      );
    }
  }
}

function applyGroupCombatConfusion(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  action: GroupCombatAction
): GroupCombatAction {
  const confusion = activeAbilityEffects(
    state,
    "participant",
    actor.characterId,
    "confusion"
  );
  if (
    confusion.length === 0 ||
    action.targetKind !== "enemy" ||
    (action.action !== "attack" &&
      action.action !== "class" &&
      action.action !== "race" &&
      action.action !== "gear")
  ) {
    return action;
  }
  const targets = livingEnemies(state);
  if (targets.length < 2) {
    return action;
  }
  const currentIndex = targets.findIndex((enemy) => enemy.id === action.targetId);
  const next = targets[(Math.max(0, currentIndex) + 1) % targets.length]!;
  return { ...action, targetId: next.id };
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

export function getGroupCombatEnemyFocusTarget(state: GroupCombatState): GroupCombatActorSnapshot | null {
  const living = state.participants.filter(isActiveGroupCombatParticipant);
  return living.sort((left, right) =>
    right.threat - left.threat ||
    left.rosterOrder - right.rosterOrder
  )[0] ?? null;
}

function recordGroupCombatTurnDamageForFocus(
  state: GroupCombatState,
  damageBeforeTurn: ReadonlyMap<string, number>
): void {
  for (const participant of state.participants) {
    const contribution = getContribution(state, participant.characterId);
    participant.threat = participant.fledAtTurn === undefined
      ? Math.max(0, contribution.damage - (damageBeforeTurn.get(participant.characterId) ?? 0))
      : 0;
  }
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
  const statusResistancePp = activeAbilityEffects(
    state,
    "enemy",
    enemy.id,
    "status-resistance"
  ).reduce((sum, effect) => sum + effect.value, 0);
  if (
    statusResistancePp > 0 &&
    new SeededRandomSource(
      `${state.deterministicSeed}:${state.turn}:${actor.characterId}:${enemy.id}:status-resistance`
    ).nextFloat() < Math.min(0.95, statusResistancePp / 100)
  ) {
    return;
  }
  state.statuses.push({
    id: `${state.turn}:${actor.characterId}:${enemy.id}:bleed`,
    kind: "bleed",
    sourceCharacterId: actor.characterId,
    targetKind: GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND.bleed,
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
    targetKind: GROUP_COMBAT_STATUS_TARGET_KIND_BY_KIND[kind],
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

function canUseGroupCombatItem(
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  itemId: GroupCombatCommittedConsumable["itemId"]
): boolean {
  const effect = findConsumableManatkaUse(itemId)?.useEffect;
  if (effect?.kind === "restore-mana") return actor.mana < actor.manaMax;
  if (effect?.kind === "restore-both" || effect?.kind === "random-resource") return actor.hp < actor.hpMax || actor.mana < actor.manaMax;
  if (effect?.kind === "heal-hp-below-percent") return actor.hp <= Math.floor(actor.hpMax * effect.thresholdPercent / 100) && actor.hp < actor.hpMax;
  if (effect?.kind === "paired-heal") {
    return actor.hp < actor.hpMax || livingParticipants(state).some(
      (target) => target.characterId !== actor.characterId && target.hp < target.hpMax
    );
  }
  if (effect?.kind === "party-heal") return livingParticipants(state).some((target) => target.hp < target.hpMax);
  if (effect?.kind === "cleanse-negative") return hasParticipantNegativeEffect(state, actor.characterId);
  if (effect?.kind === "reduce-cooldowns") return getActiveGroupCombatCooldowns(actor).length > 0;
  if (effect?.kind === "critical-damage" || effect?.kind === "guard-response" || effect?.kind === "evade-response") return livingEnemies(state).length > 0;
  return itemId === "item.field-kit"
    ? actor.hp < Math.ceil(actor.hpMax * 0.93)
    : actor.hp < actor.hpMax;
}

function getGroupCombatResponseItemEffect(
  itemId: GroupCombatCommittedConsumable["itemId"]
): Pick<GroupCombatPendingResponseItem, "kind" | "percent"> | null {
  const effect = findConsumableManatkaUse(itemId)?.useEffect;
  if (effect?.kind === "evade-response") {
    return { kind: "evade", percent: 100 };
  }
  if (effect?.kind === "guard-response") {
    return { kind: "guard", percent: Math.max(0, Math.min(100, Math.floor(effect.reductionPercent))) };
  }
  return null;
}

function decrementGroupCombatItemQuantity(
  actor: GroupCombatActorSnapshot,
  itemId: GroupCombatCommittedConsumable["itemId"]
): void {
  actor.combatItemQuantities[itemId] = (actor.combatItemQuantities[itemId] ?? 0) - 1;
  if ((actor.combatItemQuantities[itemId] ?? 0) <= 0) {
    delete actor.combatItemQuantities[itemId];
  }
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
  state: GroupCombatState,
  actor: GroupCombatActorSnapshot,
  itemId: GroupCombatCommittedConsumable["itemId"]
): { healing: number; manaRestored: number; damage: number; line: string } {
  const definition = findConsumableManatkaUse(itemId);
  const effect = definition?.useEffect.kind === "random-resource"
    ? resolveGroupCombatRandomResourceEffect(
        definition.useEffect,
        actor,
        new SeededRandomSource(`${state.deterministicSeed}:${state.turn}:${actor.characterId}:${itemId}`)
      )
    : definition?.useEffect;
  if (effect?.kind === "restore-mana") {
    const before = actor.mana;
    actor.mana = Math.min(actor.manaMax, actor.mana + effect.amount);
    const manaRestored = actor.mana - before;
    return { healing: 0, manaRestored, damage: 0, line: `+${manaRestored} мани` };
  }
  if (effect?.kind === "restore-both") {
    const healing = healParticipant(actor, effect.hpAmount);
    const before = actor.mana;
    actor.mana = Math.min(actor.manaMax, actor.mana + effect.manaAmount);
    const manaRestored = actor.mana - before;
    return { healing, manaRestored, damage: 0, line: `+${healing} HP і +${manaRestored} мани` };
  }
  if (effect?.kind === "paired-heal") {
    const selfHealing = healParticipant(actor, effect.amount);
    const ally = livingParticipants(state)
      .filter((target) => target.characterId !== actor.characterId)
      .sort((left, right) => left.hp / left.hpMax - right.hp / right.hpMax || left.rosterOrder - right.rosterOrder)[0];
    const allyHealing = ally ? healParticipant(ally, effect.amount) : 0;
    return { healing: selfHealing + allyHealing, manaRestored: 0, damage: 0, line: `+${selfHealing} HP собі й +${allyHealing} HP союзникові` };
  }
  if (effect?.kind === "party-heal") {
    const healing = livingParticipants(state).reduce((sum, target) => sum + healParticipant(target, effect.amount), 0);
    return { healing, manaRestored: 0, damage: 0, line: `+${healing} HP ватагою` };
  }
  if (effect?.kind === "guard-response" || effect?.kind === "evade-response") {
    const percent = effect.kind === "evade-response" ? 100 : effect.reductionPercent;
    addProtectionStatus(state, actor.characterId, actor.characterId, "response-mitigation", GROUP_COMBAT_PERCENT_GUARD_SENTINEL + percent);
    return { healing: 0, manaRestored: 0, damage: 0, line: effect.kind === "evade-response" ? "найближча відповідь не влучить" : `найближчу відповідь послаблено на ${percent}%` };
  }
  if (effect?.kind === "critical-damage") {
    const target = livingEnemies(state)[0]!;
    const damage = Math.min(target.hp, Math.max(0, Math.floor(effect.amount)));
    target.hp -= damage;
    return { healing: 0, manaRestored: 0, damage, line: `${damage} критичної шкоди` };
  }
  if (effect?.kind === "reduce-cooldowns") {
    reduceGroupCombatCooldowns(actor, effect.turns);
    return { healing: 0, manaRestored: 0, damage: 0, line: `відкати скорочено на ${effect.turns} хід` };
  }
  if (effect?.kind === "cleanse-negative") {
    const removed = cleanseParticipantNegativeEffects(state, actor.characterId, effect.count);
    return { healing: 0, manaRestored: 0, damage: 0, line: `знято негативних ефектів: ${removed}` };
  }
  if (itemId === "item.field-kit") {
    const targetHp = Math.ceil(actor.hpMax * 0.93);
    const healing = healParticipant(actor, Math.max(0, targetHp - actor.hp));
    return { healing, manaRestored: 0, damage: 0, line: `+${healing} HP` };
  }
  const amount = effect?.kind === "heal-hp" || effect?.kind === "heal-hp-below-percent"
    ? effect.amount
    : itemId === "item.dense-bandage"
      ? 42
      : 7;
  const healing = healParticipant(actor, amount);
  return { healing, manaRestored: 0, damage: 0, line: `+${healing} HP` };
}

function resolveGroupCombatRandomResourceEffect(
  effect: Extract<NonNullable<ReturnType<typeof findConsumableManatkaUse>>["useEffect"], { kind: "random-resource" }>,
  actor: GroupCombatActorSnapshot,
  rng: SeededRandomSource
) {
  const candidates = [] as Array<
    | { kind: "heal-hp"; amount: number }
    | { kind: "restore-mana"; amount: number }
    | { kind: "restore-both"; hpAmount: number; manaAmount: number }
  >;
  if (actor.hp < actor.hpMax) candidates.push({ kind: "heal-hp", amount: effect.amount });
  if (actor.mana < actor.manaMax) candidates.push({ kind: "restore-mana", amount: effect.amount });
  if (effect.bothAmount !== undefined) candidates.push({ kind: "restore-both", hpAmount: effect.bothAmount, manaAmount: effect.bothAmount });
  return candidates[rng.nextInt(0, candidates.length - 1)] ?? { kind: "heal-hp" as const, amount: effect.amount };
}

function hasParticipantNegativeEffect(state: GroupCombatState, characterId: string): boolean {
  return state.statuses.some((status) => status.targetKind === "participant" && status.targetId === characterId && status.sourceEnemyId !== undefined);
}

function cleanseParticipantNegativeEffects(state: GroupCombatState, characterId: string, count: number): number {
  let remaining = Math.max(0, Math.floor(count));
  const before = state.statuses.length;
  state.statuses = state.statuses.filter((status) => {
    const harmful = status.targetKind === "participant" && status.targetId === characterId && status.sourceEnemyId !== undefined;
    if (harmful && remaining > 0) {
      remaining -= 1;
      return false;
    }
    return true;
  });
  return before - state.statuses.length;
}

function reduceGroupCombatCooldowns(actor: GroupCombatActorSnapshot, turns: number): void {
  if (!actor.cooldowns) return;
  const resources = actorResourceState(actor);
  for (let index = 0; index < Math.max(0, Math.floor(turns)); index += 1) {
    const ticked = tickActorCooldowns(resources);
    resources.cooldowns = ticked.cooldowns;
  }
  applyActorResourceState(actor, resources);
}

function healParticipant(target: GroupCombatActorSnapshot, amount: number): number {
  if (!isActiveGroupCombatParticipant(target)) {
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

export function isActiveGroupCombatParticipant(
  participant: Pick<GroupCombatActorSnapshot, "hp" | "fledAtTurn">
): boolean {
  return participant.hp > 0 && participant.fledAtTurn === undefined;
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
  monsterBarkIds: string[] = [],
  enemyFocusCharacterId: string | null = null
): GroupCombatResolution {
  state.recap = appendRecap(state, lines, monsterBarkIds, enemyFocusCharacterId);
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
      ? buildLeftPassageLossXpTotal(state)
      : 0;
  const goldTotal = state.status === "won" ? production.rewards.winGoldTotal : 0;
  return {
    xp: splitNeutral(xpTotal, orderedEligible.length, index),
    gold: splitNeutral(goldTotal, orderedEligible.length, index),
    items: itemRewards.map((item) => ({ ...item }))
  };
}

function buildLeftPassageLossXpTotal(state: GroupCombatState): number {
  const production = state.production;
  if (!production || production.rewards.lossPolicy !== GROUP_COMBAT_LOSS_REWARD_POLICY) {
    return production?.rewards.lossXpTotal ?? 0;
  }
  const defeatedEnemyIds = new Set(
    state.enemies.filter((enemy) => enemy.hp <= 0).map((enemy) => enemy.id)
  );
  if (defeatedEnemyIds.size === 0) {
    return production.rewards.lossXpTotal;
  }
  const characterLevel = Math.max(
    1,
    ...state.participants.map((participant) => Math.max(1, Math.floor(participant.level)))
  );
  const defeatedEnemyXp = production.canonicalV1.enemies.reduce((sum, enemy) => {
    if (!defeatedEnemyIds.has(enemy.enemyId)) {
      return sum;
    }
    const normalXp = buildBaselinePersistentFightWinXp({
      characterLevel,
      baseMonsterLevel: Math.max(1, Math.floor(enemy.baseRewardLevel)),
      effectiveMonsterLevel: Math.max(1, Math.floor(enemy.level))
    });
    return sum + Math.max(1, Math.ceil(normalXp / 2));
  }, 0);
  return production.rewards.lossXpTotal + defeatedEnemyXp;
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
        ? findGroupCombatProductionV1Monster(enemy.monsterId)
        : null;
      if (!monster) {
        throw new Error(`Production loot snapshot requires authored monster ${enemy.monsterId ?? enemy.id}.`);
      }
      return {
        enemyId: enemy.id,
        monsterId: monster.id,
        order: enemy.order,
        participantRolls: participants.map((participant) => {
          const candidates = getGroupCombatProductionV1LootCandidates({
            monsterId: monster.id,
            participantLevel: participant.level,
            classId: participant.classId,
            raceId: participant.raceId
          });
          return buildGroupCombatLootVersionOneRoll({
            state,
            enemy,
            participant,
            candidates
          });
        })
      };
    })
  };
}

function buildGroupCombatLootVersionOneRoll(input: {
  state: GroupCombatState;
  enemy: GroupCombatEnemyState;
  participant: GroupCombatActorSnapshot;
  candidates: readonly GroupCombatProductionV1LootCandidate[];
}): GroupCombatLootVersionOneSnapshot["enemies"][number]["participantRolls"][number] {
  return {
    characterId: input.participant.characterId,
    items: resolveGroupCombatLootVersionOneRoll({
      state: input.state,
      enemy: input.enemy,
      participant: input.participant,
      candidates: input.candidates
    })
  };
}

export function resolveGroupCombatLootVersionOneRoll(input: {
  state: GroupCombatState;
  enemy: GroupCombatEnemyState;
  participant: GroupCombatActorSnapshot;
  candidates?: readonly GroupCombatProductionV1LootCandidate[];
}): Array<{ itemId: string; quantity: number }> {
  const rewards = new Map<string, GroupCombatRewards["items"]>();
  const monsterId = input.enemy.monsterId ?? input.enemy.id;
  const candidates = input.candidates ?? getGroupCombatProductionV1LootCandidates({
    monsterId,
    participantLevel: input.participant.level,
    classId: input.participant.classId,
    raceId: input.participant.raceId
  });
  const rng = createGroupCombatLootVersionOneRandom(
    input.state,
    input.enemy,
    input.participant,
    monsterId
  );
  if (candidates.length > 0) {
    const dropChance = getGroupCombatLootVersionOneDropChance(
      input.participant.stats.luck
    ) * getLeftPassageEnemyLootDropChanceMultiplier({
      effectiveEnemyLevel: input.enemy.level ?? 1,
      participantLevel: input.participant.level
    });
    const dropped = rng.nextFloat() < dropChance;
    if (dropped) {
      const rarity = rollGroupCombatLootVersionOneRarity(
        rng,
        input.participant.stats.luck
      );
      const selection = selectGroupCombatLootVersionOneCandidate(
        selectGroupCombatLootVersionOneCandidates(candidates, rarity),
        rng
      );
      if (selection) {
        addGroupCombatLootReward(
          rewards,
          input.participant.characterId,
          selection.itemId,
          1
        );
      }
    }
  }

  const bandageQuantity = rollGroupCombatLootVersionOneBandageQuantity(
    rng,
    input.participant.stats.luck
  );
  if (bandageQuantity > 0) {
    const replacement = rng.nextFloat() <
      getGroupCombatLootVersionOneIskrokaminChance(input.participant.stats.luck);
    addGroupCombatLootReward(
      rewards,
      input.participant.characterId,
      replacement
        ? "item.iskrokamin"
        : "item.responsible-panic-bandage",
      replacement ? Math.max(1, Math.ceil(bandageQuantity / 2)) : bandageQuantity
    );
  }
  return rewards.get(input.participant.characterId) ?? [];
}

function createGroupCombatLootVersionOneRandom(
  state: GroupCombatState,
  enemy: GroupCombatEnemyState,
  participant: GroupCombatActorSnapshot,
  monsterId: string
): SeededRandomSource {
  return new SeededRandomSource(
    `${state.production!.encounterSeed}:${state.partySessionId}:loot:${enemy.order}:${monsterId}:${participant.characterId}`
  );
}

const GROUP_COMBAT_LOOT_V1_RARITIES: GroupCombatProductionV1Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary"
];

function rollGroupCombatLootVersionOneRarity(
  rng: SeededRandomSource,
  luck: number
): GroupCombatProductionV1Rarity {
  const roll = Math.min(0.999_999, Math.max(0, rng.nextFloat()));
  const base: GroupCombatProductionV1Rarity = roll < 0.7
    ? "common"
    : roll < 0.92
      ? "uncommon"
      : roll < 0.99
        ? "rare"
        : "epic";
  if (
    base === "epic" ||
    rng.nextFloat() >= getGroupCombatLootVersionOneLuckBonus(luck)
  ) {
    return base;
  }
  return GROUP_COMBAT_LOOT_V1_RARITIES[
    Math.min(
      GROUP_COMBAT_LOOT_V1_RARITIES.indexOf(base) + 1,
      GROUP_COMBAT_LOOT_V1_RARITIES.length - 1
    )
  ] ?? base;
}

export function selectGroupCombatLootVersionOneCandidates(
  candidates: readonly GroupCombatProductionV1LootCandidate[],
  rarity: GroupCombatProductionV1Rarity
): GroupCombatProductionV1LootCandidate[] {
  const targetIndex = GROUP_COMBAT_LOOT_V1_RARITIES.indexOf(rarity);
  for (let index = targetIndex; index >= 0; index -= 1) {
    const matching = candidates.filter(
      (candidate) => candidate.rarity === GROUP_COMBAT_LOOT_V1_RARITIES[index]
    );
    if (matching.length > 0) {
      return matching;
    }
  }
  for (
    let index = targetIndex + 1;
    index < GROUP_COMBAT_LOOT_V1_RARITIES.length;
    index += 1
  ) {
    const matching = candidates.filter(
      (candidate) => candidate.rarity === GROUP_COMBAT_LOOT_V1_RARITIES[index]
    );
    if (matching.length > 0) {
      return matching;
    }
  }
  return [...candidates];
}

export function selectGroupCombatLootVersionOneCandidate(
  candidates: readonly GroupCombatProductionV1LootCandidate[],
  rng: Pick<SeededRandomSource, "nextFloat">
): GroupCombatProductionV1LootCandidate | null {
  const totalWeight = candidates.reduce(
    (sum, candidate) => sum + Math.max(0, candidate.weight),
    0
  );
  if (totalWeight <= 0) {
    return null;
  }
  const cursor = rng.nextFloat() * totalWeight;
  let weightBefore = 0;
  for (const candidate of candidates) {
    const weight = Math.max(0, candidate.weight);
    if (cursor < weightBefore + weight) {
      return candidate;
    }
    weightBefore += weight;
  }
  return candidates[candidates.length - 1] ?? null;
}

function rollGroupCombatLootVersionOneBandageQuantity(
  rng: SeededRandomSource,
  luck: number
): number {
  const roll = Math.min(0.999_999, Math.max(0, rng.nextFloat()));
  const quantity = roll < 0.5
    ? 0
    : roll < 0.75
      ? 1
      : roll < 0.88
        ? 2
        : roll < 0.96
          ? 3
          : roll < 0.99
            ? 4
            : 5;
  const upgradeChance = getGroupCombatLootVersionOneLuckBonus(luck);
  if (quantity >= 5 || upgradeChance <= 0) {
    return quantity;
  }
  return rng.nextFloat() < upgradeChance ? quantity + 1 : quantity;
}

function getGroupCombatLootVersionOneDropChance(luck: number): number {
  return Math.min(
    0.45,
    Math.max(0.25, 0.35 + getGroupCombatLootVersionOneLuckBonus(luck))
  );
}

function getGroupCombatLootVersionOneLuckBonus(luck: number): number {
  return Math.min(0.1, Math.max(0, (Math.floor(luck) - 6) * 0.01));
}

function getGroupCombatLootVersionOneIskrokaminChance(luck: number): number {
  return Math.min(
    0.06,
    Math.max(
      0.04,
      0.04 + getGroupCombatLootVersionOneLuckBonus(luck) * 0.2
    )
  );
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
  monsterBarkIds: string[] = [],
  enemyFocusCharacterId: string | null = null
): GroupCombatRecapEntry[] {
  const effects = listGroupCombatVisibleEffects(state);
  const compactEffects = compactGroupCombatVisibleEffects(state, effects);
  const enemyFocusIndex = enemyFocusCharacterId === null
    ? -1
    : state.participants.findIndex(
        (participant) => participant.characterId === enemyFocusCharacterId
      );
  const entry: GroupCombatRecapEntry = {
    turn: state.turn,
    lines: lines.slice(0, 13),
    ...(monsterBarkIds.length > 0 ? { monsterBarkIds: monsterBarkIds.slice(0, 6) } : {}),
    snapshot: {
      ...(enemyFocusIndex < 0 ? {} : { f: enemyFocusIndex }),
      p: state.participants.map((participant) => {
        const cooldowns = getActiveGroupCombatCooldowns(participant);
        const itemCooldowns = Object.values(participant.combatItems?.cooldowns ?? {})
          .filter((cooldown) => cooldown.remainingTurns > 0)
          .map((cooldown) => ({
            itemId: cooldown.itemId,
            remainingTurns: cooldown.remainingTurns
          }))
          .sort((left, right) => left.itemId.localeCompare(right.itemId));
        return [
          participant.hp,
          participant.mana,
          cooldowns.length > 0
            ? cooldowns.map((cooldown): [string, number] => [
                cooldown.id,
                cooldown.remainingTurns
              ])
            : null,
          itemCooldowns.length > 0
            ? itemCooldowns.map((cooldown): [string, number] => [
                cooldown.itemId,
                cooldown.remainingTurns
              ])
            : null,
          participant.fleeAttempts ?? null,
          participant.fledAtTurn ?? null
        ];
      }),
      e: state.enemies.map((enemy) => {
        const cooldowns = Object.values(enemy.abilityCooldowns ?? {})
          .filter((cooldown) => cooldown.remainingTurns > 0)
          .map((cooldown) => ({ id: cooldown.id, remainingTurns: cooldown.remainingTurns }))
          .sort((left, right) => left.id.localeCompare(right.id));
        return [
          enemy.hp,
          cooldowns.length > 0
            ? cooldowns.map((cooldown): [string, number] => [
                cooldown.id,
                cooldown.remainingTurns
              ])
            : null,
          enemy.shield?.points ?? null
        ];
      }),
      ...(compactEffects.length > 0
        ? { x: encodeGroupCombatCompactEffects(compactEffects) }
        : {})
    }
  };
  return [...state.recap, entry].slice(-GROUP_COMBAT_RECAP_LIMIT);
}

function compactGroupCombatVisibleEffects(
  state: GroupCombatState,
  effects: NonNullable<GroupCombatRecapSnapshot["effects"]>
): Array<[
  GroupCombatCompactPresentedEffectKind,
  "p" | "e",
  number,
  number
]> {
  const grouped = new Map<string, [
    GroupCombatCompactPresentedEffectKind,
    "p" | "e",
    number,
    number
  ]>();
  for (const effect of effects) {
    const compactKind = GROUP_COMBAT_COMPACT_EFFECT_KIND_BY_KIND[effect.kind];
    const compactTargetKind = effect.targetKind === "participant" ? "p" : "e";
    const targetIndex = effect.targetKind === "participant"
      ? state.participants.findIndex((participant) => participant.characterId === effect.targetId)
      : state.enemies.findIndex((enemy) => enemy.id === effect.targetId);
    if (targetIndex < 0) {
      continue;
    }
    const key = `${compactKind}\0${compactTargetKind}\0${effect.remainingTurns}`;
    const current = grouped.get(key);
    const targetMask = 1 << targetIndex;
    grouped.set(key, current
      ? [current[0], current[1], current[2] | targetMask, current[3]]
      : [compactKind, compactTargetKind, targetMask, effect.remainingTurns]);
  }
  return [...grouped.values()].sort(
    (left, right) => packGroupCombatCompactEffect(left) - packGroupCombatCompactEffect(right)
  );
}

function encodeGroupCombatCompactEffects(
  effects: ReturnType<typeof compactGroupCombatVisibleEffects>
): string {
  const bytes = effects.flatMap(([kind, targetKind, targetMask, remainingTurns]) => {
    const packed = packGroupCombatCompactEffect([
      kind,
      targetKind,
      targetMask,
      remainingTurns
    ]);
    return [(packed >> 8) & 0xff, packed & 0xff];
  });
  return Buffer.from(bytes).toString("base64url");
}

export type GroupCombatPackedEffect = [
  kind: GroupCombatPresentedEffectKind,
  targetKind: "participant" | "enemy",
  targetMask: number,
  remainingTurns: number
];

function packGroupCombatCompactEffect(
  effect: [GroupCombatCompactPresentedEffectKind, "p" | "e", number, number]
): number {
  const kinds = Object.values(GROUP_COMBAT_COMPACT_EFFECT_KIND_BY_KIND);
  const [kind, targetKind, targetMask, remainingTurns] = effect;
  const kindIndex = kinds.indexOf(kind);
  return (kindIndex << 11) |
    ((targetKind === "e" ? 1 : 0) << 10) |
    (targetMask << 4) |
    remainingTurns;
}

export function decodeGroupCombatPackedEffects(effects: string): GroupCombatPackedEffect[] {
  if (!/^[A-Za-z0-9_-]+$/.test(effects)) {
    throw new Error("Packed GroupCombat effects are not base64url.");
  }
  const bytes = Buffer.from(effects, "base64url");
  if (bytes.toString("base64url") !== effects || bytes.length === 0 || bytes.length % 2 !== 0) {
    throw new Error("Packed GroupCombat effects are truncated or non-canonical.");
  }
  const compactKinds = Object.values(GROUP_COMBAT_COMPACT_EFFECT_KIND_BY_KIND);
  const kindEntries = Object.entries(GROUP_COMBAT_COMPACT_EFFECT_KIND_BY_KIND) as Array<[
    GroupCombatPresentedEffectKind,
    GroupCombatCompactPresentedEffectKind
  ]>;
  const decoded: GroupCombatPackedEffect[] = [];
  const seenGroupKeys = new Set<string>();
  const seenMasksByKindAndSide = new Map<string, number>();
  let previousPacked = -1;
  for (let index = 0; index < bytes.length / 2; index += 1) {
    const packed = (bytes[index * 2]! << 8) | bytes[index * 2 + 1]!;
    if (packed <= previousPacked) {
      throw new Error("Packed GroupCombat effects are not deterministically ordered.");
    }
    previousPacked = packed;
    const kindIndex = (packed >> 11) & 0x1f;
    const compactKind = compactKinds[kindIndex];
    const kind = kindEntries.find(([, candidate]) => candidate === compactKind)?.[0];
    const targetKind = (packed & 0x400) !== 0 ? "enemy" : "participant";
    const targetMask = (packed >> 4) & 0x3f;
    const remainingTurns = packed & 0x0f;
    if (!kind) {
      throw new Error("Packed GroupCombat effect kind is unknown.");
    }
    assertGroupCombatPresentedEffectTargetSide(kind, targetKind);
    if (targetMask === 0) {
      throw new Error("Packed GroupCombat effect target mask is empty.");
    }
    if (remainingTurns < 1 || remainingTurns > 13) {
      throw new Error("Packed GroupCombat effect duration is invalid.");
    }
    const semanticKey = `${kind}\0${targetKind}`;
    const groupKey = `${semanticKey}\0${remainingTurns}`;
    if (seenGroupKeys.has(groupKey)) {
      throw new Error("Packed GroupCombat effect groups are not canonical.");
    }
    const seenMask = seenMasksByKindAndSide.get(semanticKey) ?? 0;
    if ((seenMask & targetMask) !== 0) {
      throw new Error("Packed GroupCombat effect targets overlap.");
    }
    seenGroupKeys.add(groupKey);
    seenMasksByKindAndSide.set(semanticKey, seenMask | targetMask);
    decoded.push([kind, targetKind, targetMask, remainingTurns]);
  }
  return decoded;
}

export function assertGroupCombatPackedEffectRoster(
  effects: string,
  state: {
    participants: Array<{ characterId: string }>;
    enemies: Array<{ id: string }>;
  }
): void {
  for (const [, targetKind, targetMask] of decodeGroupCombatPackedEffects(effects)) {
    const rosterSize = targetKind === "participant"
      ? state.participants.length
      : state.enemies.length;
    const allowedMask = (1 << rosterSize) - 1;
    if (rosterSize <= 0 || (targetMask & ~allowedMask) !== 0) {
      throw new Error("Packed GroupCombat effect target is outside the frozen roster.");
    }
  }
}

function expandGroupCombatPackedEffects(
  effects: string,
  state: {
    participants: Array<{ characterId: string }>;
    enemies: Array<{ id: string }>;
  } | undefined
): NonNullable<GroupCombatRecapSnapshot["effects"]> {
  if (!state) {
    throw new Error("Packed GroupCombat effects require the frozen roster.");
  }
  assertGroupCombatPackedEffectRoster(effects, state);
  return decodeGroupCombatPackedEffects(effects).flatMap(([
    kind,
    targetKind,
    targetMask,
    remainingTurns
  ]) => {
    const targets = targetKind === "participant" ? state.participants : state.enemies;
    return targets.flatMap((target, index) => (targetMask & (1 << index)) !== 0
      ? [{
          kind,
          targetKind,
          targetId: "characterId" in target ? target.characterId : target.id,
          remainingTurns
        }]
      : []);
  });
}

export function listGroupCombatVisibleEffects(
  state: GroupCombatState
): NonNullable<GroupCombatRecapSnapshot["effects"]> {
  const statuses = (state.statuses ?? [])
    .filter((status) => status.remainingTurns > 0)
    .map((status) => ({
      kind: status.kind,
      targetKind: status.targetKind,
      targetId: status.targetId,
      remainingTurns: status.remainingTurns
    }));
  const authoredEffects: NonNullable<GroupCombatRecapSnapshot["effects"]> = [];
  for (const effect of state.abilityEffects ?? []) {
    const activationDurations = [
      effect.remainingTargetActivations,
      effect.remainingSourceActivations
    ].filter((remaining): remaining is number => remaining !== undefined);
    const remainingTurns = activationDurations.length > 0
      ? Math.min(...activationDurations)
      : undefined;
    if (!remainingTurns || activationDurations.some((remaining) => remaining <= 0) || effect.charges === 0) {
      continue;
    }
    authoredEffects.push({
      kind: effect.kind,
      targetKind: effect.targetKind,
      targetId: effect.targetId,
      remainingTurns
    });
  }
  const visibleByTargetAndKind = new Map<
    string,
    NonNullable<GroupCombatRecapSnapshot["effects"]>[number]
  >();
  for (const effect of [...statuses, ...authoredEffects]) {
    const key = `${effect.kind}\0${effect.targetKind}\0${effect.targetId}`;
    const current = visibleByTargetAndKind.get(key);
    if (!current || effect.remainingTurns > current.remainingTurns) {
      visibleByTargetAndKind.set(key, effect);
    }
  }
  return [...visibleByTargetAndKind.values()];
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
const GROUP_COMBAT_MEDICAL_ITEM_PRESENTATIONS: Record<string, { label: string }> = {
  "item.responsible-panic-bandage": { label: "🩹 Бинт відповідальної паніки" },
  "item.dense-bandage": { label: "🩹 Щільний бинт" },
  "item.field-kit": { label: "⚕️ Польова аптечка" }
};

export function getGroupCombatItemPresentation(itemId: string): { label: string } | undefined {
  const medical = GROUP_COMBAT_MEDICAL_ITEM_PRESENTATIONS[itemId];
  if (medical) {
    return medical;
  }
  const definition = findConsumableManatkaUse(itemId);
  return definition ? { label: `${definition.icon} ${definition.name}` } : undefined;
}
