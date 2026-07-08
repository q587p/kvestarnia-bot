import type { ItemContent } from "../../content/schema";
import type { RandomSource } from "../../shared/random";
import {
  calculateMantokChestAverageScore,
  calculateMantokChestItemScore,
  calculateMinimumMantokChestOutputScore,
  isProtectedMantokChestItem,
  MANTOK_CHEST_BATCH_SIZE
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
  inputItemIds: ReadonlySet<string>;
  rng: RandomSource;
}): ItemContent | null {
  const candidates = input.items.filter(
    (item) => !isProtectedMantokChestItem(item) && calculateMantokChestItemScore(item) > input.averageInputScore
  );

  if (candidates.length === 0) {
    return null;
  }

  const nonInputCandidates = candidates.filter((item) => !input.inputItemIds.has(item.id));
  const pool = nonInputCandidates.length > 0 ? nonInputCandidates : candidates;

  return pool[input.rng.nextInt(0, pool.length - 1)] ?? pool[0] ?? null;
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
