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

export interface EquipForCharacterResult {
  record: CharacterEquipmentRecord;
  changed: boolean;
}

export interface EquipmentRepository {
  listByTelegramUserId(telegramUserId: bigint): Promise<CharacterEquipmentSnapshot | null>;
  equipForCharacterAtomically?(
    input: {
      characterId: string;
      slot: EquipmentSlot;
      itemId: string;
      clearSlot?: EquipmentSlot;
    }
  ): Promise<EquipForCharacterResult>;
  equipForCharacter(
    characterId: string,
    slot: EquipmentSlot,
    itemId: string
  ): Promise<CharacterEquipmentRecord>;
  unequipForCharacter(characterId: string, slot: EquipmentSlot): Promise<boolean>;
}
