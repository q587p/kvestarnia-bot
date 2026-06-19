import type { CharacterSummary } from "../characters/characterSummary";
import type { CharacterStats, StatKey } from "../characters/starterStats";
import {
  buildLevelGrowthBonus,
  getClassPrimaryStat,
  type EquipmentEffectSummary
} from "../progression/effectiveStats";
import { REMORT_REQUIRED_LEVEL } from "../remort";

export const INSTANT_DUEL_BALANCE_VERSION = "instant-duel-v2";

export interface DuelistBalanceInput extends CharacterSummary {
  id: string;
}

export interface DuelProgressionBudget {
  hpMax: number;
  manaMax: number;
  primaryStat: number;
  score: number;
}

export interface DuelistBalanceAudit {
  balanceVersion: string;
  originalLevel: number;
  originalRemortCount: number;
  primaryStat: StatKey;
  progressionBudget: DuelProgressionBudget;
  targetProgressionBudget: DuelProgressionBudget;
  temporaryHpMax: number;
  temporaryManaMax: number;
  temporaryPrimaryStat: number;
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

const REMORT_MEMORY_RATE = 0.23;

export function prepareBalancedDuelists(input: {
  challenger: DuelistBalanceInput;
  target: DuelistBalanceInput;
}): PreparedDuelists {
  const challengerBudget = buildProgressionBudget(input.challenger);
  const targetBudget = buildProgressionBudget(input.target);
  const targetProgressionBudget =
    challengerBudget.score >= targetBudget.score ? challengerBudget : targetBudget;

  const challenger = prepareDuelist(input.challenger, challengerBudget, targetProgressionBudget);
  const target = prepareDuelist(input.target, targetBudget, targetProgressionBudget);

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
  const primaryStat = getClassPrimaryStat(character.classId);
  const temporaryHpMax = Math.max(0, targetBudget.hpMax - budget.hpMax);
  const temporaryManaMax = Math.max(0, targetBudget.manaMax - budget.manaMax);
  const temporaryPrimaryStat = Math.max(0, targetBudget.primaryStat - budget.primaryStat);
  const hpMax = character.hpMax + temporaryHpMax;
  const manaMax = character.manaMax + temporaryManaMax;
  const hpCurrent = preserveRatio(character.hpCurrent, character.hpMax, hpMax);
  const manaCurrent = preserveRatio(character.manaCurrent, character.manaMax, manaMax);
  const stats = {
    ...character.stats,
    [primaryStat]: character.stats[primaryStat] + temporaryPrimaryStat
  };
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
      primaryStat,
      progressionBudget: budget,
      targetProgressionBudget: targetBudget,
      temporaryHpMax,
      temporaryManaMax,
      temporaryPrimaryStat,
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

function buildProgressionBudget(character: DuelistBalanceInput): DuelProgressionBudget {
  const primaryStat = getClassPrimaryStat(character.classId);
  const levelGrowth = buildLevelGrowthBonus(
    1,
    character.level,
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
  const remortCount = Math.max(0, Math.floor(character.remortCount ?? 0));
  const hpMax = levelGrowth.hpMax + buildRemortMemoryBudget(remortGrowth.hpMax, remortCount);
  const manaMax =
    levelGrowth.manaMax + buildRemortMemoryBudget(remortGrowth.manaMax, remortCount);
  const primary =
    levelGrowth.stats[primaryStat] +
    buildRemortMemoryBudget(remortGrowth.stats[primaryStat], remortCount);
  const score = Math.round(hpMax * 0.18 + manaMax * 0.08 + primary * 1.2);

  return {
    hpMax,
    manaMax,
    primaryStat: primary,
    score
  };
}

function buildRemortMemoryBudget(previousBonus: number, remortCount: number): number {
  if (previousBonus <= 0 || remortCount <= 0) {
    return 0;
  }

  return Math.ceil(previousBonus * REMORT_MEMORY_RATE * remortCount);
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
