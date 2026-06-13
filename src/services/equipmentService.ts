import { items } from "../content";
import type { ItemContent } from "../content/schema";
import type {
  CharacterEquipmentRecord,
  EquipmentRepository,
  EquipmentSlot
} from "../db/repositories/equipmentRepository";
import { equipmentSlots } from "../db/repositories/equipmentRepository";
import type {
  CharacterItemRecord,
  InventoryRepository
} from "../db/repositories/inventoryRepository";

export type { EquipmentSlot };
export { equipmentSlots };

export type EquipmentResult =
  | { state: "no-character" }
  | { state: "ready"; slots: EquipmentSlotSummary[] };

export type EquipItemResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-equippable" }
  | { state: "unsupported-slot" }
  | { state: "equipped"; slot: EquipmentSlot; item: EquipmentItemSummary; slots: EquipmentSlotSummary[] };

export type UnequipSlotResult =
  | { state: "no-character" }
  | { state: "empty-slot"; slot: EquipmentSlot; slots: EquipmentSlotSummary[] }
  | { state: "unequipped"; slot: EquipmentSlot; slots: EquipmentSlotSummary[] };

export interface EquipmentItemSummary {
  itemId: string;
  content: ItemContent;
}

export interface EquipmentSlotSummary {
  slot: EquipmentSlot;
  item: EquipmentItemSummary | null;
}

export class EquipmentService {
  constructor(
    private readonly equipment: EquipmentRepository,
    private readonly inventory: InventoryRepository
  ) {}

  async getEquipmentForTelegramUser(telegramUserId: bigint): Promise<EquipmentResult> {
    const snapshot = await this.equipment.listByTelegramUserId(telegramUserId);

    if (!snapshot) {
      return { state: "no-character" };
    }

    return {
      state: "ready",
      slots: buildSlots(snapshot.equipment)
    };
  }

  async equipItemForTelegramUser(
    telegramUserId: bigint,
    itemId: string
  ): Promise<EquipItemResult> {
    const [snapshot, inventoryRows] = await Promise.all([
      this.equipment.listByTelegramUserId(telegramUserId),
      this.inventory.listByTelegramUserId(telegramUserId)
    ]);

    if (!snapshot || !inventoryRows) {
      return { state: "no-character" };
    }

    const owned = inventoryRows.find((row) => row.itemId === itemId);

    if (!owned) {
      return { state: "not-owned" };
    }

    const content = findKnownItem(owned);

    if (!content) {
      return { state: "not-equippable" };
    }

    const slot = mapItemToEquipmentSlot(content);

    if (!slot) {
      return { state: "not-equippable" };
    }

    if (!equipmentSlots.includes(slot)) {
      return { state: "unsupported-slot" };
    }

    const equipped = await this.equipment.equipForCharacter(snapshot.characterId, slot, itemId);
    const nextRows = [
      ...snapshot.equipment.filter((row) => row.slot !== slot),
      equipped
    ];

    return {
      state: "equipped",
      slot,
      item: {
        itemId,
        content
      },
      slots: buildSlots(nextRows)
    };
  }

  async unequipSlotForTelegramUser(
    telegramUserId: bigint,
    slot: EquipmentSlot
  ): Promise<UnequipSlotResult> {
    const snapshot = await this.equipment.listByTelegramUserId(telegramUserId);

    if (!snapshot) {
      return { state: "no-character" };
    }

    const current = snapshot.equipment.find((row) => row.slot === slot);

    if (!current) {
      return {
        state: "empty-slot",
        slot,
        slots: buildSlots(snapshot.equipment)
      };
    }

    await this.equipment.unequipForCharacter(snapshot.characterId, slot);

    return {
      state: "unequipped",
      slot,
      slots: buildSlots(snapshot.equipment.filter((row) => row.slot !== slot))
    };
  }
}

export function mapItemToEquipmentSlot(item: ItemContent): EquipmentSlot | null {
  if (item.slot === "weapon") {
    return "weapon";
  }

  if (item.slot === "armor") {
    return "chest";
  }

  if (item.slot === "accessory") {
    return "accessory";
  }

  return null;
}

export function isEquippableItem(item: ItemContent): boolean {
  return mapItemToEquipmentSlot(item) !== null;
}

function buildSlots(rows: CharacterEquipmentRecord[]): EquipmentSlotSummary[] {
  return equipmentSlots.map((slot) => {
    const row = rows.find((candidate) => candidate.slot === slot);

    if (!row) {
      return {
        slot,
        item: null
      };
    }

    const content = items.find((item) => item.id === row.itemId) ?? {
      id: row.itemId,
      name: "Невідома манатка",
      description: "Вона висить на гачку, але документи ще десь ідуть.",
      rarity: "common",
      slot: "junk",
      priceless: true
    } satisfies ItemContent;

    return {
      slot,
      item: {
        itemId: row.itemId,
        content
      }
    };
  });
}

function findKnownItem(row: CharacterItemRecord): ItemContent | null {
  return items.find((item) => item.id === row.itemId) ?? null;
}
