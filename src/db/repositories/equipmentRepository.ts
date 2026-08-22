import {
  equipmentSlots,
  type EquipmentSlot
} from "../../content/equipmentSlots";
import type {
  EquipmentAttunementRecord,
  EquipmentMagicStrength
} from "../../domain/equipment/equipmentAttunement";

export type { EquipmentSlot };
export { equipmentSlots };

export interface CharacterEquipmentRecord {
  id: string;
  characterId: string;
  slot: EquipmentSlot;
  itemId: string;
  createdAt: Date;
  updatedAt: Date;
  attunement?: EquipmentAttunementRecord;
}

export interface CharacterEquipmentSnapshot {
  characterId: string;
  equipment: CharacterEquipmentRecord[];
}

export type EquipForCharacterResult =
  | { record: CharacterEquipmentRecord; changed: boolean }
  | { state: "not-owned" };

export class EquipmentInventoryUnavailableError extends Error {
  constructor() {
    super("The requested inventory copy is no longer available for equipment.");
  }
}

export interface StartEquipmentAttunementInput {
  strength: EquipmentMagicStrength;
  itemName: string;
  startedAt: Date;
  readyAt: Date;
}

export interface EquipmentAttunementNotificationRecord {
  actionId: string;
  characterId: string;
  telegramUserId: bigint;
  itemId: string;
  itemName: string;
  strength: EquipmentMagicStrength;
  readyAt: Date;
}

export type FinishEquipmentAttunementsResult =
  | { state: "no-character" }
  | { state: "finished"; count: number };

export interface EquipmentRepository {
  listByTelegramUserId(telegramUserId: bigint): Promise<CharacterEquipmentSnapshot | null>;
  equipForCharacterAtomically?(
    input: {
      characterId: string;
      slot: EquipmentSlot;
      itemId: string;
      clearSlot?: EquipmentSlot;
      attunement?: StartEquipmentAttunementInput;
    }
  ): Promise<EquipForCharacterResult>;
  equipForCharacter(
    characterId: string,
    slot: EquipmentSlot,
    itemId: string
  ): Promise<CharacterEquipmentRecord>;
  unequipForCharacter(characterId: string, slot: EquipmentSlot): Promise<boolean>;
  listDueAttunementNotifications?(
    now: Date,
    options?: { limit?: number }
  ): Promise<EquipmentAttunementNotificationRecord[]>;
  markAttunementNotified?(actionId: string, notifiedAt: Date): Promise<boolean>;
  finishPendingAttunementsForTelegramUser?(
    telegramUserId: bigint,
    now: Date
  ): Promise<FinishEquipmentAttunementsResult>;
}
