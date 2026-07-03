import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CharacterEquipmentRecord,
  CharacterEquipmentSnapshot,
  EquipForCharacterResult,
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

  async equipForCharacterAtomically(input: {
    characterId: string;
    slot: EquipmentSlot;
    itemId: string;
    clearSlot?: EquipmentSlot;
  }): Promise<EquipForCharacterResult> {
    try {
      return await this.equipForCharacterAtomicallyUnsafe(input);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const row = await this.prisma.characterEquipment.findUnique({
        where: {
          characterId_slot: {
            characterId: input.characterId,
            slot: input.slot
          }
        }
      });

      if (row?.itemId !== input.itemId) {
        throw error;
      }

      const record = toRecord(row);
      if (!record) {
        throw new Error(`Unsupported equipment slot returned after concurrent equip: ${row.slot}`);
      }

      return {
        record,
        changed: false
      };
    }
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

  private async equipForCharacterAtomicallyUnsafe(input: {
    characterId: string;
    slot: EquipmentSlot;
    itemId: string;
    clearSlot?: EquipmentSlot;
  }): Promise<EquipForCharacterResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const storageKeys = getEquipmentSlotStorageKeys(input.slot);
      const legacyKeys = storageKeys.filter((key) => key !== input.slot);

      if (legacyKeys.length > 0) {
        await tx.characterEquipment.deleteMany({
          where: {
            characterId: input.characterId,
            slot: {
              in: legacyKeys
            }
          }
        });
      }

      if (input.clearSlot) {
        await tx.characterEquipment.deleteMany({
          where: {
            characterId: input.characterId,
            slot: {
              in: [...getEquipmentSlotStorageKeys(input.clearSlot)]
            }
          }
        });
      }

      const updated = await tx.characterEquipment.updateMany({
        where: {
          characterId: input.characterId,
          slot: input.slot,
          NOT: {
            itemId: input.itemId
          }
        },
        data: {
          itemId: input.itemId
        }
      });

      if (updated.count > 0) {
        const row = await tx.characterEquipment.findUniqueOrThrow({
          where: {
            characterId_slot: {
              characterId: input.characterId,
              slot: input.slot
            }
          }
        });

        return {
          row,
          changed: true
        };
      }

      const existing = await tx.characterEquipment.findUnique({
        where: {
          characterId_slot: {
            characterId: input.characterId,
            slot: input.slot
          }
        }
      });

      if (existing) {
        return {
          row: existing,
          changed: false
        };
      }

      const row = await tx.characterEquipment.create({
        data: {
          characterId: input.characterId,
          slot: input.slot,
          itemId: input.itemId
        }
      });

      return {
        row,
        changed: true
      };
    });

    const record = toRecord(result.row);
    if (!record) {
      throw new Error(`Unsupported equipment slot returned after equip: ${result.row.slot}`);
    }

    return {
      record,
      changed: result.changed
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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
