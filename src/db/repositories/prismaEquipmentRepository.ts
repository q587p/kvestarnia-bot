import type { PrismaClient } from "@prisma/client";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipmentRepository,
  EquipmentSlot
} from "./equipmentRepository";

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
      equipment: character.equipment.map(toRecord)
    };
  }

  async equipForCharacter(
    characterId: string,
    slot: EquipmentSlot,
    itemId: string
  ): Promise<CharacterEquipmentRecord> {
    const row = await this.prisma.characterEquipment.upsert({
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

    return toRecord(row);
  }

  async unequipForCharacter(characterId: string, slot: EquipmentSlot): Promise<boolean> {
    const deleted = await this.prisma.characterEquipment.deleteMany({
      where: {
        characterId,
        slot
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
}): CharacterEquipmentRecord {
  return {
    id: row.id,
    characterId: row.characterId,
    slot: row.slot as EquipmentSlot,
    itemId: row.itemId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
