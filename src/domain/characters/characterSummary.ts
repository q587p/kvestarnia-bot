import { classes } from "../../content/classes";
import { getComboTitle, getPronounLabel, isPronoun } from "../../content/characterOptions";
import { races } from "../../content/races";
import type { ItemContent, Pronoun } from "../../content/schema";
import {
  buildEffectiveCharacterStats,
  type EquipmentEffectSummary,
  type LevelBonus
} from "../progression/effectiveStats";
import type { ResourceRecoveryEstimate } from "../resources/resourceRegeneration";
import { getLevelForXp, getNextLevelThreshold } from "../progression/level";
import { getCharacterPath, type CharacterPath } from "./path";
import type { CharacterStats } from "./starterStats";

export interface CharacterSummary {
  name: string;
  pronoun: Pronoun;
  pronounLabel: string;
  path: CharacterPath;
  currentLocationId?: string | null;
  raceId: string;
  raceName: string;
  classId: string;
  className: string;
  title: string;
  level: number;
  xp: number;
  nextLevelXp: number | null;
  xpToNextLevel: number | null;
  gold: number;
  hpCurrent: number;
  hpMax: number;
  manaCurrent: number;
  manaMax: number;
  resourceRecovery?: ResourceRecoveryEstimate;
  stats: CharacterStats;
  levelBonus: LevelBonus;
  equipmentEffects?: EquipmentEffectSummary;
}

export interface CharacterSummaryInput {
  name: string;
  pronoun?: string;
  path?: string;
  currentLocationId?: string | null;
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

export interface CharacterSummaryOptions {
  equippedItems?: ItemContent[];
  resourceRecovery?: ResourceRecoveryEstimate;
}

export function summarizeCharacter(
  input: CharacterSummaryInput,
  options: CharacterSummaryOptions = {}
): CharacterSummary {
  const race = races.find((candidate) => candidate.id === input.raceId);
  const characterClass = classes.find((candidate) => candidate.id === input.classId);
  const pronoun = parsePronoun(input.pronoun);
  const xp = Math.max(0, Math.floor(input.xp));
  const level = Math.max(1, Math.floor(input.level), getLevelForXp(xp));
  const nextLevelXp = getNextLevelThreshold(level);
  const effectiveStats = buildEffectiveCharacterStats({
    level,
    classId: input.classId,
    hpCurrent: input.hpCurrent,
    hpMax: input.hpMax,
    manaCurrent: input.manaCurrent,
    manaMax: input.manaMax,
    stats: parseStats(input.statsJson),
    equipment: (options.equippedItems ?? []).map((item) => ({
      itemId: item.id,
      itemName: item.name,
      ...(item.effect ? { effect: item.effect } : {})
    }))
  });

  return {
    name: input.name,
    pronoun,
    pronounLabel: getPronounLabel(pronoun),
    path: getCharacterPath({ path: input.path, pronoun }),
    currentLocationId: input.currentLocationId ?? null,
    raceId: input.raceId,
    raceName: race?.name ?? input.raceId,
    classId: input.classId,
    className: characterClass?.name ?? input.classId,
    title: getComboTitle(input.raceId, input.classId, pronoun),
    level,
    xp,
    nextLevelXp,
    xpToNextLevel: nextLevelXp === null ? null : Math.max(0, nextLevelXp - xp),
    gold: input.gold,
    hpCurrent: effectiveStats.hpCurrent,
    hpMax: effectiveStats.hpMax,
    manaCurrent: effectiveStats.manaCurrent,
    manaMax: effectiveStats.manaMax,
    ...(options.resourceRecovery ? { resourceRecovery: options.resourceRecovery } : {}),
    stats: effectiveStats.stats,
    levelBonus: effectiveStats.levelBonus,
    equipmentEffects: effectiveStats.equipmentEffects
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
