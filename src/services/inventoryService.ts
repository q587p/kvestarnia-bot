import { items } from "../content";
import type { ItemContent } from "../content/schema";
import type {
  CharacterItemRecord,
  InventoryRepository
} from "../db/repositories/inventoryRepository";

export type InventoryResult =
  | { state: "no-character" }
  | { state: "empty" }
  | { state: "found"; items: InventoryItemSummary[] };

export type InventoryItemDetailResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "found"; item: InventoryItemSummary };

export interface InventoryItemSummary {
  id: string;
  itemId: string;
  quantity: number;
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

    return {
      state: "found",
      items: rows.map(enrichItem)
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
    content
  };
}
