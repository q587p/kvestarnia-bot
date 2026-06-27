import type { CharacterSummary } from "../characters/characterSummary";
import type { CharacterStats } from "../characters/starterStats";
import {
  BASIC_ATTACK_ABILITY_ID,
  BASIC_DEFEND_ABILITY_ID
} from "./combatActions";
import type {
  CombatActionOrigin,
  CombatState,
  CombatTurnSummary,
  MonsterCombatStats
} from "./combatState";

export const COMBAT_BALANCE_ANALYTICS_SCHEMA_VERSION = 1;
export const COMBAT_BALANCE_VERSION = "combat-balance-0.1.21";
export const COMBAT_ENGINE_VERSION = "solo-combat-v1";

export const BASIC_FLEE_ABILITY_ID = "ability.basic.flee";
export const SYSTEM_SKIP_ABILITY_ID = "ability.system.skip";

export type CombatBalanceOutcome =
  | "win"
  | "loss"
  | "fled"
  | "timeout"
  | "cancelled"
  | "technical_error";

export type CombatBalanceSource =
  | "regular_mob"
  | "adventure"
  | "yeger"
  | "training"
  | "other";

export interface CombatAnalyticsAbilityAccumulatorV1 {
  abilityKey: string;
  actionOrigin: CombatActionOrigin;
  abilityRank: number;
  isClassAbility: boolean;
  usesCount: number;
  successfulUsesCount: number;
  hitCount: number;
  critCount: number;
  missCount: number;
  totalDamage: number;
  totalHealing: number;
  resourceSpent: number;
}

export interface CombatAnalyticsStateV1 {
  version: 1;
  schemaVersion: 1;
  balanceVersion: string;
  combatEngineVersion: string;
  startedAt: string;
  combatSource: CombatBalanceSource;
  isTestOrAdmin: boolean;
  playerAnalysisKey: string;
  characterId: string;
  player: {
    classKey: string;
    level: number;
    remortCount: number;
    hpMax: number;
    hpAtStart: number;
    manaMax: number;
    manaAtStart: number;
    stats: CharacterStats;
    equipment: {
      armor: number;
      resist: number;
      weaponDamage: number;
      spellPower: number;
    };
  };
  mob: {
    templateKey: string;
    type: string;
    level: number;
    baseLevel?: number;
    effectiveLevel?: number;
    difficultyTier: string;
    hpMax: number;
  };
  totals: {
    playerActionsCount: number;
    manualPlayerActionsCount: number;
    timeoutAutoActionsCount: number;
    timeoutSkipActionsCount: number;
    enemyActionsCount: number;
    damageDealt: number;
    damageTaken: number;
    healingDone: number;
    criticalHits: number;
    misses: number;
  };
  abilities: Record<string, CombatAnalyticsAbilityAccumulatorV1>;
}

export interface CreateCombatAnalyticsStateInput {
  characterId: string;
  playerAnalysisKey: string;
  character: CharacterSummary;
  monster: MonsterCombatStats;
  combatSource: CombatBalanceSource;
  startedAt: Date;
  isTestOrAdmin?: boolean;
  monsterType?: string;
  difficultyTier?: string;
  baseMonsterLevel?: number;
  effectiveMonsterLevel?: number;
}

export function createCombatAnalyticsState(
  input: CreateCombatAnalyticsStateInput
): CombatAnalyticsStateV1 {
  const equipment = input.character.equipmentEffects;
  const baseMonsterLevel =
    input.baseMonsterLevel ??
    input.monster.debugTrace?.baseMonsterLevel;
  const effectiveMonsterLevel =
    input.effectiveMonsterLevel ??
    input.monster.debugTrace?.effectiveMonsterLevel ??
    input.monster.level;

  return {
    version: 1,
    schemaVersion: COMBAT_BALANCE_ANALYTICS_SCHEMA_VERSION,
    balanceVersion: COMBAT_BALANCE_VERSION,
    combatEngineVersion: COMBAT_ENGINE_VERSION,
    startedAt: input.startedAt.toISOString(),
    combatSource: input.combatSource,
    isTestOrAdmin: input.isTestOrAdmin ?? false,
    playerAnalysisKey: input.playerAnalysisKey,
    characterId: input.characterId,
    player: {
      classKey: input.character.classId,
      level: input.character.level,
      remortCount: Math.max(0, Math.floor(input.character.remortCount ?? 0)),
      hpMax: input.character.hpMax,
      hpAtStart: input.character.hpCurrent,
      manaMax: input.character.manaMax,
      manaAtStart: input.character.manaCurrent,
      stats: { ...input.character.stats },
      equipment: {
        armor: equipment?.armor ?? 0,
        resist: equipment?.resist ?? 0,
        weaponDamage: equipment?.weaponDamage ?? 0,
        spellPower: equipment?.spellPower ?? 0
      }
    },
    mob: {
      templateKey: input.monster.monsterId,
      type: input.monsterType ?? inferMonsterType(input.monster),
      level: input.monster.level,
      ...(baseMonsterLevel !== undefined ? { baseLevel: baseMonsterLevel } : {}),
      ...(effectiveMonsterLevel !== undefined ? { effectiveLevel: effectiveMonsterLevel } : {}),
      difficultyTier: input.difficultyTier ?? inferDifficultyTier(input.monster),
      hpMax: input.monster.hpMax
    },
    totals: emptyTotals(),
    abilities: {}
  };
}

export function cloneCombatAnalyticsState(
  analytics: CombatAnalyticsStateV1
): CombatAnalyticsStateV1 {
  return {
    ...analytics,
    player: {
      ...analytics.player,
      stats: { ...analytics.player.stats },
      equipment: { ...analytics.player.equipment }
    },
    mob: { ...analytics.mob },
    totals: { ...analytics.totals },
    abilities: Object.fromEntries(
      Object.entries(analytics.abilities).map(([key, ability]) => [
        key,
        { ...ability }
      ])
    )
  };
}

export function recordCombatAnalyticsTurn(
  state: CombatState,
  summary: CombatTurnSummary
): CombatState {
  if (!state.analytics) {
    return state;
  }

  const analytics = cloneCombatAnalyticsState(state.analytics);
  const abilityKey = getAbilityKey(summary);
  const actionOrigin = summary.actionOrigin ?? "manual";
  const abilityRecordKey = getAbilityRecordKey(actionOrigin, abilityKey);
  const ability = analytics.abilities[abilityRecordKey] ?? emptyAbility(abilityKey, actionOrigin);
  const directHeroDamage = summary.enemyResults
    ? summary.enemyResults.reduce((sum, result) => sum + Math.max(0, result.damage), 0)
    : summary.heroDamage;
  const heroDamage = Math.max(0, directHeroDamage + (summary.heroCounterDamage ?? 0));
  const healing = Math.max(
    0,
    summary.allyResults?.reduce((sum, result) => sum + Math.max(0, result.healing ?? 0), 0) ??
      summary.heroHealing ??
      0
  );
  const monsterDamage = Math.max(0, summary.monsterDamage);

  ability.usesCount += 1;
  ability.successfulUsesCount += isSuccessfulHeroUse(summary) ? 1 : 0;
  ability.hitCount += isHeroHit(summary) ? 1 : 0;
  ability.critCount += summary.critical ? 1 : 0;
  ability.missCount += summary.heroOutcome === "miss" ? 1 : 0;
  ability.totalDamage += heroDamage;
  ability.totalHealing += healing;
  ability.resourceSpent += Math.max(0, summary.manaSpent);

  analytics.abilities[abilityRecordKey] = ability;
  analytics.totals.playerActionsCount += 1;
  if (actionOrigin === "manual") {
    analytics.totals.manualPlayerActionsCount += 1;
  } else if (actionOrigin === "timeout-auto-attack" || actionOrigin === "timeout-auto-defend") {
    analytics.totals.timeoutAutoActionsCount += 1;
  } else {
    analytics.totals.timeoutSkipActionsCount += 1;
  }
  analytics.totals.enemyActionsCount += summary.monsterAction ? 1 : 0;
  analytics.totals.damageDealt += heroDamage;
  analytics.totals.damageTaken += monsterDamage;
  analytics.totals.healingDone += healing;
  analytics.totals.criticalHits += summary.critical ? 1 : 0;
  analytics.totals.misses += summary.heroOutcome === "miss" ? 1 : 0;

  return {
    ...state,
    analytics
  };
}

export function mapCombatStatusToAnalyticsOutcome(
  status: CombatState["status"]
): CombatBalanceOutcome | null {
  switch (status) {
    case "won":
      return "win";
    case "lost":
      return "loss";
    case "fled":
      return "fled";
    case "expired":
      return "timeout";
    case "active":
      return null;
  }
}

export function mapCombatStateSourceToAnalyticsSource(
  source: CombatState["source"] | undefined
): CombatBalanceSource {
  switch (source) {
    case "adventure":
      return "adventure";
    case "yeger":
      return "yeger";
    case "training":
      return "training";
    case "normal":
      return "regular_mob";
    default:
      return "other";
  }
}

export function parseCombatAnalyticsState(value: unknown): CombatAnalyticsStateV1 | null {
  if (!isRecord(value) || value.version !== 1 || value.schemaVersion !== 1) {
    return null;
  }

  const player = parsePlayer(value.player);
  const mob = parseMob(value.mob);
  const totals = parseTotals(value.totals);

  if (
    typeof value.balanceVersion !== "string" ||
    typeof value.combatEngineVersion !== "string" ||
    typeof value.startedAt !== "string" ||
    !isCombatBalanceSource(value.combatSource) ||
    typeof value.isTestOrAdmin !== "boolean" ||
    typeof value.playerAnalysisKey !== "string" ||
    typeof value.characterId !== "string" ||
    !player ||
    !mob ||
    !totals
  ) {
    return null;
  }

  return {
    version: 1,
    schemaVersion: 1,
    balanceVersion: value.balanceVersion,
    combatEngineVersion: value.combatEngineVersion,
    startedAt: value.startedAt,
    combatSource: value.combatSource,
    isTestOrAdmin: value.isTestOrAdmin,
    playerAnalysisKey: value.playerAnalysisKey,
    characterId: value.characterId,
    player,
    mob,
    totals,
    abilities: parseAbilityRecord(value.abilities)
  };
}

function getAbilityKey(summary: CombatTurnSummary): string {
  if ((summary.action === "skill" || summary.action === "race") && summary.skillId) {
    return summary.skillId;
  }

  if (summary.action === "defend") {
    return summary.skillId ?? BASIC_DEFEND_ABILITY_ID;
  }

  if (summary.action === "flee") {
    return BASIC_FLEE_ABILITY_ID;
  }

  if (summary.action === "skip") {
    return SYSTEM_SKIP_ABILITY_ID;
  }

  if (summary.action === "item") {
    return summary.itemId ? `item:${summary.itemId}` : "item:unknown";
  }

  return BASIC_ATTACK_ABILITY_ID;
}

function emptyAbility(
  abilityKey: string,
  actionOrigin: CombatActionOrigin
): CombatAnalyticsAbilityAccumulatorV1 {
  return {
    abilityKey,
    actionOrigin,
    abilityRank: 0,
    isClassAbility: abilityKey.startsWith("skill."),
    usesCount: 0,
    successfulUsesCount: 0,
    hitCount: 0,
    critCount: 0,
    missCount: 0,
    totalDamage: 0,
    totalHealing: 0,
    resourceSpent: 0
  };
}

function getAbilityRecordKey(actionOrigin: CombatActionOrigin, abilityKey: string): string {
  return `${actionOrigin}:${abilityKey}`;
}

function isSuccessfulHeroUse(summary: CombatTurnSummary): boolean {
  return (
    summary.heroOutcome === "hit" ||
    summary.heroOutcome === "critical-hit" ||
    summary.heroOutcome === "won" ||
    summary.heroOutcome === "defended" ||
    summary.heroOutcome === "item-used" ||
    summary.heroOutcome === "fled"
  );
}

function isHeroHit(summary: CombatTurnSummary): boolean {
  return summary.heroOutcome === "hit" || summary.heroOutcome === "critical-hit" || summary.heroOutcome === "won";
}

function inferMonsterType(monster: MonsterCombatStats): string {
  if (monster.tags.includes("doppelganger")) {
    return "training_doppelganger";
  }

  if (monster.tags.includes("boss")) {
    return "boss_mob";
  }

  if (monster.tags.includes("elite")) {
    return "elite_mob";
  }

  return "regular_mob";
}

function inferDifficultyTier(monster: MonsterCombatStats): string {
  if (monster.debugTrace?.interventionKind === "help") {
    return "easy";
  }

  if (monster.debugTrace?.interventionKind === "hinder") {
    return "hard";
  }

  return "normal";
}

function emptyTotals(): CombatAnalyticsStateV1["totals"] {
  return {
    playerActionsCount: 0,
    manualPlayerActionsCount: 0,
    timeoutAutoActionsCount: 0,
    timeoutSkipActionsCount: 0,
    enemyActionsCount: 0,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    criticalHits: 0,
    misses: 0
  };
}

function parsePlayer(value: unknown): CombatAnalyticsStateV1["player"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const stats = parseStats(value.stats);
  const equipment = parseEquipment(value.equipment);
  const level = intOrNull(value.level);
  const remortCount = intOrNull(value.remortCount);
  const hpMax = intOrNull(value.hpMax);
  const hpAtStart = intOrNull(value.hpAtStart);
  const manaMax = intOrNull(value.manaMax);
  const manaAtStart = intOrNull(value.manaAtStart);

  if (
    typeof value.classKey !== "string" ||
    level === null ||
    remortCount === null ||
    hpMax === null ||
    hpAtStart === null ||
    manaMax === null ||
    manaAtStart === null ||
    !stats ||
    !equipment
  ) {
    return null;
  }

  return {
    classKey: value.classKey,
    level,
    remortCount,
    hpMax,
    hpAtStart,
    manaMax,
    manaAtStart,
    stats,
    equipment
  };
}

function parseMob(value: unknown): CombatAnalyticsStateV1["mob"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const level = intOrNull(value.level);
  const baseLevel = intOrNull(value.baseLevel);
  const effectiveLevel = intOrNull(value.effectiveLevel);
  const hpMax = intOrNull(value.hpMax);

  if (
    typeof value.templateKey !== "string" ||
    typeof value.type !== "string" ||
    typeof value.difficultyTier !== "string" ||
    level === null ||
    hpMax === null
  ) {
    return null;
  }

  return {
    templateKey: value.templateKey,
    type: value.type,
    level,
    ...(baseLevel !== null ? { baseLevel } : {}),
    ...(effectiveLevel !== null ? { effectiveLevel } : {}),
    difficultyTier: value.difficultyTier,
    hpMax
  };
}

function parseTotals(value: unknown): CombatAnalyticsStateV1["totals"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const totals = emptyTotals();
  const requiredKeys = [
    "playerActionsCount",
    "enemyActionsCount",
    "damageDealt",
    "damageTaken",
    "healingDone",
    "criticalHits",
    "misses"
  ] as const;
  for (const key of requiredKeys) {
    const parsed = intOrNull(value[key]);
    if (parsed === null) {
      return null;
    }
    totals[key] = parsed;
  }
  totals.manualPlayerActionsCount =
    intOrNull(value.manualPlayerActionsCount) ?? totals.playerActionsCount;
  totals.timeoutAutoActionsCount = intOrNull(value.timeoutAutoActionsCount) ?? 0;
  totals.timeoutSkipActionsCount = intOrNull(value.timeoutSkipActionsCount) ?? 0;

  return totals;
}

function parseAbilityRecord(value: unknown): CombatAnalyticsStateV1["abilities"] {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.values(value).flatMap((entry) => {
      const parsed = parseAbility(entry);
      return parsed ? [[getAbilityRecordKey(parsed.actionOrigin, parsed.abilityKey), parsed]] : [];
    })
  );
}

function parseAbility(value: unknown): CombatAnalyticsAbilityAccumulatorV1 | null {
  if (!isRecord(value) || typeof value.abilityKey !== "string") {
    return null;
  }

  const actionOrigin = parseActionOrigin(value.actionOrigin) ?? "manual";
  const numericKeys = [
    "abilityRank",
    "usesCount",
    "successfulUsesCount",
    "hitCount",
    "critCount",
    "missCount",
    "totalDamage",
    "totalHealing",
    "resourceSpent"
  ] as const;
  const numbers = Object.fromEntries(
    numericKeys.map((key) => [key, intOrNull(value[key])])
  ) as Record<(typeof numericKeys)[number], number | null>;

  if (numericKeys.some((key) => numbers[key] === null) || typeof value.isClassAbility !== "boolean") {
    return null;
  }

  return {
    abilityKey: value.abilityKey,
    actionOrigin,
    abilityRank: numbers.abilityRank!,
    isClassAbility: value.isClassAbility,
    usesCount: numbers.usesCount!,
    successfulUsesCount: numbers.successfulUsesCount!,
    hitCount: numbers.hitCount!,
    critCount: numbers.critCount!,
    missCount: numbers.missCount!,
    totalDamage: numbers.totalDamage!,
    totalHealing: numbers.totalHealing!,
    resourceSpent: numbers.resourceSpent!
  };
}

function parseActionOrigin(value: unknown): CombatActionOrigin | null {
  return value === "manual" ||
    value === "timeout-auto-attack" ||
    value === "timeout-auto-defend" ||
    value === "timeout-skip"
    ? value
    : null;
}

function parseStats(value: unknown): CharacterStats | null {
  if (!isRecord(value)) {
    return null;
  }

  const strength = intOrNull(value.strength);
  const dexterity = intOrNull(value.dexterity);
  const intelligence = intOrNull(value.intelligence);
  const charisma = intOrNull(value.charisma);
  const luck = intOrNull(value.luck);

  return strength === null ||
    dexterity === null ||
    intelligence === null ||
    charisma === null ||
    luck === null
    ? null
    : { strength, dexterity, intelligence, charisma, luck };
}

function parseEquipment(value: unknown): CombatAnalyticsStateV1["player"]["equipment"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const armor = intOrNull(value.armor);
  const resist = intOrNull(value.resist);
  const weaponDamage = intOrNull(value.weaponDamage);
  const spellPower = intOrNull(value.spellPower);

  return armor === null || resist === null || weaponDamage === null || spellPower === null
    ? null
    : { armor, resist, weaponDamage, spellPower };
}

function isCombatBalanceSource(value: unknown): value is CombatBalanceSource {
  return (
    value === "regular_mob" ||
    value === "adventure" ||
    value === "yeger" ||
    value === "training" ||
    value === "other"
  );
}

function intOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
