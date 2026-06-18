import { classes } from "../content/classes";
import {
  getClassUnavailableReason,
  getPronounLabel,
  getRaceUnavailableReason,
  isClassAvailableForChoice,
  isPronoun,
  isRaceAvailableForPronoun
} from "../content/characterOptions";
import { activeRaces } from "../content/races";
import type { ItemContent, Pronoun } from "../content/schema";
import type { CharacterPath } from "./characters/path";
import { buildStarterStats, type CharacterStats, type StatKey } from "./characters/starterStats";
import { buildLevelGrowthBonus } from "./progression/effectiveStats";

export const REMORT_REQUIRED_LEVEL = 13;
export const REMORT_MAX_PRESERVED_ITEMS = 5;
export const REMORT_DRAFT_TTL_MS = 30 * 60_000;
const REMORT_MEMORY_BONUS_RATE = 0.23;

export interface RemortIdentitySelection {
  pronoun: Pronoun;
  raceId: string;
  classId: string;
}

export interface RemortItemSelection {
  itemId: string;
}

export interface RemortPreservableItem {
  itemId: string;
  name: string;
  quantity: number;
}

export interface RemortStatBonus {
  stat: StatKey;
  bonus: number;
}

export type RemortIdentityValidationResult =
  | { ok: true; identity: RemortIdentitySelection }
  | { ok: false; reason: string };

export function validateRemortIdentity(input: {
  pronoun: string;
  raceId: string;
  classId: string;
}): RemortIdentityValidationResult {
  if (!isPronoun(input.pronoun)) {
    return { ok: false, reason: "Канцелярія не впізнала звертання." };
  }

  if (!activeRaces.some((race) => race.id === input.raceId)) {
    return { ok: false, reason: "Канцелярія не знайшла такої раси." };
  }

  if (!isRaceAvailableForPronoun(input.pronoun, input.raceId)) {
    return { ok: false, reason: getRaceUnavailableReason(input.pronoun, input.raceId) };
  }

  if (!classes.some((characterClass) => characterClass.id === input.classId)) {
    return { ok: false, reason: "Канцелярія не знайшла такого класу." };
  }

  if (!isClassAvailableForChoice(input.pronoun, input.raceId, input.classId)) {
    return {
      ok: false,
      reason: getClassUnavailableReason(input.pronoun, input.raceId, input.classId)
    };
  }

  return {
    ok: true,
    identity: {
      pronoun: input.pronoun,
      raceId: input.raceId,
      classId: input.classId
    }
  };
}

export function getDefaultRemortIdentity(input: {
  pronoun?: string;
  raceId: string;
  classId: string;
}): RemortIdentitySelection {
  const pronoun = isPronoun(input.pronoun) ? input.pronoun : "they";
  const current = validateRemortIdentity({
    pronoun,
    raceId: input.raceId,
    classId: input.classId
  });

  if (current.ok) {
    return current.identity;
  }

  const race = activeRaces.find((candidate) => isRaceAvailableForPronoun(pronoun, candidate.id)) ?? activeRaces[0];
  if (!race) {
    throw new Error("Cannot build default remort identity without active races.");
  }
  const characterClass =
    classes.find((candidate) => isClassAvailableForChoice(pronoun, race.id, candidate.id)) ?? classes[0];
  if (!characterClass) {
    throw new Error("Cannot build default remort identity without classes.");
  }

  return {
    pronoun,
    raceId: race.id,
    classId: characterClass.id
  };
}

export function getRemortMemoryRank(remortCount: number): number {
  return Math.max(0, Math.floor(remortCount));
}

export function buildRemortStarterStats(input: {
  raceId: string;
  classId: string;
  remortNumber: number;
  previousLevel: number;
  previousClassId: string;
  previousRaceId: string;
  previousPath: CharacterPath;
}) {
  const starter = buildStarterStats(input.raceId, input.classId);
  const memoryRank = getRemortMemoryRank(input.remortNumber);
  const previousGrowth = buildLevelGrowthBonus(
    1,
    input.previousLevel,
    input.previousClassId,
    input.previousRaceId,
    input.previousPath
  );
  const hpBonus = buildRemortMemoryBonus(previousGrowth.hpMax, memoryRank);
  const manaBonus = buildRemortMemoryBonus(previousGrowth.manaMax, memoryRank);
  const statBonuses = buildRemortStatBonuses(previousGrowth.stats, memoryRank);
  const statBonus = statBonuses.reduce<RemortStatBonus | null>(
    (best, bonus) => (!best || bonus.bonus > best.bonus ? bonus : best),
    null
  );
  const stats = { ...starter.stats };

  for (const bonus of statBonuses) {
    stats[bonus.stat] += bonus.bonus;
  }

  return {
    hpCurrent: starter.hpCurrent + hpBonus,
    hpMax: starter.hpMax + hpBonus,
    manaCurrent: starter.manaCurrent + manaBonus,
    manaMax: starter.manaMax + manaBonus,
    stats,
    memoryRank,
    hpBonus,
    manaBonus,
    statBonuses,
    statBonus
  };
}

function buildRemortStatBonuses(
  previousStats: CharacterStats,
  memoryRank: number
): RemortStatBonus[] {
  const statKeys: readonly StatKey[] = [
    "strength",
    "dexterity",
    "intelligence",
    "charisma",
    "luck"
  ];

  return statKeys.flatMap((stat) => {
    const bonus = buildRemortMemoryBonus(previousStats[stat], memoryRank);
    return bonus > 0 ? [{ stat, bonus }] : [];
  });
}

function buildRemortMemoryBonus(previousBonus: number, remortNumber: number): number {
  const safePreviousBonus = Math.max(0, Math.floor(previousBonus));
  const safeRemortNumber = getRemortMemoryRank(remortNumber);

  if (safePreviousBonus <= 0 || safeRemortNumber <= 0) {
    return 0;
  }

  return Math.ceil(safePreviousBonus * REMORT_MEMORY_BONUS_RATE * safeRemortNumber);
}

export function isRemortPreservableItem(input: {
  item: ItemContent;
  equippedItemIds?: ReadonlySet<string>;
}): boolean {
  return Boolean(input.item.id);
}

export function getPronounShortLabel(pronoun: Pronoun): string {
  return getPronounLabel(pronoun);
}
