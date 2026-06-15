import { createHash } from "node:crypto";
import type { ItemContent } from "../content/schema";
import { isProtectedMantokChestItem } from "./mantokChest";
import { LEVEL_XP_THRESHOLDS, getLevelForXp, getNextLevelThreshold } from "./progression/level";

export const LEVEL_BARTER_COST_GOLD = 1000;
export const LEVEL_BARTER_BATTLE_ONLY_LEVEL = 13;

export interface LevelBarterStackInput {
  itemId: string;
  quantity: number;
}

export interface LevelBarterEligibleStack {
  itemId: string;
  quantity: number;
  content: ItemContent;
  unitGoldValue: number;
  totalGoldValue: number;
}

export interface LevelBarterUnit {
  itemId: string;
  content: ItemContent;
  unitGoldValue: number;
  order: number;
}

export interface LevelBarterSelection {
  items: Array<{ itemId: string; quantity: number }>;
  units: LevelBarterUnit[];
  itemTotalValue: number;
  goldSpent: number;
  selectedTotalValue: number;
  overpay: number;
}

export interface LevelBarterProgression {
  levelBefore: number;
  levelAfter: number;
  xpBefore: number;
  xpAfter: number;
  xpCarry: number;
}

interface Candidate {
  units: LevelBarterUnit[];
  total: number;
}

export function buildLevelBarterEligibleStacks(input: {
  stacks: readonly LevelBarterStackInput[];
  equippedItemIds?: ReadonlySet<string>;
  itemContents: readonly ItemContent[];
}): LevelBarterEligibleStack[] {
  const contentById = new Map(input.itemContents.map((item) => [item.id, item]));
  const equippedItemIds = input.equippedItemIds ?? new Set<string>();

  return input.stacks.flatMap((stack) => {
    const quantity = Math.max(0, Math.floor(stack.quantity));
    const content = contentById.get(stack.itemId);
    const unitGoldValue = Math.max(0, Math.floor(content?.goldValue ?? 0));

    if (
      !content ||
      quantity <= 0 ||
      unitGoldValue <= 0 ||
      equippedItemIds.has(stack.itemId) ||
      isProtectedMantokChestItem(content)
    ) {
      return [];
    }

    return [
      {
        itemId: stack.itemId,
        quantity,
        content,
        unitGoldValue,
        totalGoldValue: unitGoldValue * quantity
      }
    ];
  });
}

export function getLevelBarterEligibleTotalValue(
  stacks: readonly Pick<LevelBarterEligibleStack, "totalGoldValue">[]
): number {
  return stacks.reduce((sum, stack) => sum + stack.totalGoldValue, 0);
}

export function pickItemsForLevelBarter(
  stacks: readonly LevelBarterEligibleStack[],
  targetValue = LEVEL_BARTER_COST_GOLD,
  availableGold = 0
): LevelBarterSelection | null {
  const safeTarget = Math.max(1, Math.floor(targetValue));
  const safeGold = Math.max(0, Math.floor(availableGold));
  const units = expandLevelBarterStacks(stacks);

  if (units.reduce((sum, unit) => sum + unit.unitGoldValue, 0) + safeGold < safeTarget) {
    return null;
  }

  const candidates = new Map<number, Candidate>([[0, { units: [], total: 0 }]]);
  let best: Candidate | null = null;

  for (const unit of units) {
    const existing = [...candidates.values()];

    for (const candidate of existing) {
      const next: Candidate = {
        units: [...candidate.units, unit],
        total: candidate.total + unit.unitGoldValue
      };

      if (next.total >= safeTarget || safeTarget - next.total <= safeGold) {
        best = chooseBetterLevelBarterCandidate(best, next, safeTarget, safeGold);
      }

      if (next.total >= safeTarget) {
        continue;
      }

      const currentForTotal = candidates.get(next.total);

      if (!currentForTotal || comparePartialLevelBarterCandidates(next, currentForTotal) < 0) {
        candidates.set(next.total, next);
      }
    }
  }

  best = chooseBetterLevelBarterCandidate(best, candidates.get(0) ?? { units: [], total: 0 }, safeTarget, safeGold);

  if (!best) {
    return null;
  }

  const selectedUnits = [...best.units].sort((left, right) => left.order - right.order);
  const itemTotalValue = best.total;
  const goldSpent = Math.min(safeGold, Math.max(0, safeTarget - itemTotalValue));
  const selectedTotalValue = itemTotalValue + goldSpent;

  return {
    items: summarizeLevelBarterUnits(selectedUnits),
    units: selectedUnits,
    itemTotalValue,
    goldSpent,
    selectedTotalValue,
    overpay: selectedTotalValue - safeTarget
  };
}

function comparePartialLevelBarterCandidates(left: Candidate, right: Candidate): number {
  if (left.units.length !== right.units.length) {
    return left.units.length - right.units.length;
  }

  const leftOrders = left.units.map((unit) => unit.order).join(",");
  const rightOrders = right.units.map((unit) => unit.order).join(",");

  return leftOrders.localeCompare(rightOrders);
}

export function expandLevelBarterStacks(stacks: readonly LevelBarterEligibleStack[]): LevelBarterUnit[] {
  return stacks.flatMap((stack, stackIndex) =>
    Array.from({ length: stack.quantity }, (_, unitIndex) => ({
      itemId: stack.itemId,
      content: stack.content,
      unitGoldValue: stack.unitGoldValue,
      order: stackIndex * 10000 + unitIndex
    }))
  );
}

export function summarizeLevelBarterUnits(
  units: readonly Pick<LevelBarterUnit, "itemId">[]
): Array<{ itemId: string; quantity: number }> {
  const counts = new Map<string, number>();

  for (const unit of units) {
    counts.set(unit.itemId, (counts.get(unit.itemId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function buildLevelBarterProgression(input: {
  storedLevel: number;
  xp: number;
}): LevelBarterProgression {
  const xpBefore = Math.max(0, Math.floor(input.xp));
  const levelBefore = Math.max(1, Math.floor(input.storedLevel), getLevelForXp(xpBefore));
  const levelAfter = levelBefore + 1;
  const xpCarry = Math.max(0, xpBefore - getLevelStartXp(levelBefore));
  const nextThreshold = getNextLevelThreshold(levelAfter);
  const unclampedXpAfter = getLevelStartXp(levelAfter) + xpCarry;
  const xpAfter = nextThreshold === null ? unclampedXpAfter : Math.min(unclampedXpAfter, nextThreshold - 1);

  return {
    levelBefore,
    levelAfter,
    xpBefore,
    xpAfter,
    xpCarry: Math.max(0, xpAfter - getLevelStartXp(levelAfter))
  };
}

export function canLevelBarterProgress(progression: Pick<LevelBarterProgression, "levelAfter">): boolean {
  return progression.levelAfter < LEVEL_BARTER_BATTLE_ONLY_LEVEL;
}

export function createLevelBarterToken(input: {
  items: readonly { itemId: string; quantity: number }[];
  goldSpent: number;
  selectedTotalValue: number;
  progression: LevelBarterProgression;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        items: input.items,
        goldSpent: input.goldSpent,
        selectedTotalValue: input.selectedTotalValue,
        levelBefore: input.progression.levelBefore,
        levelAfter: input.progression.levelAfter,
        xpCarry: input.progression.xpCarry,
        xpAfter: input.progression.xpAfter
      })
    )
    .digest("hex")
    .slice(0, 16);
}

export function getLevelStartXp(level: number): number {
  const normalizedLevel = Math.max(1, Math.floor(level));

  return LEVEL_XP_THRESHOLDS[normalizedLevel - 1] ?? LEVEL_XP_THRESHOLDS[LEVEL_XP_THRESHOLDS.length - 1] ?? 0;
}

function chooseBetterLevelBarterCandidate(
  left: Candidate | null,
  right: Candidate,
  targetValue: number,
  availableGold: number
): Candidate | null {
  if (targetValue - right.total > availableGold) {
    return left;
  }

  if (!left) {
    return right;
  }

  return compareLevelBarterCandidates(right, left, targetValue, availableGold) < 0 ? right : left;
}

function compareLevelBarterCandidates(
  left: Candidate,
  right: Candidate,
  targetValue: number,
  availableGold: number
): number {
  const leftGold = Math.min(availableGold, Math.max(0, targetValue - left.total));
  const rightGold = Math.min(availableGold, Math.max(0, targetValue - right.total));
  const leftOverpay = Math.max(0, left.total + leftGold - targetValue);
  const rightOverpay = Math.max(0, right.total + rightGold - targetValue);

  if (leftOverpay !== rightOverpay) {
    return leftOverpay - rightOverpay;
  }

  if (leftGold !== rightGold) {
    return leftGold - rightGold;
  }

  if (left.units.length !== right.units.length) {
    return left.units.length - right.units.length;
  }

  const leftOrders = left.units.map((unit) => unit.order).join(",");
  const rightOrders = right.units.map((unit) => unit.order).join(",");

  return leftOrders.localeCompare(rightOrders);
}
