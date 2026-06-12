import type { PrismaClient } from "@prisma/client";
import type { CharacterItemRecord, InventoryRepository } from "./inventoryRepository";

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByTelegramUserId(telegramUserId: bigint): Promise<CharacterItemRecord[] | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      select: {
        id: true
      }
    });

    if (!character) {
      return null;
    }

    return this.prisma.characterItem.findMany({
      where: {
        characterId: character.id
      },
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          itemId: "asc"
        }
      ]
    });
  }
}
