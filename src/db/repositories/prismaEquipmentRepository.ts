import type { PrismaClient } from "@prisma/client";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentRepository,
  EquipmentSlot
} from "./equipmentRepository";
import {
  getEquipmentSlotStorageKeys,
  normalizeEquipmentSlot
} from "../../content/equipmentSlots";

export class PrismaEquipmentRepository implements EquipmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByTelegramUserId(telegramUserId: bigint): Promise<CharacterEquipmentSnapshot | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true,
        equipment: {
          orderBy: {
            slot: "asc"
          }
        }
      }
    });

    if (!character) {
      return null;
    }

    return {
      characterId: character.id,
      equipment: character.equipment.flatMap((row) => {
        const record = toRecord(row);

        return record ? [record] : [];
      })
    };
  }

  async equipForCharacter(
    characterId: string,
    slot: EquipmentSlot,
    itemId: string
  ): Promise<CharacterEquipmentRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      const storageKeys = getEquipmentSlotStorageKeys(slot);
      const legacyKeys = storageKeys.filter((key) => key !== slot);

      if (legacyKeys.length > 0) {
        await tx.characterEquipment.deleteMany({
          where: {
            characterId,
            slot: {
              in: legacyKeys
            }
          }
        });
      }

      return tx.characterEquipment.upsert({
        where: {
          characterId_slot: {
            characterId,
            slot
          }
        },
        create: {
          characterId,
          slot,
          itemId
        },
        update: {
          itemId
        }
      });
    });

    const record = toRecord(row);
    if (!record) {
      throw new Error(`Unsupported equipment slot returned after equip: ${row.slot}`);
    }

    return record;
  }

  async unequipForCharacter(characterId: string, slot: EquipmentSlot): Promise<boolean> {
    const deleted = await this.prisma.characterEquipment.deleteMany({
      where: {
        characterId,
        slot: {
          in: [...getEquipmentSlotStorageKeys(slot)]
        }
      }
    });

    return deleted.count > 0;
  }
}

function toRecord(row: {
  id: string;
  characterId: string;
  slot: string;
  itemId: string;
  createdAt: Date;
  updatedAt: Date;
}): CharacterEquipmentRecord | null {
  const slot = normalizeEquipmentSlot(row.slot);

  if (!slot) {
    return null;
  }

  return {
    id: row.id,
    characterId: row.characterId,
    slot,
    itemId: row.itemId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
