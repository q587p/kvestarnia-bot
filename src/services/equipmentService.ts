import { items } from "../content";
import {
  checkLootExpansionEquipRequirement,
  getLootExpansionEquipRequirementDetails,
  isLootExpansionItemId,
  type LootExpansionEquipCheck,
  type LootExpansionEquipRequirementDetails
} from "../content/lootExpansionV1";
import type { ItemContent } from "../content/schema";
import type { CharacterRepository } from "../db/repositories/characterRepository";
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
import { summarizeCharacter } from "../domain/characters/characterSummary";
import type { AchievementService, AchievementUnlock } from "./achievementService";

export type { EquipmentSlot };
export { equipmentSlots };

export type EquipmentResult =
  | { state: "no-character" }
  | { state: "ready"; slots: EquipmentSlotSummary[] };

export type ItemEquipPreviewResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-equippable" }
  | {
      state: "requirements-not-met";
      reasons: LootExpansionEquipCheck["reasons"];
      requirements: LootExpansionEquipRequirementDetails | null;
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
    }
  | { state: "unsupported-slot" }
  | {
      state: "can-equip";
      item: EquipmentItemSummary;
      slot: EquipmentSlot;
      requirements: LootExpansionEquipRequirementDetails | null;
    };

export type EquipItemResult =
  | { state: "no-character" }
  | { state: "not-owned" }
  | { state: "not-equippable" }
  | {
      state: "requirements-not-met";
      reasons: LootExpansionEquipCheck["reasons"];
      requirements: LootExpansionEquipRequirementDetails | null;
      item: EquipmentItemSummary;
    }
  | { state: "unsupported-slot" }
  | {
      state: "equipped";
      slot: EquipmentSlot;
      item: EquipmentItemSummary;
      slots: EquipmentSlotSummary[];
      achievementUnlocks: AchievementUnlock[];
    };

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
    private readonly inventory: InventoryRepository,
    private readonly characters?: CharacterRepository,
    private readonly achievements?: AchievementService
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

  async previewItemEquipForTelegramUser(
    telegramUserId: bigint,
    itemId: string
  ): Promise<ItemEquipPreviewResult> {
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

    const item = {
      itemId,
      content
    };

    if (isLootExpansionItemId(itemId)) {
      const requirements = getLootExpansionEquipRequirementDetails(itemId);
      const equipCheck = await this.checkLootExpansionEquipRequirementForTelegramUser(
        telegramUserId,
        itemId
      );

      if (!equipCheck) {
        return { state: "no-character" };
      }

      if (!equipCheck.canEquip) {
        return {
          state: "requirements-not-met",
          reasons: equipCheck.reasons,
          requirements,
          item,
          slot
        };
      }

      return {
        state: "can-equip",
        item,
        slot,
        requirements
      };
    }

    return {
      state: "can-equip",
      item,
      slot,
      requirements: null
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

    if (isLootExpansionItemId(itemId)) {
      const equipCheck = await this.checkLootExpansionEquipRequirementForTelegramUser(
        telegramUserId,
        itemId
      );

      if (!equipCheck) {
        return { state: "no-character" };
      }

      if (!equipCheck.canEquip) {
        return {
          state: "requirements-not-met",
          reasons: equipCheck.reasons,
          requirements: getLootExpansionEquipRequirementDetails(itemId),
          item: {
            itemId,
            content
          }
        };
      }
    }

    const equipped = await this.equipment.equipForCharacter(snapshot.characterId, slot, itemId);
    const achievementUnlocks =
      (await this.achievements?.trackEventSafely({
        type: "equipment.item_equipped",
        characterId: snapshot.characterId,
        itemId,
        occurredAt: new Date(),
        sourceId: equipped.id
      })) ?? [];
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
      slots: buildSlots(nextRows),
      achievementUnlocks
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

  private async checkLootExpansionEquipRequirementForTelegramUser(
    telegramUserId: bigint,
    itemId: string
  ): Promise<LootExpansionEquipCheck | null> {
    if (!this.characters) {
      return {
        canEquip: true,
        reasons: []
      };
    }

    const character = await this.characters.findByTelegramUserId(telegramUserId);

    if (!character) {
      return null;
    }

    const summary = summarizeCharacter(character);

    return checkLootExpansionEquipRequirement(itemId, {
      level: summary.level,
      classId: summary.classId,
      raceId: summary.raceId,
      title: summary.title
    });
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

export function getEquippedItemContents(rows: CharacterEquipmentRecord[]): ItemContent[] {
  return rows.flatMap((row) => {
    const content = items.find((item) => item.id === row.itemId);

    return content ? [content] : [];
  });
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
