import { classes } from "../../content/classes";
import type { CharacterStats, StatKey } from "../characters/starterStats";

export interface EffectiveCharacterStatsInput {
  level: number;
  classId: string;
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  stats: CharacterStats;
}

export interface LevelPrimaryStatBonus {
  stat: StatKey;
  bonus: number;
}

export interface LevelBonus {
  hpMax: number;
  manaMax: number;
  primaryStat?: LevelPrimaryStatBonus;
}

export interface EffectiveCharacterStats {
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  stats: CharacterStats;
  levelBonus: LevelBonus;
}

const HP_MAX_PER_LEVEL = 4;
const MANA_MAX_PER_LEVEL = 2;
const PRIMARY_STAT_PER_LEVEL = 1;

export function buildEffectiveCharacterStats(
  input: EffectiveCharacterStatsInput
): EffectiveCharacterStats {
  const levelBonus = buildLevelBonus(input.level, input.classId);
  const stats = { ...input.stats };

  if (levelBonus.primaryStat) {
    stats[levelBonus.primaryStat.stat] += levelBonus.primaryStat.bonus;
  }

  const hpMax = Math.max(1, Math.floor(input.hpMax) + levelBonus.hpMax);
  const manaMax = Math.max(0, Math.floor(input.manaMax) + levelBonus.manaMax);

  return {
    hpCurrent: hpMax,
    hpMax,
    manaCurrent: manaMax,
    manaMax,
    stats,
    levelBonus
  };
}

export function buildLevelGrowthBonus(
  oldLevel: number,
  newLevel: number,
  classId: string
): LevelBonus {
  const oldSafeLevel = normalizeLevel(oldLevel);
  const newSafeLevel = normalizeLevel(newLevel);
  const gainedLevels = Math.max(0, newSafeLevel - oldSafeLevel);
  const primaryStat = findPrimaryStat(classId);

  return {
    hpMax: gainedLevels * HP_MAX_PER_LEVEL,
    manaMax: gainedLevels * MANA_MAX_PER_LEVEL,
    ...(primaryStat
      ? {
          primaryStat: {
            stat: primaryStat,
            bonus: gainedLevels * PRIMARY_STAT_PER_LEVEL
          }
        }
      : {})
  };
}

function buildLevelBonus(level: number, classId: string): LevelBonus {
  const levelBonus = normalizeLevel(level) - 1;
  const primaryStat = findPrimaryStat(classId);

  return {
    hpMax: levelBonus * HP_MAX_PER_LEVEL,
    manaMax: levelBonus * MANA_MAX_PER_LEVEL,
    ...(primaryStat
      ? {
          primaryStat: {
            stat: primaryStat,
            bonus: levelBonus * PRIMARY_STAT_PER_LEVEL
          }
        }
      : {})
  };
}

function normalizeLevel(level: number): number {
  return Math.max(1, Math.floor(level));
}

function findPrimaryStat(classId: string): StatKey | undefined {
  return classes.find((candidate) => candidate.id === classId)?.primaryStat;
}
