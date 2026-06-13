export type EquipmentSlot = "weapon" | "head" | "chest" | "legs" | "accessory";

export const equipmentSlots: readonly EquipmentSlot[] = [
  "weapon",
  "head",
  "chest",
  "legs",
  "accessory"
];

export interface CharacterEquipmentRecord {
  id: string;
  characterId: string;
  slot: EquipmentSlot;
  itemId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterEquipmentSnapshot {
  characterId: string;
  equipment: CharacterEquipmentRecord[];
}

export interface EquipmentRepository {
  listByTelegramUserId(telegramUserId: bigint): Promise<CharacterEquipmentSnapshot | null>;
  equipForCharacter(
    characterId: string,
    slot: EquipmentSlot,
    itemId: string
  ): Promise<CharacterEquipmentRecord>;
  unequipForCharacter(characterId: string, slot: EquipmentSlot): Promise<boolean>;
}
