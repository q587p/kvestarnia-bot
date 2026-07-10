import type { MonsterContent } from "../../content/schema";
import type { MonsterCombatStats } from "./combatState";

export interface MonsterCombatStatsOptions {
  remortCount?: number;
  remortPressureMode?: "single" | "multi";
  remortPressureFreeRanks?: number;
}

const DEFAULT_REMORT_PRESSURE_FREE_RANKS = 3;

export function deriveMonsterCombatStats(
  monster: MonsterContent,
  options: MonsterCombatStatsOptions = {}
): MonsterCombatStats {
  const tags = [...monster.tags];
  const level = Math.max(1, Math.floor(monster.level));
  const pressureRank = getRemortMonsterPressureRank(
    options.remortCount ?? 0,
    options.remortPressureFreeRanks ?? DEFAULT_REMORT_PRESSURE_FREE_RANKS
  );
  const statLevel = buildRemortMonsterStatLevel(
    level,
    pressureRank,
    options.remortPressureMode ?? "single"
  );
  const highTierLevel = Math.max(0, statLevel - 4);
  const lateTierLevel = Math.max(0, statLevel - 7);
  const earlyLevel = Math.min(statLevel, 5);
  const levelsAfterEarly = Math.max(0, statLevel - 5);
  const boundedAttackLevel = earlyLevel + Math.floor(earlyLevel / 2) + Math.floor(levelsAfterEarly * 0.5);
  const boundedHp = statLevel <= 5
    ? 10 + statLevel * 4 + Math.floor(highTierLevel / 2)
    : 30 + levelsAfterEarly * 3 + Math.floor(highTierLevel / 3) + Math.floor(lateTierLevel / 3);
  const remortPressure = buildRemortMonsterPressure(
    level,
    pressureRank,
    options.remortPressureMode ?? "single"
  );

  return {
    monsterId: monster.id,
    name: monster.name,
    level,
    hpMax: boundedHp + tagHpBonus(tags) + remortPressure.hpMax,
    attack: 2 + boundedAttackLevel + tagAttackBonus(tags) + remortPressure.attack,
    armor: Math.floor(level / 4) + Math.floor(highTierLevel / 6) + tagArmorBonus(tags) + remortPressure.armor,
    resist: Math.floor(level / 4) + Math.floor(highTierLevel / 6) + tagResistBonus(tags) + remortPressure.resist,
    dexterity:
      5 + Math.min(level, 8) + Math.floor(Math.max(0, level - 8) / 2) + tagDexterityBonus(tags) + remortPressure.dexterity,
    tags
  };
}

function getRemortMonsterPressureRank(remortCount: number, freeRanks: number): number {
  return Math.max(
    0,
    Math.floor(remortCount) - Math.max(0, Math.floor(freeRanks))
  );
}

function buildRemortMonsterStatLevel(
  level: number,
  pressureRank: number,
  mode: NonNullable<MonsterCombatStatsOptions["remortPressureMode"]>
): number {
  if (pressureRank <= 0 || mode === "multi") {
    return level;
  }

  return Math.min(23, level + pressureRank * 2);
}

function buildRemortMonsterPressure(
  level: number,
  pressureRank: number,
  mode: NonNullable<MonsterCombatStatsOptions["remortPressureMode"]>
): {
  hpMax: number;
  attack: number;
  armor: number;
  resist: number;
  dexterity: number;
} {
  if (pressureRank <= 0) {
    return { hpMax: 0, attack: 0, armor: 0, resist: 0, dexterity: 0 };
  }

  if (mode === "single") {
    return {
      hpMax: pressureRank * 3 + Math.ceil(pressureRank / 2),
      attack: Math.ceil(pressureRank / 2),
      armor: 0,
      resist: 0,
      dexterity: 0
    };
  }

  const multiPressureRank = Math.min(pressureRank, 5);

  return {
    hpMax: multiPressureRank * Math.max(8, level),
    attack: multiPressureRank,
    armor: 0,
    resist: 0,
    dexterity: 0
  };
}

function tagHpBonus(tags: string[]): number {
  let bonus = 0;

  if (tags.includes("boss")) {
    bonus += 12;
  }

  if (tags.includes("mini-boss") || tags.includes("tiny-boss")) {
    bonus += 4;
  }

  if (tags.includes("swarm")) {
    bonus += 3;
  }

  return bonus;
}

function tagAttackBonus(tags: string[]): number {
  let bonus = 0;

  if (tags.includes("dragon") || tags.includes("fire")) {
    bonus += 2;
  }

  if (tags.includes("boss")) {
    bonus += 2;
  }

  if (tags.includes("mini-boss") || tags.includes("tiny-boss")) {
    bonus += 1;
  }

  return bonus;
}

function tagArmorBonus(tags: string[]): number {
  return countMatching(tags, ["armor", "stone", "construct", "knight"]);
}

function tagResistBonus(tags: string[]): number {
  return countMatching(tags, ["ghost", "undead", "cursed", "mind"]);
}

function tagDexterityBonus(tags: string[]): number {
  return countMatching(tags, ["beast", "insect", "mobility", "trickster"]);
}

function countMatching(tags: string[], needles: string[]): number {
  return needles.reduce((total, needle) => total + (tags.includes(needle) ? 1 : 0), 0);
}
