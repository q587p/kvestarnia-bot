import type { CharacterStats } from "../characters/starterStats";
import type { CombatAbilitySource, CombatTargetScope } from "./combatActions";
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
import type { VarenykSatedCombatStateV1 } from "../noncombat/varenykSatedSupport";
import type { BardInspirationCombatStateV1 } from "../noncombat/bardSupport";

export type CombatStatus = "active" | "won" | "lost" | "fled" | "expired";
export const COMBAT_TURN_LOG_MAX_ENTRIES = 587;
export const PLAYER_ABILITY_FUMBLE_CYCLE_USES = 93;
export type CombatActionType = "attack" | "defend" | "skill" | "race" | "gear" | "flee" | "skip" | "item";
export type PlayerCombatActionType = Exclude<CombatActionType, "skip" | "item">;
export type CombatDamageKind = "physical" | "spell" | "social" | "trick";
export type CombatTimeoutMode = "auto-attack" | "auto-defend" | "skip";
export type CombatSettlementStatus = "pending" | "completed" | "forfeited-by-remort";
export type CombatSettlementReason =
  | "terminal"
  | "remort"
  | "legacy-life-mismatch"
  | "life-mismatch";
export type CombatTurnOutcome =
  | "hit"
  | "critical-hit"
  | "miss"
  | "defended"
  | "not-enough-mana"
  | "skill-on-cooldown"
  | "critical-fumble"
  | "item-used"
  | "inactive"
  | "fled"
  | "flee-failed"
  | "won"
  | "lost";

export interface CombatActorStats extends CharacterStats {
  level: number;
  hpMax: number;
  manaMax: number;
  raceId?: string;
  classId?: string;
  armor?: number;
  resist?: number;
  weaponDamage?: number;
  spellPower?: number;
  accuracyBonusPp?: number;
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

export interface CombatMonsterState {
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
}

export interface CombatEnemyState extends CombatMonsterState {
  enemyId: string;
  monsterRuntime?: MonsterAbilityRuntimeStateV1;
}

export interface CombatContributionDimensionsV1 {
  damage: number;
  healing: number | null;
  guardPrevented: number | null;
  control: number | null;
  damageTaken: number;
  actions: number;
  specialActions: number;
  guardedTurns: number;
}

export interface CombatStatisticsStateV1 {
  version: 1;
  hero: CombatContributionDimensionsV1;
  enemies: Record<string, CombatContributionDimensionsV1>;
}

export interface CombatStatisticsEnemyTurnEvidenceV1 {
  damage: number;
  healing: number;
  guardPrevented: number;
  control: number;
}

export interface CombatStatisticsTurnEvidenceV1 {
  heroGuardPrevented: number;
  heroControl: number;
  enemies: Record<string, CombatStatisticsEnemyTurnEvidenceV1>;
}

export interface CombatState {
  id?: string;
  source?: "normal" | "yeger" | "adventure" | "training";
  life?: CombatLifeState;
  settlement?: CombatSettlementState;
  threat?: CombatThreatState;
  threatExclusion?: CombatThreatExclusionState;
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
    guildCrest?: string;
  };
  monster: CombatMonsterState;
  enemies?: CombatEnemyState[];
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
  combatItems?: {
    cooldowns?: Record<string, {
      itemId: string;
      remainingTurns: number;
    }>;
    uses?: Record<string, {
      itemId: string;
      count: number;
    }>;
  };
  guard?: CombatGuardState;
  context?: MonsterContextSnapshotV1;
  barks?: CombatBarkStateV1;
  analytics?: CombatAnalyticsStateV1;
  drinkModifiers?: DrinkCombatModifiers;
  equipmentAbilities?: CombatEquipmentAbilityState;
  enemyStatuses?: CombatEnemyStatusesState;
  statistics?: CombatStatisticsStateV1;
  monsterRuntime?: MonsterAbilityRuntimeStateV1;
  lastTurn?: CombatTurnSummary;
  turnLog?: CombatTurnLogEntry[];
  playerAbilityFumbles?: PlayerAbilityFumblesState;
  varenykSated?: VarenykSatedCombatStateV1;
  bardInspiration?: BardInspirationCombatStateV1;
}

export interface PlayerAbilityFumblesState {
  version: 1;
  abilities: Record<string, PlayerAbilityFumbleState>;
}

export interface PlayerAbilityFumbleState {
  version: 1;
  cycle: number;
  usesInCycle: number;
  triggerAt: number;
}

export interface CombatPlayerAbilityFumbleSummary {
  abilityId: string;
  kind: "self-damage" | "enemy-heal";
  line: string;
  selfDamage?: number;
  enemyHealing?: number;
}

export interface CombatThreatState {
  version: 1;
  enemyCount: 2;
  reason: "ordinary-win-streak";
  eligibleWins: number;
  lineId: string;
  lineVersion: string;
  pressure?: CombatThreatPressureState;
}

export interface CombatThreatPressureState {
  version: 1;
  consecutiveWonEscalatedFights: number;
  requestedSecondEnemyLevelBonus: number;
  appliedSecondEnemyLevelBonus: number;
  boostedEnemyId: string;
  boostedEnemyEffectiveLevel: number;
  levelCap: number;
}

export interface CombatThreatExclusionState {
  version: 1;
  reason: "dev-forced-two-enemies";
}

export interface DrinkCombatModifiers {
  drinkKey?: string;
  sourceId?: string;
  activationId?: string;
  accuracyPenaltyPp?: number;
  outgoingDamageMultiplierBp?: number;
  incomingDamageMultiplierBp?: number;
}

export interface CombatLifeState {
  characterId?: string;
  remortCount: number;
  startedAt?: string;
}

export interface CombatSettlementState {
  status: CombatSettlementStatus;
  settledAt?: string;
  reason?: CombatSettlementReason;
  version?: number;
  resources?: CombatResourceSettlementState;
  training?: CombatTrainingSettlementState;
}

export interface CombatResourceSettlementState {
  status: "applied";
  appliedAt: string;
  hpCurrent: number;
  manaCurrent: number;
  hpRegenAt: string;
  manaRegenAt: string;
}

export interface CombatTrainingSettlementState {
  availableAt?: string;
  cooldownClaimedAt?: string;
}

export interface CombatMessageReference {
  chatId: string;
  messageId: number;
}

export interface CombatTimeoutState {
  consecutiveMissedTurns: number;
  lastMissedAt?: string;
}

export type CombatActionOrigin =
  | "manual"
  | "timeout-auto-attack"
  | "timeout-auto-defend"
  | "timeout-skip";

export interface CombatTurnSummary {
  action: CombatActionType;
  actionOrigin?: CombatActionOrigin;
  heroOutcome: CombatTurnOutcome;
  monsterOutcome?: CombatTurnOutcome;
  heroDamage: number;
  monsterDamage: number;
  heroEffectDamage?: number;
  manaSpent: number;
  critical: boolean;
  skillId?: string;
  abilitySource?: CombatAbilitySource;
  targetScope?: CombatTargetScope;
  secondaryTargetScope?: CombatTargetScope;
  damageKind?: CombatDamageKind;
  monsterAction?: "attack" | "skill" | "defend" | "telegraph";
  monsterSkillId?: string;
  monsterDamageKind?: CombatDamageKind;
  monsterEffectText?: string;
  monsterTelegraphAbilityId?: string;
  simultaneousFinalResponse?: boolean;
  heroCounterDamage?: number;
  monsterBarkId?: string;
  itemId?: string;
  itemName?: string;
  heroHealing?: number;
  heroManaRestored?: number;
  heroHpAfter?: number;
  enemyResults?: CombatEnemyAbilityResult[];
  allyResults?: CombatAllyAbilityResult[];
  fumble?: CombatPlayerAbilityFumbleSummary;
  satedRecovery?: { hpRestored: number; manaRestored: number };
  enemyActions?: CombatEnemyTurnSummary[];
  enemyPressureSkips?: CombatEnemyPressureSkipSummary[];
  itemResponse?: CombatItemResponseSummary;
  statisticsEvidence?: CombatStatisticsTurnEvidenceV1;
  debugTrace?: CombatDebugTrace;
}

export interface CombatItemResponseSummary {
  enemyId: string;
  monsterId: string;
  monsterName?: string;
  kind: "guard" | "evade";
  damageAfter: number;
  preventedDamage?: number;
}

export interface CombatEquipmentAbilityState {
  version: 1;
  grantIds: string[];
}

export interface CombatEnemyStatusesState {
  version: 1;
  enemies: Record<string, CombatEnemyStatusState>;
}

export interface CombatEnemyStatusState {
  bleed?: CombatBleedStatus;
}

export interface CombatBleedStatus {
  sourceAbilityId: string;
  damagePerActivation: number;
  remainingHeroActivations: number;
  refreshedAtTurn: number;
}

export interface CombatEnemyAbilityResult {
  enemyId: string;
  monsterId: string;
  monsterName?: string;
  damage: number;
  outcome: Extract<CombatTurnOutcome, "hit" | "critical-hit" | "miss" | "won">;
  critical?: boolean;
}

export interface CombatAllyAbilityResult {
  targetId: string;
  label?: string;
  healing?: number;
  guard?: number;
}

export interface CombatEnemyTurnSummary {
  enemyId: string;
  monsterId: string;
  monsterName?: string;
  monsterOutcome?: CombatTurnOutcome;
  monsterDamage: number;
  monsterAction?: "attack" | "skill" | "defend" | "telegraph";
  monsterSkillId?: string;
  monsterDamageKind?: CombatDamageKind;
  monsterEffectText?: string;
  monsterTelegraphAbilityId?: string;
  simultaneousFinalResponse?: boolean;
}

export interface CombatEnemyPressureSkipSummary {
  enemyId: string;
  monsterId: string;
  monsterName?: string;
}

export interface CombatTurnLogEntry {
  eventId?: string;
  turn: number;
  summary: CombatTurnSummary;
  notices?: string[];
  cooldowns?: NonNullable<CombatState["cooldowns"]>;
  hero: {
    hp: number;
    mana: number;
  };
  monster: {
    hp: number;
  };
  enemies?: Array<{
    enemyId: string;
    hp: number;
  }>;
  varenykSated?: import("../noncombat/varenykSatedSupport").VarenykSatedCombatStateV1;
  bardInspiration?: import("../noncombat/bardSupport").BardInspirationCombatStateV1;
}

export interface CombatGuardState {
  consecutiveDefends: number;
  abilityDamageReduction?: number;
}

export interface StartCombatInput {
  id?: string;
  hero: CombatActorStats & {
    hpCurrent?: number;
    manaCurrent?: number;
    guildCrest?: string;
  };
  monster: MonsterCombatStats;
  enemies?: MonsterCombatStats[];
}

export function startCombat(input: StartCombatInput): CombatState {
  const heroHpMax = safePositiveInt(input.hero.hpMax);
  const heroManaMax = safeNonNegativeInt(input.hero.manaMax);
  const inputEnemies = normalizeStartEnemies(input);
  const primaryEnemy = inputEnemies[0]!;
  const monsterRuntime = primaryEnemy.monsterRuntime;

  return {
    ...(input.id ? { id: input.id } : {}),
    turn: 1,
    status: "active",
    hero: {
      hp: clampResource(input.hero.hpCurrent ?? heroHpMax, heroHpMax),
      hpMax: heroHpMax,
      mana: clampResource(input.hero.manaCurrent ?? heroManaMax, heroManaMax),
      manaMax: heroManaMax,
      ...(input.hero.guildCrest ? { guildCrest: input.hero.guildCrest } : {})
    },
    monster: {
      ...combatEnemyToMonster(primaryEnemy)
    },
    ...(inputEnemies.length > 1 ? { enemies: inputEnemies } : {}),
    statistics: createCombatStatisticsState(inputEnemies),
    ...(monsterRuntime ? { monsterRuntime } : {})
  };
}

export function cloneCombatState(state: CombatState): CombatState {
  const monsterRuntime = cloneMonsterAbilityRuntimeState(state.monsterRuntime);

  return {
    ...(state.id ? { id: state.id } : {}),
    ...(state.source ? { source: state.source } : {}),
    ...(state.life ? { life: { ...state.life } } : {}),
    ...(state.settlement
      ? {
          settlement: {
            ...state.settlement,
            ...(state.settlement.resources
              ? { resources: { ...state.settlement.resources } }
              : {}),
            ...(state.settlement.training ? { training: { ...state.settlement.training } } : {})
          }
        }
      : {}),
    ...(state.threat
      ? {
          threat: {
            ...state.threat,
            ...(state.threat.pressure ? { pressure: { ...state.threat.pressure } } : {})
          }
        }
      : {}),
    ...(state.threatExclusion ? { threatExclusion: { ...state.threatExclusion } } : {}),
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
    ...(state.enemies ? { enemies: state.enemies.map(cloneCombatEnemyState) } : {}),
    ...(state.cooldowns
      ? {
          cooldowns: cloneCombatCooldowns(state.cooldowns)
        }
      : {}),
    ...(state.combatItems ? { combatItems: cloneCombatItemState(state.combatItems) } : {}),
    ...(state.guard ? { guard: { ...state.guard } } : {}),
    ...(state.context ? { context: cloneMonsterContextSnapshot(state.context) } : {}),
    ...(state.barks ? { barks: cloneCombatBarkState(state.barks) } : {}),
    ...(state.analytics ? { analytics: cloneCombatAnalyticsState(state.analytics) } : {}),
    ...(state.drinkModifiers ? { drinkModifiers: { ...state.drinkModifiers } } : {}),
    ...(state.equipmentAbilities
      ? { equipmentAbilities: cloneEquipmentAbilityState(state.equipmentAbilities) }
      : {}),
    ...(state.enemyStatuses ? { enemyStatuses: cloneEnemyStatusesState(state.enemyStatuses) } : {}),
    ...(state.statistics ? { statistics: cloneCombatStatisticsState(state.statistics) } : {}),
    ...(monsterRuntime ? { monsterRuntime } : {}),
    ...(state.lastTurn
      ? {
          lastTurn: cloneCombatTurnSummary(state.lastTurn)
        }
      : {}),
    ...(state.turnLog ? { turnLog: state.turnLog.map(cloneCombatTurnLogEntry) } : {}),
    ...(state.playerAbilityFumbles
      ? { playerAbilityFumbles: clonePlayerAbilityFumblesState(state.playerAbilityFumbles) }
      : {}),
    ...(state.varenykSated
      ? { varenykSated: { ...state.varenykSated, pulseIds: [...state.varenykSated.pulseIds] } }
      : {}),
    ...(state.bardInspiration
      ? { bardInspiration: { ...state.bardInspiration, pulseIds: [...state.bardInspiration.pulseIds] } }
      : {})
  };
}

export function normalizeCombatEnemies(state: CombatState): CombatEnemyState[] {
  if (state.enemies) {
    return state.enemies.map(cloneCombatEnemyState);
  }

  return [combatMonsterToEnemy(state.monster, "enemy:1", state.monsterRuntime)];
}

export function hasCombatEnemyCollection(state: CombatState): boolean {
  return Array.isArray(state.enemies);
}

export function getLivingCombatEnemies(state: CombatState): CombatEnemyState[] {
  return normalizeCombatEnemies(state).filter((enemy) => enemy.hp > 0);
}

export function getPrimaryCombatEnemy(state: CombatState): CombatEnemyState {
  return getLivingCombatEnemies(state)[0] ?? normalizeCombatEnemies(state)[0]!;
}

export function syncPrimaryCombatEnemy(state: CombatState): void {
  const hasEnemyCollection = hasCombatEnemyCollection(state);
  const enemies = normalizeCombatEnemies(state);
  const primary = enemies.find((enemy) => enemy.hp > 0) ?? enemies[0]!;
  const primaryMirror = combatMonsterToEnemy(
    combatEnemyToMonster(primary),
    primary.enemyId,
    primary.monsterRuntime
  );
  const orderedEnemies = [
    primaryMirror,
    ...enemies
      .filter((enemy) => enemy.enemyId !== primary.enemyId)
      .map(cloneCombatEnemyState)
  ];

  state.monster = combatEnemyToMonster(primaryMirror);
  if (primaryMirror.monsterRuntime) {
    state.monsterRuntime = cloneMonsterAbilityRuntimeState(primaryMirror.monsterRuntime)!;
  } else {
    delete state.monsterRuntime;
  }

  if (hasEnemyCollection || enemies.length > 1) {
    state.enemies = orderedEnemies;
  } else {
    delete state.enemies;
  }
}

export function updateCombatEnemy(
  state: CombatState,
  enemyId: string,
  enemy: CombatEnemyState
): void {
  const hasEnemyCollection = hasCombatEnemyCollection(state);
  const enemies = normalizeCombatEnemies(state).map((candidate) =>
    candidate.enemyId === enemyId ? cloneCombatEnemyState(enemy) : candidate
  );

  if (!enemies.some((candidate) => candidate.enemyId === enemyId)) {
    return;
  }

  if (hasEnemyCollection || enemies.length > 1) {
    state.enemies = enemies;
  } else {
    delete state.enemies;
  }
  syncPrimaryCombatEnemy(state);
}

export function combatEnemyToMonster(enemy: CombatEnemyState): CombatMonsterState {
  const monster: CombatMonsterState = { ...enemy };
  delete (monster as CombatMonsterState & { enemyId?: string }).enemyId;
  delete (monster as CombatMonsterState & {
    monsterRuntime?: MonsterAbilityRuntimeStateV1;
  }).monsterRuntime;

  return {
    ...monster,
    ...(monster.copiedEquipment
      ? { copiedEquipment: monster.copiedEquipment.map((item) => ({ ...item })) }
      : {}),
    ...(monster.debugTrace ? { debugTrace: { ...monster.debugTrace } } : {}),
    ...(monster.contextModifiers ? { contextModifiers: { ...monster.contextModifiers } } : {})
  };
}

export function freezeCombatLife(input: {
  characterId?: string;
  remortCount?: number;
  now: Date;
}): CombatLifeState {
  return {
    ...(input.characterId ? { characterId: input.characterId } : {}),
    remortCount: safeNonNegativeInt(input.remortCount ?? 0),
    startedAt: input.now.toISOString()
  };
}

export function ensurePendingCombatSettlement(state: CombatState): CombatState {
  if (state.settlement) {
    return cloneCombatState(state);
  }

  return {
    ...cloneCombatState(state),
    settlement: {
      status: "pending",
      version: 1
    }
  };
}

export function markCombatSettlementCompleted(state: CombatState, now: Date): CombatState {
  if (state.settlement?.status === "completed") {
    return cloneCombatState(state);
  }
  const current = state.settlement;

  return {
    ...cloneCombatState(state),
    settlement: {
      ...current,
      status: "completed",
      settledAt: now.toISOString(),
      reason: "terminal",
      version: (current?.version ?? 1) + 1
    }
  };
}

export function markCombatSettlementForfeitedByRemort(
  state: CombatState,
  now: Date,
  reason: CombatSettlementReason = "remort"
): CombatState {
  if (state.settlement?.status === "forfeited-by-remort") {
    return cloneCombatState(state);
  }
  const current = state.settlement;

  return {
    ...cloneCombatState(state),
    settlement: {
      ...current,
      status: "forfeited-by-remort",
      settledAt: now.toISOString(),
      reason,
      version: (current?.version ?? 1) + 1
    }
  };
}

export function isCombatSettlementTerminal(state: CombatState | null | undefined): boolean {
  return state?.settlement?.status === "completed" ||
    state?.settlement?.status === "forfeited-by-remort";
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

  const lastTurn: CombatTurnSummary = {
    action: "flee",
    heroOutcome: "inactive",
    heroDamage: 0,
    monsterDamage: 0,
    manaSpent: 0,
    critical: false
  };
  const next: CombatState = {
    ...cloneCombatState(state),
    status: "expired",
    lastTurn
  };
  appendCombatTurnLogEntry(next, {
    eventId: getTerminalCombatTurnLogEventId("expired"),
    turn: Math.max(1, state.turn),
    summary: lastTurn,
    hero: {
      hp: next.hero.hp,
      mana: next.hero.mana
    },
    monster: {
      hp: next.monster.hp
    },
    ...turnLogEnemies(next)
  });

  return next;
}

export function getTerminalCombatTurnLogEventId(status: Exclude<CombatStatus, "active">): string {
  return `terminal:${status}`;
}

export function appendCombatTurnLogEntry(state: CombatState, entry: CombatTurnLogEntry): void {
  const existing = state.turnLog ?? [];

  if (entry.eventId && existing.some((candidate) => candidate.eventId === entry.eventId)) {
    return;
  }

  state.turnLog = [...existing, cloneCombatTurnLogEntry(entry)].slice(-COMBAT_TURN_LOG_MAX_ENTRIES);
}

export function markCombatTurnTimeoutMode(
  state: CombatState,
  timeoutMode: CombatTimeoutMode
): CombatState {
  if (!state.lastTurn) {
    return state;
  }

  const lastTurn = {
    ...state.lastTurn,
    debugTrace: {
      ...state.lastTurn.debugTrace,
      timeoutMode
    }
  };
  const existingTurnLog = state.turnLog;
  const turnLog = existingTurnLog
    ? existingTurnLog.map((entry, index) => index === existingTurnLog.length - 1
      ? {
          ...entry,
          summary: {
            ...entry.summary,
            debugTrace: {
              ...entry.summary.debugTrace,
              timeoutMode
            }
          }
        }
      : entry)
    : undefined;

  return {
    ...state,
    lastTurn,
    ...(turnLog ? { turnLog } : {})
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

export function cloneCombatTurnSummary(summary: CombatTurnSummary): CombatTurnSummary {
  return {
    ...summary,
    ...(summary.enemyActions
      ? { enemyActions: summary.enemyActions.map((entry) => ({ ...entry })) }
      : {}),
    ...(summary.enemyPressureSkips
      ? { enemyPressureSkips: summary.enemyPressureSkips.map((entry) => ({ ...entry })) }
      : {}),
    ...(summary.itemResponse ? { itemResponse: { ...summary.itemResponse } } : {}),
    ...(summary.statisticsEvidence
      ? {
          statisticsEvidence: {
            ...summary.statisticsEvidence,
            enemies: Object.fromEntries(
              Object.entries(summary.statisticsEvidence.enemies).map(([enemyId, values]) => [
                enemyId,
                { ...values }
              ])
            )
          }
        }
      : {}),
    ...(summary.enemyResults
      ? { enemyResults: summary.enemyResults.map((entry) => ({ ...entry })) }
      : {}),
    ...(summary.allyResults
      ? { allyResults: summary.allyResults.map((entry) => ({ ...entry })) }
      : {}),
    ...(summary.fumble ? { fumble: { ...summary.fumble } } : {}),
    ...(summary.debugTrace ? { debugTrace: { ...summary.debugTrace } } : {})
  };
}

export function cloneCombatItemState(
  combatItems: NonNullable<CombatState["combatItems"]>
): NonNullable<CombatState["combatItems"]> {
  return {
    ...(combatItems.cooldowns
      ? {
          cooldowns: Object.fromEntries(
            Object.entries(combatItems.cooldowns).map(([itemId, cooldown]) => [
              itemId,
              { ...cooldown }
            ])
          )
        }
      : {}),
    ...(combatItems.uses
      ? {
          uses: Object.fromEntries(
            Object.entries(combatItems.uses).map(([itemId, use]) => [
              itemId,
              { ...use }
            ])
          )
        }
      : {})
  };
}

export function clonePlayerAbilityFumblesState(
  state: PlayerAbilityFumblesState
): PlayerAbilityFumblesState {
  return {
    version: 1,
    abilities: Object.fromEntries(
      Object.entries(state.abilities).map(([abilityId, entry]) => [
        abilityId,
        { ...entry }
      ])
    )
  };
}

function cloneEquipmentAbilityState(state: CombatEquipmentAbilityState): CombatEquipmentAbilityState {
  return {
    version: 1,
    grantIds: [...state.grantIds]
  };
}

function cloneEnemyStatusesState(state: CombatEnemyStatusesState): CombatEnemyStatusesState {
  return {
    version: 1,
    enemies: Object.fromEntries(
      Object.entries(state.enemies).map(([enemyId, status]) => [
        enemyId,
        {
          ...(status.bleed ? { bleed: { ...status.bleed } } : {})
        }
      ])
    )
  };
}

export function cloneCombatTurnLogEntry(entry: CombatTurnLogEntry): CombatTurnLogEntry {
  return {
    ...(entry.eventId ? { eventId: entry.eventId } : {}),
    turn: entry.turn,
    summary: cloneCombatTurnSummary(entry.summary),
    ...(entry.notices ? { notices: [...entry.notices] } : {}),
    ...(entry.cooldowns ? { cooldowns: cloneCombatCooldowns(entry.cooldowns) } : {}),
    hero: { ...entry.hero },
    monster: { ...entry.monster },
    ...(entry.enemies ? { enemies: entry.enemies.map((enemy) => ({ ...enemy })) } : {}),
    ...(entry.varenykSated
      ? { varenykSated: { ...entry.varenykSated, pulseIds: [...entry.varenykSated.pulseIds] } }
      : {}),
    ...(entry.bardInspiration
      ? { bardInspiration: { ...entry.bardInspiration, pulseIds: [...entry.bardInspiration.pulseIds] } }
      : {})
  };
}

export function turnLogEnemies(state: CombatState): {
  enemies?: Array<{ enemyId: string; hp: number }>;
} {
  const enemies = normalizeCombatEnemies(state);

  return enemies.length > 1
    ? { enemies: enemies.map((enemy) => ({ enemyId: enemy.enemyId, hp: enemy.hp })) }
    : {};
}

export function cloneCombatEnemyState(enemy: CombatEnemyState): CombatEnemyState {
  const runtime = cloneMonsterAbilityRuntimeState(enemy.monsterRuntime);

  return {
    ...enemy,
    ...(enemy.copiedEquipment
      ? { copiedEquipment: enemy.copiedEquipment.map((item) => ({ ...item })) }
      : {}),
    ...(enemy.debugTrace ? { debugTrace: { ...enemy.debugTrace } } : {}),
    ...(enemy.contextModifiers ? { contextModifiers: { ...enemy.contextModifiers } } : {}),
    ...(runtime ? { monsterRuntime: runtime } : {})
  };
}

export function cloneCombatStatisticsState(
  state: CombatStatisticsStateV1
): CombatStatisticsStateV1 {
  return {
    version: 1,
    hero: { ...state.hero },
    enemies: Object.fromEntries(
      Object.entries(state.enemies).map(([enemyId, values]) => [enemyId, { ...values }])
    )
  };
}

export function recordCombatStatisticsTurn(input: {
  state: CombatState;
  previousState: CombatState;
  summary: CombatTurnSummary;
}): void {
  if (!input.state.statistics) {
    return;
  }

  const statistics = cloneCombatStatisticsState(input.state.statistics);
  const previousEnemies = new Map(
    normalizeCombatEnemies(input.previousState).map((enemy) => [enemy.enemyId, enemy])
  );
  const currentEnemies = new Map(
    normalizeCombatEnemies(input.state).map((enemy) => [enemy.enemyId, enemy])
  );
  let totalDamageDealt = 0;

  for (const [enemyId, current] of currentEnemies) {
    const previous = previousEnemies.get(enemyId);
    const values = statistics.enemies[enemyId] ?? emptyCombatContributionDimensions({ healing: 0 });
    const evidence = input.summary.statisticsEvidence?.enemies[enemyId];
    const healing = Math.max(0, Math.floor(evidence?.healing ?? 0));
    const damageTaken = previous ? Math.max(0, previous.hp + healing - current.hp) : 0;
    totalDamageDealt += damageTaken;
    values.healing = (values.healing ?? 0) + healing;
    values.guardPrevented = (values.guardPrevented ?? 0) +
      Math.max(0, Math.floor(evidence?.guardPrevented ?? 0));
    values.control = (values.control ?? 0) +
      Math.max(0, Math.floor(evidence?.control ?? 0));
    values.damageTaken += damageTaken;
    statistics.enemies[enemyId] = values;
  }

  const heroHealing = Math.max(0, Math.floor(input.summary.heroHealing ?? 0)) +
    Math.max(0, Math.floor(input.summary.satedRecovery?.hpRestored ?? 0));
  const heroDamageTaken = Math.max(
    0,
    input.previousState.hero.hp + heroHealing - input.state.hero.hp
  );
  const heroSelfDamage = Math.max(0, Math.min(
    heroDamageTaken,
    Math.floor(input.summary.fumble?.selfDamage ?? 0)
  ));
  const enemyDamageBudget = heroDamageTaken - heroSelfDamage;
  const manualAction = (input.summary.actionOrigin ?? "manual") === "manual" &&
    input.summary.action !== "skip";

  statistics.hero.damage += totalDamageDealt;
  statistics.hero.healing = (statistics.hero.healing ?? 0) + heroHealing;
  statistics.hero.guardPrevented = (statistics.hero.guardPrevented ?? 0) +
    Math.max(0, Math.floor(input.summary.statisticsEvidence?.heroGuardPrevented ?? 0));
  statistics.hero.control = (statistics.hero.control ?? 0) +
    Math.max(0, Math.floor(input.summary.statisticsEvidence?.heroControl ?? 0));
  statistics.hero.damageTaken += heroDamageTaken;
  statistics.hero.actions += manualAction ? 1 : 0;
  statistics.hero.specialActions += manualAction &&
    (input.summary.action === "skill" || input.summary.action === "race" || input.summary.action === "gear")
    ? 1
    : 0;
  statistics.hero.guardedTurns += manualAction && input.summary.action === "defend" ? 1 : 0;

  const enemyActions = input.summary.enemyActions && input.summary.enemyActions.length > 0
    ? input.summary.enemyActions
    : input.summary.monsterAction
      ? [{
          enemyId: "enemy:1",
          monsterId: input.state.monster.id,
          monsterDamage: heroDamageTaken,
          monsterAction: input.summary.monsterAction
        }]
      : [];
  let attributedEnemyDamage = 0;
  if (input.summary.statisticsEvidence) {
    for (const [enemyId, evidence] of Object.entries(input.summary.statisticsEvidence.enemies)) {
      const values = statistics.enemies[enemyId];
      if (!values) continue;
      const appliedDamage = Math.max(0, Math.min(
        enemyDamageBudget - attributedEnemyDamage,
        Math.floor(evidence.damage)
      ));
      values.damage += appliedDamage;
      attributedEnemyDamage += appliedDamage;
    }
  }
  for (const action of enemyActions) {
    const values = statistics.enemies[action.enemyId];
    if (!values || !action.monsterAction) {
      continue;
    }
    if (!input.summary.statisticsEvidence) {
      const appliedDamage = Math.max(0, Math.min(
        enemyDamageBudget - attributedEnemyDamage,
        Math.floor(action.monsterDamage)
      ));
      values.damage += appliedDamage;
      attributedEnemyDamage += appliedDamage;
    }
    values.actions += 1;
    values.specialActions += action.monsterAction === "skill" ? 1 : 0;
    values.guardedTurns += action.monsterAction === "defend" ? 1 : 0;
  }
  if (
    !input.summary.statisticsEvidence &&
    enemyActions.length > 0 &&
    attributedEnemyDamage < enemyDamageBudget
  ) {
    const primary = statistics.enemies[enemyActions[0]?.enemyId ?? "enemy:1"];
    if (primary) {
      primary.damage += enemyDamageBudget - attributedEnemyDamage;
    }
  }

  input.state.statistics = statistics;
}

function createCombatStatisticsState(enemies: readonly CombatEnemyState[]): CombatStatisticsStateV1 {
  return {
    version: 1,
    hero: emptyCombatContributionDimensions({ healing: 0 }),
    enemies: Object.fromEntries(
      enemies.map((enemy) => [enemy.enemyId, emptyCombatContributionDimensions({ healing: 0 })])
    )
  };
}

function emptyCombatContributionDimensions(input: {
  healing: number | null;
}): CombatContributionDimensionsV1 {
  return {
    damage: 0,
    healing: input.healing,
    guardPrevented: 0,
    control: 0,
    damageTaken: 0,
    actions: 0,
    specialActions: 0,
    guardedTurns: 0
  };
}

function normalizeStartEnemies(input: StartCombatInput): CombatEnemyState[] {
  const selected = [input.monster, ...(input.enemies ?? [])].slice(0, 2);
  const monsters = selected.length > 0 ? selected : [input.monster];

  return monsters.slice(0, 2).map((monster, index) => {
    const enemyId = `enemy:${index + 1}`;
    const seed = `${input.id ?? input.monster.monsterId}:${enemyId}:${monster.monsterId}`;

    return combatMonsterToEnemy(
      monsterStatsToState(monster),
      enemyId,
      createMonsterAbilityRuntime({ monster, seed })
    );
  });
}

function monsterStatsToState(monster: MonsterCombatStats): CombatMonsterState {
  const hpMax = safePositiveInt(monster.hpMax);

  return {
    id: monster.monsterId,
    ...(monster.name ? { name: monster.name } : {}),
    level: monster.level,
    hp: hpMax,
    hpMax,
    attack: monster.attack,
    armor: monster.armor,
    resist: monster.resist,
    dexterity: monster.dexterity,
    ...(monster.classId ? { classId: monster.classId } : {}),
    ...(monster.className ? { className: monster.className } : {}),
    ...(monster.raceId ? { raceId: monster.raceId } : {}),
    ...(monster.raceName ? { raceName: monster.raceName } : {}),
    ...(monster.title ? { title: monster.title } : {}),
    ...(monster.spellPower ? { spellPower: monster.spellPower } : {}),
    ...(monster.copiedEquipment ? { copiedEquipment: monster.copiedEquipment } : {}),
    ...(monster.debugTrace ? { debugTrace: { ...monster.debugTrace } } : {}),
    ...(monster.contextModifiers ? { contextModifiers: { ...monster.contextModifiers } } : {})
  };
}

function combatMonsterToEnemy(
  monster: CombatMonsterState,
  enemyId: string,
  monsterRuntime?: MonsterAbilityRuntimeStateV1
): CombatEnemyState {
  const runtime = cloneMonsterAbilityRuntimeState(monsterRuntime);

  return {
    enemyId,
    ...combatEnemyToMonster({ enemyId, ...monster }),
    ...(runtime ? { monsterRuntime: runtime } : {})
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
