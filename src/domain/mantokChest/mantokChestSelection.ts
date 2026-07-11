import type { ItemContent } from "../../content/schema";
import type { RandomSource } from "../../shared/random";
import {
  calculateMantokChestAverageScore,
  calculateMantokChestItemScore,
  calculateMinimumMantokChestOutputScore,
  isProtectedMantokChestItem,
  mantokChestRarityRank,
  MANTOK_CHEST_BATCH_SIZE,
  type MantokChestRarity
} from "./mantokChestScore";

export interface MantokChestStackInput {
  itemId: string;
  quantity: number;
}

export interface MantokChestEligibleStack {
  itemId: string;
  quantity: number;
  content: ItemContent;
  score: number;
  manualOnly: boolean;
}

export interface MantokChestUnit {
  itemId: string;
  content: ItemContent;
  score: number;
}

export interface MantokChestInputSelection {
  items: Array<{ itemId: string; quantity: number }>;
  units: MantokChestUnit[];
  averageInputScore: number;
  minimumOutputScore: number;
}

export function buildMantokChestEligibleStacks(input: {
  stacks: readonly MantokChestStackInput[];
  equippedItemIds?: ReadonlySet<string>;
  reservedItemIds?: ReadonlySet<string>;
  itemContents: readonly ItemContent[];
  mode?: "auto" | "manual";
}): MantokChestEligibleStack[] {
  const contentById = new Map(input.itemContents.map((item) => [item.id, item]));
  const equippedItemIds = input.equippedItemIds ?? new Set<string>();
  const reservedItemIds = input.reservedItemIds ?? new Set<string>();
  const mode = input.mode ?? "auto";

  return input.stacks.flatMap((stack) => {
    const quantity = Math.max(0, Math.floor(stack.quantity));
    const content = contentById.get(stack.itemId);

    if (!content || quantity <= 0 || equippedItemIds.has(stack.itemId) || reservedItemIds.has(stack.itemId)) {
      return [];
    }

    const manualOnly = isProtectedMantokChestItem(content) || isConsumableMantokChestItem(content);

    if (mode === "auto" && manualOnly) {
      return [];
    }

    return [
      {
        itemId: stack.itemId,
        quantity,
        content,
        score: calculateMantokChestItemScore(content),
        manualOnly
      }
    ];
  });
}

export function countMantokChestEligibleUnits(stacks: readonly MantokChestEligibleStack[]): number {
  return stacks.reduce((sum, stack) => sum + stack.quantity, 0);
}

export function selectCheapestMantokChestUnits(
  stacks: readonly MantokChestEligibleStack[],
  batchSize = MANTOK_CHEST_BATCH_SIZE
): MantokChestInputSelection | null {
  const sortedStacks = [...stacks]
    .sort((left, right) => left.score - right.score || left.itemId.localeCompare(right.itemId));
  const selectedUnits: MantokChestUnit[] = [];

  for (const stack of sortedStacks) {
    const remaining = batchSize - selectedUnits.length;

    if (remaining <= 0) {
      break;
    }

    const take = Math.min(stack.quantity, remaining);

    for (let count = 0; count < take; count += 1) {
      selectedUnits.push({
        itemId: stack.itemId,
        content: stack.content,
        score: stack.score
      });
    }
  }

  if (selectedUnits.length < batchSize) {
    return null;
  }

  const averageInputScore = calculateMantokChestAverageScore(selectedUnits);

  return {
    items: summarizeMantokChestUnits(selectedUnits),
    units: selectedUnits,
    averageInputScore,
    minimumOutputScore: calculateMinimumMantokChestOutputScore(averageInputScore)
  };
}

export function selectMantokChestOutputItem(input: {
  items: readonly ItemContent[];
  averageInputScore: number;
  inputUnits: readonly MantokChestUnit[];
  inputItemIds: ReadonlySet<string>;
  playerLuck?: number;
  rng: RandomSource;
}): ItemContent | null {
  const candidates = input.items.filter(
    (item) => !isProtectedMantokChestItem(item) && calculateMantokChestItemScore(item) > input.averageInputScore
  );
  if (candidates.length === 0) {
    return null;
  }

  const targetRarity = selectMantokChestOutputRarity({
    inputUnits: input.inputUnits,
    ...(input.playerLuck === undefined ? {} : { playerLuck: input.playerLuck }),
    rng: input.rng
  });
  const targetRank = mantokChestRarityRank[targetRarity];
  const boundedCandidates = candidates.filter(
    (item) => mantokChestRarityRank[item.rarity] <= targetRank
  );
  if (boundedCandidates.length === 0) {
    return null;
  }

  const nonInputCandidates = boundedCandidates.filter((item) => !input.inputItemIds.has(item.id));
  const ownershipPool = nonInputCandidates.length > 0 ? nonInputCandidates : boundedCandidates;
  const targetRarityCandidates = ownershipPool.filter((item) => item.rarity === targetRarity);
  const pool = targetRarityCandidates.length > 0 ? targetRarityCandidates : ownershipPool;

  return pool[input.rng.nextInt(0, pool.length - 1)] ?? null;
}

const MANTOK_CHEST_RARITIES: readonly MantokChestRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary"
];
const MANTOK_CHEST_LUCK_BASELINE = 5;
const MANTOK_CHEST_MAX_LUCK_BONUS = 0.05;
const MANTOK_CHEST_MAX_FIRST_UPGRADE_CHANCE = 0.25;
const MANTOK_CHEST_SECOND_UPGRADE_BASE_CHANCE = 0.005;
const MANTOK_CHEST_SECOND_UPGRADE_LUCK_FACTOR = 0.1;
const MANTOK_CHEST_MAX_SECOND_UPGRADE_CHANCE = 0.01;

export function selectMantokChestOutputRarity(input: {
  inputUnits: readonly MantokChestUnit[];
  playerLuck?: number;
  rng: RandomSource;
}): MantokChestRarity {
  if (input.inputUnits.length === 0) {
    return "common";
  }

  const ranks = input.inputUnits.map((unit) => mantokChestRarityRank[unit.content.rarity]);
  const firstRank = ranks[0] ?? mantokChestRarityRank.common;
  const allSameRarity = ranks.every((rank) => rank === firstRank);

  if (allSameRarity) {
    return selectSameRarityUpgrade(firstRank, input.playerLuck ?? MANTOK_CHEST_LUCK_BASELINE, input.rng);
  }

  const averageRank = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
  const lowerRank = Math.floor(averageRank);
  const upperRank = Math.ceil(averageRank);
  const fraction = averageRank - lowerRank;
  const luckBonus = calculateLuckBonus(input.playerLuck ?? MANTOK_CHEST_LUCK_BASELINE);
  const upperChance = Math.min(1, fraction + luckBonus * (1 - fraction));
  const selectedRank = input.rng.nextFloat() < upperChance ? upperRank : lowerRank;

  return rarityForRank(selectedRank);
}

export function expandMantokChestStacks(
  stacks: readonly MantokChestEligibleStack[]
): MantokChestUnit[] {
  return stacks.flatMap((stack) =>
    Array.from({ length: stack.quantity }, () => ({
      itemId: stack.itemId,
      content: stack.content,
      score: stack.score
    }))
  );
}

export function summarizeMantokChestUnits(
  units: readonly Pick<MantokChestUnit, "itemId">[]
): Array<{ itemId: string; quantity: number }> {
  const counts = new Map<string, number>();

  for (const unit of units) {
    counts.set(unit.itemId, (counts.get(unit.itemId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

function isConsumableMantokChestItem(item: ItemContent): boolean {
  const tags = item.tags ?? [];

  return item.slot === "consumable" || tags.includes("consumable") || tags.includes("one-use");
}

const SAME_RARITY_UPGRADE_CHANCES: Record<number, number> = {
  [mantokChestRarityRank.common]: 0.08,
  [mantokChestRarityRank.uncommon]: 0.06,
  [mantokChestRarityRank.rare]: 0.04
};

function selectSameRarityUpgrade(rank: number, playerLuck: number, rng: RandomSource): MantokChestRarity {
  if (rank >= mantokChestRarityRank.epic) {
    return rarityForRank(rank);
  }

  const firstUpgradeChance = Math.min(
    MANTOK_CHEST_MAX_FIRST_UPGRADE_CHANCE,
    (SAME_RARITY_UPGRADE_CHANCES[rank] ?? 0) + calculateLuckBonus(playerLuck)
  );
  const secondUpgradeChance = rank <= mantokChestRarityRank.uncommon
    ? Math.min(
        MANTOK_CHEST_MAX_SECOND_UPGRADE_CHANCE,
        MANTOK_CHEST_SECOND_UPGRADE_BASE_CHANCE +
          calculateLuckBonus(playerLuck) * MANTOK_CHEST_SECOND_UPGRADE_LUCK_FACTOR
      )
    : 0;
  const roll = rng.nextFloat();

  if (roll < firstUpgradeChance) {
    return rarityForRank(rank + 1);
  }

  if (roll < firstUpgradeChance + secondUpgradeChance) {
    return rarityForRank(rank + 2);
  }

  return rarityForRank(rank);
}

function calculateLuckBonus(playerLuck: number): number {
  return Math.min(
    MANTOK_CHEST_MAX_LUCK_BONUS,
    Math.max(0, Math.floor(playerLuck) - MANTOK_CHEST_LUCK_BASELINE) * 0.01
  );
}

function rarityForRank(rank: number): MantokChestRarity {
  return MANTOK_CHEST_RARITIES[rank - 1] ?? "common";
}
