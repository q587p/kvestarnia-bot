import type { CharacterSummary } from "../characters/characterSummary";
import type { CharacterStats, StatKey } from "../characters/starterStats";
import {
  buildLevelGrowthBonus,
  type EquipmentEffectSummary
} from "../progression/effectiveStats";
import { buildRemortMemoryBonus, REMORT_REQUIRED_LEVEL } from "../remort";

export const INSTANT_DUEL_BALANCE_VERSION = "instant-duel-v2";

export interface DuelistBalanceInput extends CharacterSummary {
  id: string;
}

export interface DuelProgressionBudget {
  level: number;
  remortCount: number;
  hpMax: number;
  manaMax: number;
  stats: CharacterStats;
  score: number;
}

export interface DuelistBalanceAudit {
  balanceVersion: string;
  originalLevel: number;
  originalRemortCount: number;
  effectiveCombatLevel: number;
  progressionBudget: DuelProgressionBudget;
  targetProgressionBudget: DuelProgressionBudget;
  temporaryHpMax: number;
  temporaryManaMax: number;
  temporaryStats: CharacterStats;
  readinessPenalty: number;
  preparedScore: number;
}

export interface PreparedDuelist extends DuelistBalanceInput {
  balanceAudit: DuelistBalanceAudit;
}

export interface PreparedDuelists {
  challenger: PreparedDuelist;
  target: PreparedDuelist;
  balanceVersion: string;
}

export function prepareBalancedDuelists(input: {
  challenger: DuelistBalanceInput;
  target: DuelistBalanceInput;
}): PreparedDuelists {
  const challengerBudget = buildProgressionBudget(input.challenger);
  const targetBudget = buildProgressionBudget(input.target);
  const targetTierBudget =
    challengerBudget.score >= targetBudget.score ? challengerBudget : targetBudget;
  const challengerTargetBudget = buildProgressionBudget(input.challenger, targetTierBudget);
  const targetTargetBudget = buildProgressionBudget(input.target, targetTierBudget);

  const challenger = prepareDuelist(input.challenger, challengerBudget, challengerTargetBudget);
  const target = prepareDuelist(input.target, targetBudget, targetTargetBudget);

  return {
    challenger,
    target,
    balanceVersion: INSTANT_DUEL_BALANCE_VERSION
  };
}

export function calculateReadinessPenalty(input: {
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
}): number {
  const hpMax = Math.max(1, Math.floor(input.hpMax));
  const manaMax = Math.max(0, Math.floor(input.manaMax));
  const hpMissingRatio = 1 - clampRatio(input.hpCurrent / hpMax);
  const manaMissingRatio = manaMax <= 0 ? 0 : 1 - clampRatio(input.manaCurrent / manaMax);

  return Math.round(clamp(0, 12, hpMissingRatio * 8 + manaMissingRatio * 4));
}

function prepareDuelist(
  character: DuelistBalanceInput,
  budget: DuelProgressionBudget,
  targetBudget: DuelProgressionBudget
): PreparedDuelist {
  const temporaryHpMax = Math.max(0, targetBudget.hpMax - budget.hpMax);
  const temporaryManaMax = Math.max(0, targetBudget.manaMax - budget.manaMax);
  const temporaryStats = subtractStats(targetBudget.stats, budget.stats);
  const hpMax = character.hpMax + temporaryHpMax;
  const manaMax = character.manaMax + temporaryManaMax;
  const hpCurrent = preserveRatio(character.hpCurrent, character.hpMax, hpMax);
  const manaCurrent = preserveRatio(character.manaCurrent, character.manaMax, manaMax);
  const stats = addStats(character.stats, temporaryStats);
  const prepared: PreparedDuelist = {
    ...character,
    hpCurrent,
    hpMax,
    manaCurrent,
    manaMax,
    stats,
    balanceAudit: {
      balanceVersion: INSTANT_DUEL_BALANCE_VERSION,
      originalLevel: character.level,
      originalRemortCount: character.remortCount ?? 0,
      effectiveCombatLevel: targetBudget.level,
      progressionBudget: budget,
      targetProgressionBudget: targetBudget,
      temporaryHpMax,
      temporaryManaMax,
      temporaryStats,
      readinessPenalty: calculateReadinessPenalty({
        hpCurrent,
        hpMax,
        manaCurrent,
        manaMax
      }),
      preparedScore: 0
    }
  };

  prepared.balanceAudit.preparedScore = scorePreparedDuelist(prepared);

  return prepared;
}

export function scorePreparedDuelist(character: PreparedDuelist): number {
  const stats = character.stats;
  const effects = character.equipmentEffects;

  return Math.round(
    character.balanceAudit.targetProgressionBudget.score * 0.7 +
      character.hpMax * 0.18 +
      character.manaMax * 0.08 +
      stats.strength * 1.2 +
      stats.dexterity * 1.15 +
      stats.intelligence * 0.85 +
      stats.charisma * 0.8 +
      stats.luck * 0.9 +
      equipmentScore(effects) -
      character.balanceAudit.readinessPenalty
  );
}

function buildProgressionBudget(
  character: DuelistBalanceInput,
  tier?: Partial<Pick<DuelProgressionBudget, "level" | "remortCount">>
): DuelProgressionBudget {
  const level = Math.max(1, Math.floor(tier?.level ?? character.level));
  const remortCount = Math.max(0, Math.floor(tier?.remortCount ?? character.remortCount ?? 0));
  const levelGrowth = buildLevelGrowthBonus(
    1,
    level,
    character.classId,
    character.raceId,
    character.path
  );
  const remortGrowth = buildLevelGrowthBonus(
    1,
    REMORT_REQUIRED_LEVEL,
    character.classId,
    character.raceId,
    character.path
  );
  const hpMax = levelGrowth.hpMax + buildRemortMemoryBonus(remortGrowth.hpMax, remortCount);
  const manaMax =
    levelGrowth.manaMax + buildRemortMemoryBonus(remortGrowth.manaMax, remortCount);
  const stats = statKeys.reduce<CharacterStats>((budgetStats, stat) => {
    budgetStats[stat] =
      levelGrowth.stats[stat] + buildRemortMemoryBonus(remortGrowth.stats[stat], remortCount);
    return budgetStats;
  }, createEmptyStats());
  const score = scoreProgressionBudget({ hpMax, manaMax, stats });

  return {
    level,
    remortCount,
    hpMax,
    manaMax,
    stats,
    score
  };
}

function preserveRatio(current: number, oldMax: number, newMax: number): number {
  const safeNewMax = Math.max(0, Math.floor(newMax));

  if (safeNewMax <= 0) {
    return 0;
  }

  const safeOldMax = Math.max(1, Math.floor(oldMax));
  const ratio = clampRatio(current / safeOldMax);

  return Math.min(safeNewMax, Math.max(0, Math.round(ratio * safeNewMax)));
}

function scoreProgressionBudget(input: Pick<DuelProgressionBudget, "hpMax" | "manaMax" | "stats">): number {
  return Math.round(
    input.hpMax * 0.18 +
      input.manaMax * 0.08 +
      input.stats.strength * 1.2 +
      input.stats.dexterity * 1.15 +
      input.stats.intelligence * 0.85 +
      input.stats.charisma * 0.8 +
      input.stats.luck * 0.9
  );
}

function addStats(left: CharacterStats, right: CharacterStats): CharacterStats {
  return statKeys.reduce<CharacterStats>((stats, stat) => {
    stats[stat] = left[stat] + Math.max(0, right[stat]);
    return stats;
  }, createEmptyStats());
}

function subtractStats(left: CharacterStats, right: CharacterStats): CharacterStats {
  return statKeys.reduce<CharacterStats>((stats, stat) => {
    stats[stat] = Math.max(0, left[stat] - right[stat]);
    return stats;
  }, createEmptyStats());
}

function equipmentScore(effects: EquipmentEffectSummary | undefined): number {
  return (
    (effects?.weaponDamage ?? 0) * 2.2 +
    (effects?.armor ?? 0) * 1.7 +
    (effects?.spellPower ?? 0) * 1.9 +
    (effects?.resist ?? 0) * 1.2
  );
}

function clampRatio(value: number): number {
  return Number.isFinite(value) ? clamp(0, 1, value) : 0;
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createEmptyStats(): CharacterStats {
  return {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    charisma: 0,
    luck: 0
  };
}

const statKeys: readonly StatKey[] = [
  "strength",
  "dexterity",
  "intelligence",
  "charisma",
  "luck"
];
