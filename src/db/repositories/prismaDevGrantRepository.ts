import type { Character, Prisma, PrismaClient } from "@prisma/client";
import { items } from "../../content";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import { getLevelForXp } from "../../domain/progression/level";
import type { CharacterRecord } from "./characterRepository";
import type {
  DevGrantCharacterResult,
  DevGrantCooldownResult,
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
      const remortCount = await countCharacterRemorts(tx, character.id);

      await recordLevelMilestones(tx, character.id, oldLevel, newLevel, undefined, {
        remortCount
      });

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
      await recordLevelMilestones(tx, character.id, oldLevel, nextLevel, undefined, {
        remortCount
      });

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

  async healForTelegramUser(
    telegramUserId: bigint,
    amount?: number
  ): Promise<DevGrantCharacterResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const hpCurrent = Math.max(0, Math.floor(character.hpCurrent));
      const hpMax = await getEffectiveHpMax(tx, character);
      const nextHp = amount === undefined
        ? hpMax
        : Math.min(hpMax, hpCurrent + Math.max(0, Math.floor(amount)));
      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          hpCurrent: nextHp,
          hpRegenAt: null
        },
        include: currentLocationInclude
      });

      return {
        character: {
          ...toCharacterRecord(updated),
          hpCurrent: Math.min(nextHp, hpMax),
          hpMax
        }
      };
    });
  }

  async restoreManaForTelegramUser(
    telegramUserId: bigint,
    amount?: number
  ): Promise<DevGrantCharacterResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const manaCurrent = Math.max(0, Math.floor(character.manaCurrent));
      const manaMax = await getEffectiveManaMax(tx, character);
      const nextMana = amount === undefined
        ? manaMax
        : Math.min(manaMax, manaCurrent + Math.max(0, Math.floor(amount)));
      const updated = await tx.character.update({
        where: {
          id: character.id
        },
        data: {
          manaCurrent: nextMana,
          manaRegenAt: null
        },
        include: currentLocationInclude
      });

      return {
        character: {
          ...toCharacterRecord(updated),
          manaCurrent: Math.min(nextMana, manaMax),
          manaMax
        }
      };
    });
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

  async clearCooldownForTelegramUser(
    telegramUserId: bigint,
    key: string
  ): Promise<DevGrantCooldownResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const deleted = await tx.characterCooldown.deleteMany({
        where: {
          characterId: character.id,
          key
        }
      });

      return {
        character: toCharacterRecord(character),
        cleared: deleted.count > 0
      };
    });
  }

  async finishCooldownForTelegramUser(
    telegramUserId: bigint,
    key: string,
    now: Date
  ): Promise<DevGrantCooldownResult | null> {
    return this.prisma.$transaction(async (tx) => {
      const character = await findCharacterByTelegramUserId(tx, telegramUserId);

      if (!character) {
        return null;
      }

      const updated = await tx.characterCooldown.updateMany({
        where: {
          characterId: character.id,
          key,
          availableAt: {
            gt: now
          }
        },
        data: {
          availableAt: now,
          updatedAt: now
        }
      });

      return {
        character: toCharacterRecord(character),
        cleared: updated.count > 0
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

async function getEffectiveHpMax(
  tx: Prisma.TransactionClient,
  character: Character & { user: { lastSeenLocationId: string | null } }
): Promise<number> {
  const [equipment, remortCount] = await Promise.all([
    tx.characterEquipment.findMany({
      where: {
        characterId: character.id
      },
      select: {
        itemId: true
      }
    }),
    countCharacterRemorts(tx, character.id)
  ]);
  const equippedItems = equipment.flatMap((row) => {
    const item = items.find((candidate) => candidate.id === row.itemId);

    return item ? [item] : [];
  });

  return summarizeCharacter(toCharacterRecord(character), {
    equippedItems,
    remortCount
  }).hpMax;
}

async function getEffectiveManaMax(
  tx: Prisma.TransactionClient,
  character: Character & { user: { lastSeenLocationId: string | null } }
): Promise<number> {
  const [equipment, remortCount] = await Promise.all([
    tx.characterEquipment.findMany({
      where: {
        characterId: character.id
      },
      select: {
        itemId: true
      }
    }),
    countCharacterRemorts(tx, character.id)
  ]);
  const equippedItems = equipment.flatMap((row) => {
    const item = items.find((candidate) => candidate.id === row.itemId);

    return item ? [item] : [];
  });

  return summarizeCharacter(toCharacterRecord(character), {
    equippedItems,
    remortCount
  }).manaMax;
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
