import { createHash } from "node:crypto";
import type { ItemContent } from "../content/schema";
import { isProtectedMantokChestItem } from "./mantokChest";

export const ITEM_GIFT_PAGE_SIZE = 5;
export const ITEM_GIFT_QUANTITY = 1;
export const ITEM_GIFT_SELECTION_GUARD_LENGTH = 12;
export const ITEM_POSTAL_MAX_DISTINCT_TYPES = 5;
export const ITEM_POSTAL_MAX_UNITS_PER_TYPE = 93;
export const ITEM_POSTAL_PAGE_SIZE = 5;
export const ITEM_POSTAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ITEM_POSTAL_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

export interface ItemPostalPackageLine {
  itemId: string;
  itemName: string;
  quantity: number;
  itemFingerprint: string;
  unitGoldValue: number;
  observedQuantity: number;
  tags: string[];
}

export function isItemTransferBlockedByTags(item: ItemContent): boolean {
  const tags = new Set(item.tags ?? []);

  return tags.has("trade-blocked") || tags.has("soulbound");
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
      isItemTransferBlockedByTags(content) ||
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

export function calculatePostalDeliveryFee(lines: readonly Pick<ItemPostalPackageLine, "quantity">[]): number {
  const typeCount = lines.length;

  return typeCount > 0 ? 5 + typeCount : 0;
}

export function validatePostalPackageLines(lines: readonly Pick<ItemPostalPackageLine, "itemId" | "quantity">[]): boolean {
  if (lines.length < 1 || lines.length > ITEM_POSTAL_MAX_DISTINCT_TYPES) {
    return false;
  }

  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.itemId)) {
      return false;
    }
    seen.add(line.itemId);

    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > ITEM_POSTAL_MAX_UNITS_PER_TYPE
    ) {
      return false;
    }
  }

  return true;
}

export function packageLineFromEligibleStack(
  stack: ItemGiftEligibleStack,
  quantity: number
): ItemPostalPackageLine {
  const safeQuantity = Math.max(
    1,
    Math.min(ITEM_POSTAL_MAX_UNITS_PER_TYPE, Math.floor(quantity), stack.quantity)
  );

  return {
    itemId: stack.itemId,
    itemName: stack.content.name,
    quantity: safeQuantity,
    itemFingerprint: stack.fingerprint,
    unitGoldValue: stack.unitGoldValue,
    observedQuantity: stack.quantity,
    tags: [...(stack.content.tags ?? [])].sort()
  };
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
    tags: [...(item.tags ?? [])].sort(),
    protected: isProtectedMantokChestItem(item)
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
}

export function createItemGiftSelectionGuard(input: { itemId: string; fingerprint: string }): string {
  return createHash("sha256")
    .update(`${input.itemId}:${input.fingerprint}`)
    .digest("base64url")
    .slice(0, ITEM_GIFT_SELECTION_GUARD_LENGTH);
}
