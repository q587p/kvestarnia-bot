import { items } from "../content";
import type { ItemContent } from "../content/schema";
import { getItemUseEffect } from "../domain/itemUse";
import type {
  CharacterItemRecord,
  InventoryRepository
} from "../db/repositories/inventoryRepository";

export type InventoryResult =
  | { state: "no-character" }
  | { state: "empty" }
  | { state: "found"; items: InventoryItemSummary[]; totalGoldValue: number };

export type InventoryItemDetailResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "found"; item: InventoryItemSummary };

export interface InventoryItemSummary {
  id: string;
  itemId: string;
  quantity: number;
  enhancementLevel: number;
  content: ItemContent;
}

export class InventoryService {
  constructor(private readonly inventory: InventoryRepository) {}

  async listForTelegramUser(telegramUserId: bigint): Promise<InventoryResult> {
    const rows = await this.inventory.listByTelegramUserId(telegramUserId);

    if (!rows) {
      return { state: "no-character" };
    }

    if (rows.length === 0) {
      return { state: "empty" };
    }

    const enrichedItems = rows
      .map((row, index) => ({
        row,
        index,
        item: enrichItem(row)
      }))
      .sort((left, right) => {
        const leftPriority = getInventoryItemPriority(left.item.content);
        const rightPriority = getInventoryItemPriority(right.item.content);

        return leftPriority - rightPriority || left.index - right.index;
      })
      .map(({ item }) => item);

    return {
      state: "found",
      items: enrichedItems,
      totalGoldValue: calculateInventoryGoldValue(enrichedItems)
    };
  }

  async getItemForTelegramUser(
    telegramUserId: bigint,
    itemId: string
  ): Promise<InventoryItemDetailResult> {
    const rows = await this.inventory.listByTelegramUserId(telegramUserId);

    if (!rows) {
      return { state: "no-character" };
    }

    const row = rows.find((candidate) => candidate.itemId === itemId);

    if (!row) {
      return { state: "not-owned" };
    }

    return {
      state: "found",
      item: enrichItem(row)
    };
  }
}

export function calculateInventoryRowsGoldValue(rows: readonly CharacterItemRecord[]): number {
  return calculateInventoryGoldValue(rows.map(enrichItem));
}

export function calculateInventoryGoldValue(
  inventoryItems: readonly Pick<InventoryItemSummary, "quantity" | "content">[]
): number {
  return inventoryItems.reduce((sum, item) => {
    const quantity = Math.max(0, Math.floor(item.quantity));
    const value = Math.max(0, Math.floor(item.content.goldValue ?? 0));

    return sum + value * quantity;
  }, 0);
}

function enrichItem(row: CharacterItemRecord): InventoryItemSummary {
  const content = items.find((item) => item.id === row.itemId) ?? {
    id: row.itemId,
    name: "Невідома манатка",
    description: "Вона є в торбі, але документи ще десь ідуть.",
    rarity: "common",
    slot: "junk",
    priceless: true
  };

  return {
    id: row.id,
    itemId: row.itemId,
    quantity: row.quantity,
    enhancementLevel: row.enhancementLevel ?? 0,
    content
  };
}

function getInventoryItemPriority(item: ItemContent): number {
  return getItemUseEffect(item) ? 0 : 1;
}
