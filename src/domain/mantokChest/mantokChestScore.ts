import type { ItemContent } from "../../content/schema";

export type MantokChestRarity = ItemContent["rarity"];

export const MANTOK_CHEST_BATCH_SIZE = 5;

export const mantokChestRarityRank: Record<MantokChestRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5
};

export const protectedMantokChestItemIds = new Set<string>([
  "item.apology.rollback-receipt",
  "item.apology.redeploy-cork",
  "item.apology.p3009-stamp",
  "item.badge-of-thirteen-small-problems",
  "item.cellar.cheese-seal",
  "item.cellar.foamy-mirage-bottle"
]);

export function calculateMantokChestItemScore(item: ItemContent): number {
  return Math.max(0, Math.floor(item.goldValue ?? 0)) + mantokChestRarityRank[item.rarity] * 25;
}

export function isProtectedMantokChestItem(item: ItemContent): boolean {
  return item.priceless === true || protectedMantokChestItemIds.has(item.id);
}

export function calculateMantokChestAverageScore(
  units: readonly { content: ItemContent }[]
): number {
  if (units.length === 0) {
    return 0;
  }

  const total = units.reduce((sum, unit) => sum + calculateMantokChestItemScore(unit.content), 0);

  return total / units.length;
}

export function calculateMinimumMantokChestOutputScore(averageInputScore: number): number {
  return Math.floor(averageInputScore) + 1;
}
