import { classes } from "../../content/classes";
import { getComboTitle, getPronounLabel, isPronoun } from "../../content/characterOptions";
import { races } from "../../content/races";
import type { Pronoun } from "../../content/schema";
import type { CharacterStats } from "./starterStats";

export interface CharacterSummary {
  name: string;
  pronoun: Pronoun;
  pronounLabel: string;
  raceId: string;
  raceName: string;
  classId: string;
  className: string;
  title: string;
  level: number;
  xp: number;
  gold: number;
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  stats: CharacterStats;
}

export interface CharacterSummaryInput {
  name: string;
  pronoun?: string;
  raceId: string;
  classId: string;
  level: number;
  xp: number;
  gold: number;
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  statsJson: unknown;
}

export function summarizeCharacter(input: CharacterSummaryInput): CharacterSummary {
  const race = races.find((candidate) => candidate.id === input.raceId);
  const characterClass = classes.find((candidate) => candidate.id === input.classId);
  const pronoun = parsePronoun(input.pronoun);

  return {
    name: input.name,
    pronoun,
    pronounLabel: getPronounLabel(pronoun),
    raceId: input.raceId,
    raceName: race?.name ?? input.raceId,
    classId: input.classId,
    className: characterClass?.name ?? input.classId,
    title: getComboTitle(input.raceId, input.classId),
    level: input.level,
    xp: input.xp,
    gold: input.gold,
    hpCurrent: input.hpCurrent,
    hpMax: input.hpMax,
    manaCurrent: input.manaCurrent,
    manaMax: input.manaMax,
    stats: parseStats(input.statsJson)
  };
}

function parsePronoun(value: string | undefined): Pronoun {
  return isPronoun(value) ? value : "they";
}

function parseStats(value: unknown): CharacterStats {
  if (!value || typeof value !== "object") {
    return {
      strength: 0,
      dexterity: 0,
      intelligence: 0,
      charisma: 0,
      luck: 0
    };
  }

  const maybeStats = value as Partial<Record<keyof CharacterStats, unknown>>;

  return {
    strength: numberOrZero(maybeStats.strength),
    dexterity: numberOrZero(maybeStats.dexterity),
    intelligence: numberOrZero(maybeStats.intelligence),
    charisma: numberOrZero(maybeStats.charisma),
    luck: numberOrZero(maybeStats.luck)
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
