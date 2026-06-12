import { classes } from "../../content/classes";
import { races } from "../../content/races";

export type StatKey = "strength" | "dexterity" | "intelligence" | "charisma" | "luck";

export type CharacterStats = Record<StatKey, number>;

export interface StarterStats {
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  stats: CharacterStats;
}

const BASE_STATS: CharacterStats = {
  strength: 5,
  dexterity: 5,
  intelligence: 5,
  charisma: 5,
  luck: 5
};

const BASE_HP = 20;
const BASE_MANA = 10;
const CLASS_PRIMARY_STAT_BONUS = 2;

export function buildStarterStats(raceId: string, classId: string): StarterStats {
  const race = races.find((candidate) => candidate.id === raceId);
  const characterClass = classes.find((candidate) => candidate.id === classId);

  if (!race || !characterClass) {
    throw new Error("Cannot build starter stats for unknown race or class.");
  }

  const stats: CharacterStats = { ...BASE_STATS };

  for (const key of Object.keys(race.statBonus) as StatKey[]) {
    stats[key] += race.statBonus[key] ?? 0;
  }

  stats[characterClass.primaryStat] += CLASS_PRIMARY_STAT_BONUS;

  return {
    hpCurrent: BASE_HP,
    hpMax: BASE_HP,
    manaCurrent: BASE_MANA,
    manaMax: BASE_MANA,
    stats
  };
}
