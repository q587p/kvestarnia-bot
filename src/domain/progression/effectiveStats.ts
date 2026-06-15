import { classes } from "../../content/classes";
import type { ItemEffectContent } from "../../content/schema";
import type { CharacterStats, StatKey } from "../characters/starterStats";

export interface EffectiveCharacterStatsInput {
  level: number;
  classId: string;
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  stats: CharacterStats;
  equipment?: EquipmentEffectSource[];
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
  equipmentEffects: EquipmentEffectSummary;
}

export interface EquipmentEffectSource {
  itemId: string;
  itemName: string;
  effect?: ItemEffectContent;
}

export interface EquipmentEffectContribution {
  itemId: string;
  itemName: string;
  effect: ItemEffectContent;
}

export interface EquipmentEffectSummary {
  hpMax: number;
  manaMax: number;
  armor: number;
  resist: number;
  weaponDamage: number;
  spellPower: number;
  stats: CharacterStats;
  contributions: EquipmentEffectContribution[];
}

const HP_MAX_PER_LEVEL = 4;
const MANA_MAX_PER_LEVEL = 2;
const PRIMARY_STAT_PER_LEVEL = 1;

export function buildEffectiveCharacterStats(
  input: EffectiveCharacterStatsInput
): EffectiveCharacterStats {
  const levelBonus = buildLevelBonus(input.level, input.classId);
  const equipmentEffects = buildEquipmentEffectSummary(input.equipment ?? []);
  const stats = { ...input.stats };

  if (levelBonus.primaryStat) {
    stats[levelBonus.primaryStat.stat] += levelBonus.primaryStat.bonus;
  }

  for (const stat of statKeys) {
    stats[stat] += equipmentEffects.stats[stat];
  }

  const hpMax = Math.max(1, Math.floor(input.hpMax) + levelBonus.hpMax + equipmentEffects.hpMax);
  const manaMax = Math.max(
    0,
    Math.floor(input.manaMax) + levelBonus.manaMax + equipmentEffects.manaMax
  );

  return {
    hpCurrent: clampResource(input.hpCurrent, hpMax),
    hpMax,
    manaCurrent: clampResource(input.manaCurrent, manaMax),
    manaMax,
    stats,
    levelBonus,
    equipmentEffects
  };
}

export function buildEquipmentEffectSummary(
  sources: EquipmentEffectSource[]
): EquipmentEffectSummary {
  const summary = createEmptyEquipmentEffectSummary();

  for (const source of sources) {
    if (!source.effect) {
      continue;
    }

    summary.contributions.push({
      itemId: source.itemId,
      itemName: source.itemName,
      effect: source.effect
    });
    summary.hpMax += source.effect.hpMax ?? 0;
    summary.manaMax += source.effect.manaMax ?? 0;
    summary.armor += source.effect.armor ?? 0;
    summary.resist += source.effect.resist ?? 0;
    summary.weaponDamage += source.effect.weaponDamage ?? 0;
    summary.spellPower += source.effect.spellPower ?? 0;

    for (const stat of statKeys) {
      summary.stats[stat] += source.effect[stat] ?? 0;
    }
  }

  return summary;
}

export function createEmptyEquipmentEffectSummary(): EquipmentEffectSummary {
  return {
    hpMax: 0,
    manaMax: 0,
    armor: 0,
    resist: 0,
    weaponDamage: 0,
    spellPower: 0,
    stats: {
      strength: 0,
      dexterity: 0,
      intelligence: 0,
      charisma: 0,
      luck: 0
    },
    contributions: []
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

function clampResource(current: number, max: number): number {
  const safeMax = Math.max(0, Math.floor(max));

  if (safeMax === 0) {
    return 0;
  }

  return Math.min(safeMax, Math.max(0, Math.floor(current)));
}

function findPrimaryStat(classId: string): StatKey | undefined {
  return classes.find((candidate) => candidate.id === classId)?.primaryStat;
}

const statKeys: readonly StatKey[] = [
  "strength",
  "dexterity",
  "intelligence",
  "charisma",
  "luck"
];
