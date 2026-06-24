import { createHash } from "node:crypto";
import type { ItemContent } from "../content/schema";
import { isProtectedMantokChestItem } from "./mantokChest";

export const ITEM_GIFT_PAGE_SIZE = 5;
export const ITEM_GIFT_QUANTITY = 1;

export interface ItemGiftStackInput {
  itemId: string;
  quantity: number;
}

export interface ItemGiftEligibleStack {
  itemId: string;
  quantity: number;
  content: ItemContent;
  unitGoldValue: number;
  fingerprint: string;
}

export function buildItemGiftEligibleStacks(input: {
  stacks: readonly ItemGiftStackInput[];
  equippedItemIds?: ReadonlySet<string>;
  reservedItemIds?: ReadonlySet<string>;
  itemContents: readonly ItemContent[];
}): ItemGiftEligibleStack[] {
  const contentById = new Map(input.itemContents.map((item) => [item.id, item]));
  const equippedItemIds = input.equippedItemIds ?? new Set<string>();
  const reservedItemIds = input.reservedItemIds ?? new Set<string>();

  return input.stacks.flatMap((stack) => {
    const quantity = Math.max(0, Math.floor(stack.quantity));
    const content = contentById.get(stack.itemId);
    const unitGoldValue = Math.max(0, Math.floor(content?.goldValue ?? 0));

    if (
      !content ||
      quantity < ITEM_GIFT_QUANTITY ||
      unitGoldValue <= 0 ||
      equippedItemIds.has(stack.itemId) ||
      reservedItemIds.has(stack.itemId) ||
      isProtectedMantokChestItem(content)
    ) {
      return [];
    }

    return [{
      itemId: stack.itemId,
      quantity,
      content,
      unitGoldValue,
      fingerprint: createItemGiftFingerprint(content)
    }];
  });
}

export function selectGiftStackByIndex(
  stacks: readonly ItemGiftEligibleStack[],
  index: number
): ItemGiftEligibleStack | null {
  const safeIndex = Math.trunc(index);
  return Number.isInteger(safeIndex) && safeIndex >= 0
    ? stacks[safeIndex] ?? null
    : null;
}

export function createItemGiftFingerprint(item: ItemContent): string {
  const payload = {
    id: item.id,
    name: item.name,
    unitGoldValue: Math.max(0, Math.floor(item.goldValue ?? 0)),
    priceless: item.priceless === true,
    protected: isProtectedMantokChestItem(item)
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}
