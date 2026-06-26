import type { RandomSource } from "../shared/random";

export const SEARCH_NODE_COOLDOWN_MS = 13 * 60 * 1000;
export const PASSAGE_SEARCH_DURATION_MS = 42 * 1000;
export const DESCENT_SEARCH_DURATION_MS = 23 * 1000;

export type PassageSearchNodeKind = "passage" | "location";
export type PassageSearchOutcome = "loot" | "nothing" | "monster-attack" | "cancelled" | "no-reward";

export interface PassageSearchSnapshot {
  nodeKey: string;
  nodeKind: PassageSearchNodeKind;
  originLocationId: string;
  passage?: "deep-left" | "deep-straight" | "deep-right";
  encounterToken?: string;
  durationMs: number;
  safeAtStart: boolean;
  dangerTier: number;
  searchTier: number;
  monsterIdAtStart?: string;
  monsterNameAtStart?: string;
  monsterLevelAtStart?: number;
  playerLuckSnapshot: number;
  startedAt: string;
  endsAt: string;
}

export interface PassageSearchLoot {
  gold: number;
  itemGrants: Array<{ itemId: string; quantity: number }>;
}

export interface PassageSearchModifiers {
  luck: number;
  futureRaceBonus: number;
  futureClassBonus: number;
  futureTitleBonus: number;
}

export function getPassageSearchModifiers(input: { luck: number }): PassageSearchModifiers {
  return {
    luck: normalizeLuck(input.luck),
    futureRaceBonus: 0,
    futureClassBonus: 0,
    futureTitleBonus: 0
  };
}

export function rollPassageSearchDanger(input: {
  snapshot: Pick<PassageSearchSnapshot, "safeAtStart" | "dangerTier" | "monsterIdAtStart">;
  modifiers: PassageSearchModifiers;
  rng: Pick<RandomSource, "nextFloat">;
}): boolean {
  if (input.snapshot.safeAtStart || !input.snapshot.monsterIdAtStart) {
    return false;
  }

  const chance = getPassageSearchDangerChance({
    tier: input.snapshot.dangerTier,
    modifiers: input.modifiers
  });

  return input.rng.nextFloat() < chance;
}

export function getPassageSearchDangerChance(input: {
  tier: number;
  modifiers: PassageSearchModifiers;
}): number {
  const tier = Math.max(1, Math.floor(input.tier));
  const modifier = input.modifiers.futureRaceBonus + input.modifiers.futureClassBonus + input.modifiers.futureTitleBonus;

  return clamp(
    0.10 + (tier - 1) * 0.025 - input.modifiers.luck * 0.012 - modifier,
    0.05,
    0.42
  );
}

export function rollPassageSearchLoot(input: {
  snapshot: Pick<PassageSearchSnapshot, "nodeKind" | "searchTier">;
  modifiers: PassageSearchModifiers;
  rng: Pick<RandomSource, "nextFloat" | "nextInt">;
  bandageItemId: string;
}): PassageSearchLoot {
  const tier = Math.max(0, Math.floor(input.snapshot.searchTier));
  const luckNudge = Math.min(0.12, Math.max(0, input.modifiers.luck - 6) * 0.012);
  const nonEmptyChance = input.snapshot.nodeKind === "location"
    ? 0.42 + luckNudge
    : clamp(0.58 + tier * 0.025 + luckNudge, 0.58, 0.85);

  if (input.rng.nextFloat() >= nonEmptyChance) {
    return { gold: 0, itemGrants: [] };
  }

  if (input.snapshot.nodeKind === "location") {
    const gold = input.rng.nextFloat() < 0.68 ? input.rng.nextInt(0, 2) : 0;
    const bandage = input.rng.nextFloat() < 0.08 + luckNudge / 2 ? 1 : 0;

    return {
      gold,
      itemGrants: bandage > 0 ? [{ itemId: input.bandageItemId, quantity: bandage }] : []
    };
  }

  const goldMax = Math.max(1, 2 + Math.floor(tier * 1.5));
  const gold = input.rng.nextInt(0, goldMax);
  const bandageChance = clamp(0.10 + tier * 0.018 + luckNudge, 0.10, 0.35);
  const bandageQuantity = input.rng.nextFloat() < bandageChance
    ? 1 + (tier >= 8 && input.rng.nextFloat() < 0.23 ? 1 : 0)
    : 0;

  return {
    gold,
    itemGrants: bandageQuantity > 0 ? [{ itemId: input.bandageItemId, quantity: bandageQuantity }] : []
  };
}

export function isEmptyPassageSearchLoot(loot: PassageSearchLoot): boolean {
  return loot.gold <= 0 && loot.itemGrants.every((grant) => grant.quantity <= 0);
}

function normalizeLuck(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
