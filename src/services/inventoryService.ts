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
}

function enrichItem(row: CharacterItemRecord): InventoryItemSummary {
  const content = items.find((item) => item.id === row.itemId) ?? {
    id: row.itemId,
    name: "Невідома манатка",
    description: "Вона є в торбі, але документи ще десь ідуть.",
    rarity: "common",
    slot: "junk"
  };

  return {
    id: row.id,
    itemId: row.itemId,
    quantity: row.quantity,
    content
  };
}
