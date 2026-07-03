import {
  equipmentSlots,
  type EquipmentSlot
} from "../../content/equipmentSlots";

export type { EquipmentSlot };
export { equipmentSlots };

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
