import type { ItemContent } from "../../content/schema";
import type { RandomSource } from "../../shared/random";

export type LootRarity = "common" | "uncommon" | "rare" | "epic";

export interface LootCandidate {
  item: ItemContent;
  rarity: LootRarity;
}

export interface LootRollInput {
  monsterId: string;
  monsterLoot: Readonly<Record<string, readonly string[]>>;
  items: readonly ItemContent[];
  luck: number;
  rng: RandomSource;
}

export type LootRollResult =
  | {
      state: "dropped";
      rarity: LootRarity;
      item: ItemContent;
    }
  | {
      state: "none";
      rarity?: LootRarity;
      reason: "no-drop" | "no-eligible-loot";
    };

export const LOOT_RARITY_WEIGHTS: Record<LootRarity, number> = {
  common: 0.7,
  uncommon: 0.22,
  rare: 0.07,
  epic: 0.01
};

export const BASE_ITEM_DROP_CHANCE = 0.35;

const rarityOrder: LootRarity[] = ["common", "uncommon", "rare", "epic"];

export function rollMonsterLoot(input: LootRollInput): LootRollResult {
  const candidates = getLootCandidates(input);

  if (candidates.length === 0) {
    return { state: "none", reason: "no-eligible-loot" };
  }

  if (input.rng.nextFloat() >= getItemDropChance(input.luck)) {
    return { state: "none", reason: "no-drop" };
  }

  const rarity = rollLootRarity(input.rng, input.luck);
  const eligible = selectCandidatesForRarity(candidates, rarity);
  const selected = eligible[input.rng.nextInt(0, eligible.length - 1)];

  if (!selected) {
    return { state: "none", rarity, reason: "no-eligible-loot" };
  }

  return {
    state: "dropped",
    rarity,
    item: selected.item
  };
}

export function getLootCandidates(input: Omit<LootRollInput, "luck" | "rng">): LootCandidate[] {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const seen = new Set<string>();

  return (input.monsterLoot[input.monsterId] ?? []).flatMap((itemId) => {
    if (seen.has(itemId)) {
      return [];
    }

    seen.add(itemId);
    const item = itemById.get(itemId);

    return item ? [{ item, rarity: item.rarity }] : [];
  });
}

export function rollLootRarity(rng: RandomSource, luck: number): LootRarity {
  const base = rarityFromRoll(rng.nextFloat());

  if (base === "epic" || rng.nextFloat() >= getLuckUpgradeChance(luck)) {
    return base;
  }

  return rarityOrder[Math.min(rarityOrder.indexOf(base) + 1, rarityOrder.length - 1)] ?? base;
}

export function getItemDropChance(luck: number): number {
  return clamp(BASE_ITEM_DROP_CHANCE + getBoundedLuckBonus(luck), 0.25, 0.45);
}

export function getLuckUpgradeChance(luck: number): number {
  return getBoundedLuckBonus(luck);
}

function getBoundedLuckBonus(luck: number): number {
  return clamp((Math.floor(luck) - 6) * 0.01, 0, 0.1);
}

function rarityFromRoll(roll: number): LootRarity {
  const bounded = clamp(roll, 0, 0.999_999);

  if (bounded < LOOT_RARITY_WEIGHTS.common) {
    return "common";
  }

  if (bounded < LOOT_RARITY_WEIGHTS.common + LOOT_RARITY_WEIGHTS.uncommon) {
    return "uncommon";
  }

  if (
    bounded <
    LOOT_RARITY_WEIGHTS.common + LOOT_RARITY_WEIGHTS.uncommon + LOOT_RARITY_WEIGHTS.rare
  ) {
    return "rare";
  }

  return "epic";
}

function selectCandidatesForRarity(
  candidates: readonly LootCandidate[],
  rarity: LootRarity
): LootCandidate[] {
  const targetIndex = rarityOrder.indexOf(rarity);

  for (let index = targetIndex; index >= 0; index -= 1) {
    const matching = candidates.filter((candidate) => candidate.rarity === rarityOrder[index]);

    if (matching.length > 0) {
      return matching;
    }
  }

  for (let index = targetIndex + 1; index < rarityOrder.length; index += 1) {
    const matching = candidates.filter((candidate) => candidate.rarity === rarityOrder[index]);

    if (matching.length > 0) {
      return matching;
    }
  }

  return [...candidates];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
