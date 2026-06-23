import { createHash } from "node:crypto";
import type { ItemContent } from "../content/schema";
import { isProtectedMantokChestItem } from "./mantokChest";

export const MANTOK_SALE_RATE_PERCENT = 42;
export const MANTOK_SALE_PAGE_SIZE = 5;

export interface MantokSaleStackInput {
  itemId: string;
  quantity: number;
}

export interface MantokSaleEligibleStack {
  itemId: string;
  quantity: number;
  content: ItemContent;
  unitGoldValue: number;
  totalGoldValue: number;
}

export interface MantokSaleSelectionItem {
  itemId: string;
  quantity: number;
}

export interface MantokSaleBasket {
  items: MantokSaleSelectionItem[];
  nominalValue: number;
  payoutGold: number;
  fingerprint: string;
}

export function buildMantokSaleEligibleStacks(input: {
  stacks: readonly MantokSaleStackInput[];
  equippedItemIds?: ReadonlySet<string>;
  reservedItemIds?: ReadonlySet<string>;
  itemContents: readonly ItemContent[];
}): MantokSaleEligibleStack[] {
  const contentById = new Map(input.itemContents.map((item) => [item.id, item]));
  const equippedItemIds = input.equippedItemIds ?? new Set<string>();
  const reservedItemIds = input.reservedItemIds ?? new Set<string>();

  return input.stacks.flatMap((stack) => {
    const quantity = Math.max(0, Math.floor(stack.quantity));
    const content = contentById.get(stack.itemId);
    const unitGoldValue = Math.max(0, Math.floor(content?.goldValue ?? 0));

    if (
      !content ||
      quantity <= 0 ||
      unitGoldValue <= 0 ||
      equippedItemIds.has(stack.itemId) ||
      reservedItemIds.has(stack.itemId) ||
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

export function buildMantokSaleBasket(
  selection: readonly MantokSaleSelectionItem[],
  eligibleStacks: readonly MantokSaleEligibleStack[]
): MantokSaleBasket | null {
  const eligibleById = new Map(eligibleStacks.map((stack) => [stack.itemId, stack]));
  const normalized = normalizeMantokSaleSelection(selection, eligibleById);

  if (normalized.length === 0) {
    return null;
  }

  const nominalValue = normalized.reduce((sum, item) => {
    const stack = eligibleById.get(item.itemId);

    return sum + (stack?.unitGoldValue ?? 0) * item.quantity;
  }, 0);
  const payoutGold = calculateMantokSalePayout(nominalValue);
  const fingerprint = createMantokSaleFingerprint(normalized, eligibleById);

  return {
    items: normalized,
    nominalValue,
    payoutGold,
    fingerprint
  };
}

export function selectAllMantokSaleEligibleUnits(
  stacks: readonly MantokSaleEligibleStack[]
): MantokSaleSelectionItem[] {
  return stacks
    .filter((stack) => stack.quantity > 0)
    .map((stack) => ({ itemId: stack.itemId, quantity: stack.quantity }))
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
}

export function calculateMantokSalePayout(nominalValue: number): number {
  return Math.floor((Math.max(0, Math.floor(nominalValue)) * MANTOK_SALE_RATE_PERCENT) / 100);
}

export function createMantokSaleFingerprint(
  selection: readonly MantokSaleSelectionItem[],
  eligibleById: ReadonlyMap<string, MantokSaleEligibleStack>
): string {
  const payload = selection
    .map((item) => {
      const stack = eligibleById.get(item.itemId);

      return {
        itemId: item.itemId,
        quantity: item.quantity,
        unitGoldValue: stack?.unitGoldValue ?? 0,
        availableQuantity: stack?.quantity ?? 0
      };
    })
    .sort((left, right) => left.itemId.localeCompare(right.itemId));

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

function normalizeMantokSaleSelection(
  selection: readonly MantokSaleSelectionItem[],
  eligibleById: ReadonlyMap<string, MantokSaleEligibleStack>
): MantokSaleSelectionItem[] {
  const selected = new Map<string, number>();

  for (const item of selection) {
    const stack = eligibleById.get(item.itemId);
    const quantity = Math.max(0, Math.floor(item.quantity));

    if (!stack || quantity <= 0) {
      continue;
    }

    selected.set(item.itemId, Math.min(stack.quantity, (selected.get(item.itemId) ?? 0) + quantity));
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}
