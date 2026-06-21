import type { CharacterStats } from "../characters/starterStats";
import {
  cloneCombatAnalyticsState,
  type CombatAnalyticsStateV1
} from "./combatBalanceAnalytics";
import type { CombatBarkStateV1 } from "./combatBarks";
import {
  cloneMonsterAbilityRuntimeState,
  createMonsterAbilityRuntime,
  type MonsterAbilityRuntimeStateV1
} from "./monsterAbilityRuntime";
import type { MonsterContextSnapshotV1 } from "./monsterContext";

export type CombatStatus = "active" | "won" | "lost" | "fled" | "expired";
export type CombatActionType = "attack" | "defend" | "skill" | "flee" | "skip";
export type PlayerCombatActionType = Exclude<CombatActionType, "skip">;
export type CombatDamageKind = "physical" | "spell" | "social" | "trick";
export type CombatTimeoutMode = "auto-attack" | "skip";
export type CombatTurnOutcome =
  | "hit"
  | "critical-hit"
  | "miss"
  | "defended"
  | "not-enough-mana"
  | "skill-on-cooldown"
  | "inactive"
  | "fled"
  | "flee-failed"
  | "won"
  | "lost";

export interface CombatActorStats extends CharacterStats {
  level: number;
  hpMax: number;
  manaMax: number;
  classId?: string;
  armor?: number;
  resist?: number;
  weaponDamage?: number;
  spellPower?: number;
}

export interface MonsterCombatStats {
  monsterId: string;
  name?: string;
  level: number;
  hpMax: number;
  attack: number;
  armor: number;
  resist: number;
  dexterity: number;
  classId?: string;
  className?: string;
  raceId?: string;
  raceName?: string;
  title?: string;
  spellPower?: number;
  copiedEquipment?: CombatCopiedEquipment[];
  debugTrace?: CombatDebugTrace;
  contextModifiers?: CombatContextModifiers;
  tags: string[];
}

export interface CombatCopiedEquipment {
  sourceItemId: string;
  name: string;
  slot: string;
  effectKeys: string[];
}

export interface CombatDebugTrace {
  spawnMode?: string;
  source?: "target" | "random-build" | "champion-fallback";
  championPeriod?: string;
  championName?: string;
  copiedEquipmentCount?: number;
  appliedEffectKeys?: string[];
  legalAbilityIds?: string[];
  chosenAbilityId?: string;
  lineId?: string;
  lineCategory?: string;
  interventionKind?: "help" | "none" | "hinder";
  interventionSourceKey?: string;
  baseMonsterLevel?: number;
  effectiveMonsterLevel?: number;
  contextRulesVersion?: string;
  contextTraitIds?: string[];
  contextBranchIds?: string[];
  contextCueId?: string;
  timeoutMode?: CombatTimeoutMode;
}

export interface CombatContextModifiers {
  outgoingDamageMultiplier: number;
  incomingDamageMultiplier: number;
  accuracyDeltaPp: number;
  evasionDeltaPp: number;
  abilityWeightDelta: number;
  signatureCooldownDelta: number;
  flatArmorDelta: number;
  flatResistDelta: number;
  flatDexterityDelta: number;
}

export interface CombatState {
  id?: string;
  source?: "normal" | "yeger" | "adventure" | "training";
  originLocationId?: string;
  completedAt?: string;
  turnExpiresAt?: string;
  message?: CombatMessageReference;
  timeout?: CombatTimeoutState;
  turn: number;
  status: CombatStatus;
  hero: {
    hp: number;
    hpMax: number;
    mana: number;
    manaMax: number;
  };
  monster: {
    id: string;
    name?: string;
    level?: number;
    hp: number;
    hpMax: number;
    attack?: number;
    armor?: number;
    resist?: number;
    dexterity?: number;
    classId?: string;
    className?: string;
    raceId?: string;
    raceName?: string;
    title?: string;
    spellPower?: number;
    copiedEquipment?: CombatCopiedEquipment[];
    debugTrace?: CombatDebugTrace;
    contextModifiers?: CombatContextModifiers;
  };
  cooldowns?: {
    abilities?: Record<string, {
      id: string;
      remainingTurns: number;
    }>;
    /**
     * Legacy mirror kept so old stored rows and older tests/cards remain readable.
     * New combat logic reads `abilities` first and normalizes this field by ability id.
     */
    skill?: {
      id: string;
      remainingTurns: number;
    };
  };
  guard?: CombatGuardState;
  context?: MonsterContextSnapshotV1;
  barks?: CombatBarkStateV1;
  analytics?: CombatAnalyticsStateV1;
  monsterRuntime?: MonsterAbilityRuntimeStateV1;
  lastTurn?: CombatTurnSummary;
}

export interface CombatMessageReference {
  chatId: string;
  messageId: number;
}

export interface CombatTimeoutState {
  consecutiveMissedTurns: number;
  lastMissedAt?: string;
}

export type CombatActionOrigin = "manual" | "timeout-auto-attack" | "timeout-skip";

export interface CombatTurnSummary {
  action: CombatActionType;
  actionOrigin?: CombatActionOrigin;
  heroOutcome: CombatTurnOutcome;
  monsterOutcome?: CombatTurnOutcome;
  heroDamage: number;
  monsterDamage: number;
  manaSpent: number;
  critical: boolean;
  skillId?: string;
  damageKind?: CombatDamageKind;
  monsterAction?: "attack" | "skill" | "defend" | "telegraph";
  monsterSkillId?: string;
  monsterDamageKind?: CombatDamageKind;
  monsterEffectText?: string;
  monsterTelegraphAbilityId?: string;
  heroCounterDamage?: number;
  monsterBarkId?: string;
  debugTrace?: CombatDebugTrace;
}

export interface CombatGuardState {
  consecutiveDefends: number;
}

export interface StartCombatInput {
  id?: string;
  hero: CombatActorStats & {
    hpCurrent?: number;
    manaCurrent?: number;
  };
  monster: MonsterCombatStats;
}

export function startCombat(input: StartCombatInput): CombatState {
  const heroHpMax = safePositiveInt(input.hero.hpMax);
  const heroManaMax = safeNonNegativeInt(input.hero.manaMax);
  const monsterHpMax = safePositiveInt(input.monster.hpMax);
  const monsterRuntime = createMonsterAbilityRuntime({
    monster: input.monster,
    seed: input.id ?? input.monster.monsterId
  });

  return {
    ...(input.id ? { id: input.id } : {}),
    turn: 1,
    status: "active",
    hero: {
      hp: clampResource(input.hero.hpCurrent ?? heroHpMax, heroHpMax),
      hpMax: heroHpMax,
      mana: clampResource(input.hero.manaCurrent ?? heroManaMax, heroManaMax),
      manaMax: heroManaMax
    },
    monster: {
      id: input.monster.monsterId,
      ...(input.monster.name ? { name: input.monster.name } : {}),
      level: input.monster.level,
      hp: monsterHpMax,
      hpMax: monsterHpMax,
      attack: input.monster.attack,
      armor: input.monster.armor,
      resist: input.monster.resist,
      dexterity: input.monster.dexterity,
      ...(input.monster.classId ? { classId: input.monster.classId } : {}),
      ...(input.monster.className ? { className: input.monster.className } : {}),
      ...(input.monster.raceId ? { raceId: input.monster.raceId } : {}),
      ...(input.monster.raceName ? { raceName: input.monster.raceName } : {}),
      ...(input.monster.title ? { title: input.monster.title } : {}),
      ...(input.monster.spellPower ? { spellPower: input.monster.spellPower } : {}),
      ...(input.monster.copiedEquipment ? { copiedEquipment: input.monster.copiedEquipment } : {}),
      ...(input.monster.debugTrace ? { debugTrace: { ...input.monster.debugTrace } } : {}),
      ...(input.monster.contextModifiers
        ? { contextModifiers: { ...input.monster.contextModifiers } }
        : {})
    },
    ...(monsterRuntime ? { monsterRuntime } : {})
  };
}

export function cloneCombatState(state: CombatState): CombatState {
  const monsterRuntime = cloneMonsterAbilityRuntimeState(state.monsterRuntime);

  return {
    ...(state.id ? { id: state.id } : {}),
    ...(state.source ? { source: state.source } : {}),
    ...(state.originLocationId ? { originLocationId: state.originLocationId } : {}),
    ...(state.completedAt ? { completedAt: state.completedAt } : {}),
    ...(state.turnExpiresAt ? { turnExpiresAt: state.turnExpiresAt } : {}),
    ...(state.message ? { message: { ...state.message } } : {}),
    ...(state.timeout ? { timeout: { ...state.timeout } } : {}),
    turn: state.turn,
    status: state.status,
    hero: { ...state.hero },
    monster: {
      ...state.monster,
      ...(state.monster.copiedEquipment
        ? { copiedEquipment: state.monster.copiedEquipment.map((item) => ({ ...item })) }
        : {}),
      ...(state.monster.debugTrace ? { debugTrace: { ...state.monster.debugTrace } } : {}),
      ...(state.monster.contextModifiers
        ? { contextModifiers: { ...state.monster.contextModifiers } }
        : {})
    },
    ...(state.cooldowns
      ? {
          cooldowns: cloneCombatCooldowns(state.cooldowns)
        }
      : {}),
    ...(state.guard ? { guard: { ...state.guard } } : {}),
    ...(state.context ? { context: cloneMonsterContextSnapshot(state.context) } : {}),
    ...(state.barks ? { barks: cloneCombatBarkState(state.barks) } : {}),
    ...(state.analytics ? { analytics: cloneCombatAnalyticsState(state.analytics) } : {}),
    ...(monsterRuntime ? { monsterRuntime } : {}),
    ...(state.lastTurn
      ? {
          lastTurn: {
            ...state.lastTurn,
            ...(state.lastTurn.debugTrace ? { debugTrace: { ...state.lastTurn.debugTrace } } : {})
          }
        }
      : {})
  };
}

export function getCombatTimeoutStreak(state: CombatState): number {
  return Math.max(0, Math.floor(state.timeout?.consecutiveMissedTurns ?? 0));
}

export function recordCombatTimeout(state: CombatState, now: Date): CombatState {
  const next = cloneCombatState(state);
  next.timeout = {
    consecutiveMissedTurns: getCombatTimeoutStreak(state) + 1,
    lastMissedAt: now.toISOString()
  };

  return next;
}

export function resetCombatTimeout(state: CombatState): CombatState {
  if (!state.timeout) {
    return state;
  }

  const next = cloneCombatState(state);
  delete next.timeout;

  return next;
}

export function expireCombat(state: CombatState): CombatState {
  if (state.status !== "active") {
    return cloneCombatState(state);
  }

  return {
    ...cloneCombatState(state),
    status: "expired",
    lastTurn: {
      action: "flee",
      heroOutcome: "inactive",
      heroDamage: 0,
      monsterDamage: 0,
      manaSpent: 0,
      critical: false
    }
  };
}

export function markCombatTurnTimeoutMode(
  state: CombatState,
  timeoutMode: CombatTimeoutMode
): CombatState {
  if (!state.lastTurn) {
    return state;
  }

  return {
    ...state,
    lastTurn: {
      ...state.lastTurn,
      debugTrace: {
        ...state.lastTurn.debugTrace,
        timeoutMode
      }
    }
  };
}

export function cloneCombatCooldowns(
  cooldowns: NonNullable<CombatState["cooldowns"]>
): NonNullable<CombatState["cooldowns"]> {
  return {
    ...(cooldowns.abilities
      ? {
          abilities: Object.fromEntries(
            Object.entries(cooldowns.abilities).map(([abilityId, cooldown]) => [
              abilityId,
              { ...cooldown }
            ])
          )
        }
      : {}),
    ...(cooldowns.skill ? { skill: { ...cooldowns.skill } } : {})
  };
}

function cloneMonsterContextSnapshot(snapshot: MonsterContextSnapshotV1): MonsterContextSnapshotV1 {
  return {
    ...snapshot,
    traitIds: [...snapshot.traitIds],
    world: {
      ...snapshot.world,
      locationTags: [...snapshot.world.locationTags]
    },
    matchedBranches: snapshot.matchedBranches.map((branch) => ({ ...branch })),
    effects: { ...snapshot.effects },
    ...(snapshot.cue ? { cue: { ...snapshot.cue } } : {})
  };
}

function cloneCombatBarkState(state: CombatBarkStateV1): CombatBarkStateV1 {
  return {
    ...state,
    selectedEarlyBarkByMonsterId: { ...state.selectedEarlyBarkByMonsterId },
    emittedBarkIds: [...state.emittedBarkIds],
    lastBarkOwnActionByMonsterId: { ...state.lastBarkOwnActionByMonsterId },
    encounterBarkCountByMonsterId: { ...state.encounterBarkCountByMonsterId },
    ownActionCountByMonsterId: { ...state.ownActionCountByMonsterId }
  };
}

export function safePositiveInt(value: number): number {
  return Math.max(1, Math.floor(value));
}

export function safeNonNegativeInt(value: number): number {
  return Math.max(0, Math.floor(value));
}

export function clampResource(current: number, max: number): number {
  const safeMax = safeNonNegativeInt(max);

  if (safeMax === 0) {
    return 0;
  }

  return Math.min(safeMax, Math.max(0, Math.floor(current)));
}
