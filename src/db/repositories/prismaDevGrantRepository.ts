import type { Character, Prisma, PrismaClient } from "@prisma/client";
import { getLevelForXp } from "../../domain/progression/level";
import type { CharacterRecord } from "./characterRepository";
import type {
  DevGrantCharacterResult,
  DevGrantItemResult,
  DevGrantProgressResult,
  DevGrantRepository
} from "./devGrantRepository";
import type { ItemGrant } from "./dailyActionRepository";
import { recordLevelMilestones } from "./levelMilestoneRepository";
import { countCharacterRemorts } from "./prismaRemortCount";

export class PrismaDevGrantRepository implements DevGrantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async addLevelForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantProgressResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const oldLevel = character.level;
      const newLevel = oldLevel + amount;
      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          level: newLevel
        },
        include: currentLocationInclude
      });
      await recordLevelMilestones(tx, character.id, oldLevel, newLevel);

      return {
        character: toCharacterRecord(updated),
        levelChange: {
          oldLevel,
          newLevel,
          leveledUp: newLevel > oldLevel
        }
      };
    });
  }

  async addXpForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantProgressResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const remortCount = await countCharacterRemorts(tx, character.id);
      const oldLevel = character.level;
      const nextXp = character.xp + amount;
      const nextLevel = Math.max(oldLevel, getLevelForXp(nextXp, { remortCount }));
      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          xp: nextXp,
          level: nextLevel
        },
        include: currentLocationInclude
      });
      await recordLevelMilestones(tx, character.id, oldLevel, nextLevel);

      return {
        character: toCharacterRecord(updated),
        levelChange: {
          oldLevel,
          newLevel: nextLevel,
          leveledUp: nextLevel > oldLevel
        }
      };
    });
  }

  async addGoldForTelegramUser(
    telegramUserId: bigint,
    amount: number
  ): Promise<DevGrantCharacterResult | null> {
    const updated = await this.prisma.character.updateMany({
      where: {
        user: {
          telegramUserId
        }
      },
      data: {
        gold: {
          increment: amount
        }
      }
    });

    if (updated.count !== 1) {
      return null;
    }

    const character = await this.prisma.character.findFirst({
      where: {
        user: {
          telegramUserId
        }
      },
      include: currentLocationInclude
    });

    return character ? { character: toCharacterRecord(character) } : null;
  }

  async addItemsForTelegramUser(
    telegramUserId: bigint,
    itemGrants: ItemGrant[]
  ): Promise<DevGrantItemResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const normalizedGrants = mergeItemGrants(itemGrants);

      for (const grant of normalizedGrants) {
        await tx.characterItem.upsert({
          where: {
            characterId_itemId: {
              characterId: character.id,
              itemId: grant.itemId
            }
          },
          create: {
            characterId: character.id,
            itemId: grant.itemId,
            quantity: grant.quantity
          },
          update: {
            quantity: {
              increment: grant.quantity
            }
          }
        });
      }

      return {
        character: toCharacterRecord(character),
        itemGrants: normalizedGrants
      };
    });
  }
}

const currentLocationInclude = {
  user: {
    select: {
      lastSeenLocationId: true
    }
  }
} satisfies Prisma.CharacterInclude;

async function findCharacterByTelegramUserId(
  tx: Prisma.TransactionClient,
  telegramUserId: bigint
): Promise<(Character & { user: { lastSeenLocationId: string | null } }) | null> {
  return tx.character.findFirst({
    where: {
      user: {
        telegramUserId
      }
    },
    include: currentLocationInclude
  });
}

function mergeItemGrants(itemGrants: ItemGrant[]): ItemGrant[] {
  const quantitiesByItemId = new Map<string, number>();

  for (const grant of itemGrants) {
    const quantity = Math.floor(grant.quantity);

    if (quantity <= 0) {
      continue;
    }

    quantitiesByItemId.set(grant.itemId, (quantitiesByItemId.get(grant.itemId) ?? 0) + quantity);
  }

  return [...quantitiesByItemId.entries()].map(([itemId, quantity]) => ({
    itemId,
    quantity
  }));
}

function toCharacterRecord(
  character: Character & { user: { lastSeenLocationId: string | null } }
): CharacterRecord {
  const { user, ...record } = character;

  return {
    ...record,
    currentLocationId: user.lastSeenLocationId
  };
}
