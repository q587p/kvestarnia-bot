import { races } from "../../content/races";
import type { ItemEffectContent } from "../../content/schema";
import { buildPathStatBonus, type CharacterPath } from "../characters/path";
import type { CharacterStats, StatKey } from "../characters/starterStats";

export interface EffectiveCharacterStatsInput {
  level: number;
  classId: string;
  raceId?: string;
  path?: CharacterPath;
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
  stats: CharacterStats;
  primaryStat?: LevelPrimaryStatBonus | null;
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

export const HP_MAX_PER_LEVEL = 4;
export const MANA_MAX_PER_LEVEL = 2;

interface ClassGrowthProfile {
  weights: CharacterStats;
  priority: readonly StatKey[];
}

const classGrowthProfiles: Record<string, ClassGrowthProfile> = {
  "class.warrior": {
    weights: { strength: 10, dexterity: 4, intelligence: 2, charisma: 2, luck: 4 },
    priority: ["strength", "dexterity", "luck", "charisma", "intelligence"]
  },
  "class.mage": {
    weights: { strength: 2, dexterity: 4, intelligence: 10, charisma: 2, luck: 4 },
    priority: ["intelligence", "dexterity", "luck", "charisma", "strength"]
  },
  "class.bard": {
    weights: { strength: 2, dexterity: 2, intelligence: 4, charisma: 10, luck: 4 },
    priority: ["charisma", "intelligence", "luck", "dexterity", "strength"]
  },
  "class.rogue": {
    weights: { strength: 4, dexterity: 10, intelligence: 2, charisma: 2, luck: 4 },
    priority: ["dexterity", "luck", "strength", "intelligence", "charisma"]
  },
  "class.priest": {
    weights: { strength: 4, dexterity: 2, intelligence: 4, charisma: 10, luck: 2 },
    priority: ["charisma", "intelligence", "strength", "luck", "dexterity"]
  },
  "class.varenyk-mancer": {
    weights: { strength: 2, dexterity: 2, intelligence: 10, charisma: 4, luck: 4 },
    priority: ["intelligence", "charisma", "luck", "dexterity", "strength"]
  },
  "class.bureaucramancer": {
    weights: { strength: 2, dexterity: 4, intelligence: 10, charisma: 4, luck: 2 },
    priority: ["intelligence", "charisma", "dexterity", "luck", "strength"]
  },
  "class.ranger": {
    weights: { strength: 4, dexterity: 10, intelligence: 2, charisma: 2, luck: 4 },
    priority: ["dexterity", "luck", "strength", "intelligence", "charisma"]
  },
  "class.kharakternyk": {
    weights: { strength: 2, dexterity: 4, intelligence: 2, charisma: 4, luck: 10 },
    priority: ["luck", "dexterity", "charisma", "intelligence", "strength"]
  }
};

const fallbackGrowthProfile: ClassGrowthProfile = {
  weights: { strength: 2, dexterity: 2, intelligence: 2, charisma: 2, luck: 2 },
  priority: ["strength", "dexterity", "intelligence", "charisma", "luck"]
};

export function buildEffectiveCharacterStats(
  input: EffectiveCharacterStatsInput
): EffectiveCharacterStats {
  const pathBonus = input.path ? buildPathStatBonus(input.path) : createEmptyStats();
  const levelBonus = buildLevelBonus(input.level, input.classId, input.raceId, input.path);
  const equipmentEffects = buildEquipmentEffectSummary(input.equipment ?? []);
  const stats = { ...input.stats };

  for (const stat of statKeys) {
    stats[stat] += pathBonus[stat];
    stats[stat] += levelBonus.stats[stat];
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
  classId: string,
  raceId?: string,
  path?: CharacterPath
): LevelBonus {
  const oldSafeLevel = normalizeLevel(oldLevel);
  const newSafeLevel = normalizeLevel(newLevel);
  const gainedLevels = Math.max(0, newSafeLevel - oldSafeLevel);
  const oldStats = buildDistributedLevelStats(oldSafeLevel, classId, raceId, path);
  const newStats = buildDistributedLevelStats(newSafeLevel, classId, raceId, path);

  return {
    hpMax: gainedLevels * HP_MAX_PER_LEVEL,
    manaMax: gainedLevels * MANA_MAX_PER_LEVEL,
    stats: subtractStats(newStats, oldStats)
  };
}

export function getClassPrimaryStat(classId: string): StatKey {
  return (classGrowthProfiles[classId] ?? fallbackGrowthProfile).priority[0] ?? "strength";
}

function buildLevelBonus(
  level: number,
  classId: string,
  raceId?: string,
  path?: CharacterPath
): LevelBonus {
  const safeLevel = normalizeLevel(level);
  const gainedLevels = safeLevel - 1;

  return {
    hpMax: gainedLevels * HP_MAX_PER_LEVEL,
    manaMax: gainedLevels * MANA_MAX_PER_LEVEL,
    stats: buildDistributedLevelStats(safeLevel, classId, raceId, path)
  };
}

function buildDistributedLevelStats(
  level: number,
  classId: string,
  raceId?: string,
  path?: CharacterPath
): CharacterStats {
  const points = Math.max(0, normalizeLevel(level) - 1);
  const profile = classGrowthProfiles[classId] ?? fallbackGrowthProfile;
  const weights = buildCombinedGrowthWeights(profile, raceId, path);
  const scores = createEmptyStats();
  const stats = createEmptyStats();
  const totalWeight = statKeys.reduce((sum, stat) => sum + weights[stat], 0);
  const priority = new Map(profile.priority.map((stat, index) => [stat, index]));

  if (points <= 0 || totalWeight <= 0) {
    return stats;
  }

  for (let point = 0; point < points; point += 1) {
    for (const stat of statKeys) {
      scores[stat] += weights[stat];
    }

    const selected = statKeys.reduce((best, candidate) => {
      if (scores[candidate] > scores[best]) {
        return candidate;
      }

      if (
        scores[candidate] === scores[best] &&
        (priority.get(candidate) ?? statKeys.length) < (priority.get(best) ?? statKeys.length)
      ) {
        return candidate;
      }

      return best;
    });

    stats[selected] += 1;
    scores[selected] -= totalWeight;
  }

  return stats;
}

function buildCombinedGrowthWeights(
  profile: ClassGrowthProfile,
  raceId?: string,
  path?: CharacterPath
): CharacterStats {
  const race = races.find((candidate) => candidate.id === raceId);
  const pathBonus = path ? buildPathStatBonus(path) : createEmptyStats();

  return statKeys.reduce<CharacterStats>((weights, stat) => {
    weights[stat] = Math.max(
      0,
      Math.floor(profile.weights[stat] + (race?.statBonus[stat] ?? 0) + pathBonus[stat])
    );
    return weights;
  }, createEmptyStats());
}

function subtractStats(left: CharacterStats, right: CharacterStats): CharacterStats {
  return statKeys.reduce<CharacterStats>((stats, stat) => {
    stats[stat] = left[stat] - right[stat];
    return stats;
  }, createEmptyStats());
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

const statKeys: readonly StatKey[] = [
  "strength",
  "dexterity",
  "intelligence",
  "charisma",
  "luck"
];

function createEmptyStats(): CharacterStats {
  return {
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    charisma: 0,
    luck: 0
  };
}
