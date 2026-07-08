import { Prisma, type PrismaClient } from "@prisma/client";
import type { ItemContent } from "../../content/schema";
import { summarizeCharacter } from "../../domain/characters/characterSummary";
import { rollItemCraftBandageSavings, type ItemCraftRecipe } from "../../domain/itemCraft";
import {
  YEGER_UNQUIET_TRIAL_BUCKET,
  YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY
} from "../../services/yegerQuestService";
import type { CharacterRecord } from "./characterRepository";
import type {
  ItemCraftConfirmRepositoryResult,
  ItemCraftPreviewRecord,
  ItemCraftPreviewRepositoryResult,
  ItemCraftRepository
} from "./itemCraftRepository";
import { getIncludedRemortCount } from "./prismaRemortCount";

type TxClient = Prisma.TransactionClient;

const characterInclude = {
  user: {
    select: {
      lastSeenLocationId: true
    }
  },
  activeCombatLease: true,
  _count: {
    select: {
      remorts: true
    }
  }
};

export class PrismaItemCraftRepository implements ItemCraftRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async previewForTelegramUser(
    telegramUserId: bigint,
    input: {
      recipe: ItemCraftRecipe;
      itemContents: readonly ItemContent[];
    }
  ): Promise<ItemCraftPreviewRepositoryResult> {
    return this.prisma.$transaction(async (tx) => {
      const checked = await getCraftContext(tx, telegramUserId, input.recipe, input.itemContents);

      if (checked.state !== "ready") {
        return checked;
      }

      const preview = checked.preview;
      return preview.availableQuantity >= input.recipe.sourceQuantity
        ? { state: "preview", preview }
        : { state: "not-enough", preview };
    });
  }

  async craftForTelegramUser(
    telegramUserId: bigint,
    input: {
      recipe: ItemCraftRecipe;
      itemContents: readonly ItemContent[];
      now: Date;
      craftSavingsRolls?: { chanceRoll: number; quantityRoll: number };
    }
  ): Promise<ItemCraftConfirmRepositoryResult> {
    return this.prisma.$transaction(async (tx) => {
      const checked = await getCraftContext(tx, telegramUserId, input.recipe, input.itemContents);

      if (checked.state !== "ready") {
        return checked;
      }

      const { character, preview } = checked;
      if (preview.availableQuantity < input.recipe.sourceQuantity) {
        return { state: "not-enough", preview };
      }

      const characterSummary = summarizeCharacter({
        ...character,
        currentLocationId: character.user.lastSeenLocationId
      }, {
        remortCount: getIncludedRemortCount(character)
      });
      const characterRecord = toCharacterRecord(character);
      const savings = rollItemCraftBandageSavings(input.recipe, characterSummary, input.craftSavingsRolls);
      const decremented = await tx.characterItem.updateMany({
        where: {
          characterId: character.id,
          itemId: input.recipe.sourceItemId,
          quantity: { gte: input.recipe.sourceQuantity }
        },
        data: {
          quantity: { decrement: savings.spentSourceQuantity },
          updatedAt: input.now
        }
      });

      if (decremented.count !== 1) {
        const refreshed = await getCraftContext(tx, telegramUserId, input.recipe, input.itemContents);
        return refreshed.state === "ready"
          ? { state: "not-enough", preview: refreshed.preview }
          : refreshed;
      }

      await tx.characterItem.deleteMany({
        where: {
          characterId: character.id,
          itemId: input.recipe.sourceItemId,
          quantity: { lte: 0 }
        }
      });

      const output = await tx.characterItem.upsert({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: input.recipe.outputItemId
          }
        },
        update: {
          quantity: { increment: input.recipe.outputQuantity },
          updatedAt: input.now
        },
        create: {
          characterId: character.id,
          itemId: input.recipe.outputItemId,
          quantity: input.recipe.outputQuantity
        }
      });
      const remaining = await tx.characterItem.findUnique({
        where: {
          characterId_itemId: {
            characterId: character.id,
            itemId: input.recipe.sourceItemId
          }
        }
      });

      return {
        state: "crafted",
        character: characterRecord,
        recipe: input.recipe,
        sourceItem: preview.sourceItem,
        outputItem: preview.outputItem,
        spentSourceQuantity: savings.spentSourceQuantity,
        savedSourceQuantity: savings.savedSourceQuantity,
        remainingSourceQuantity: remaining?.quantity ?? 0,
        outputQuantity: output.quantity
      };
    });
  }
}

type CraftContextResult =
  | { state: "no-character" }
  | { state: "locked" }
  | { state: "combat-locked" }
  | {
      state: "ready";
      character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>;
      preview: ItemCraftPreviewRecord;
    };

async function getCraftContext(
  tx: TxClient,
  telegramUserId: bigint,
  recipe: ItemCraftRecipe,
  itemContents: readonly ItemContent[]
): Promise<CraftContextResult> {
  const character = await findCharacter(tx, telegramUserId);
  if (!character) {
    return { state: "no-character" };
  }

  if (character.activeCombatLease) {
    return { state: "combat-locked" };
  }

  const unlockedByRemort = getIncludedRemortCount(character) > 0 && character.level >= 3;
  const completed = await tx.dailyAction.findFirst({
    where: {
      characterId: character.id,
      key: YEGER_UNQUIET_TRIAL_SECOND_COMPLETED_KEY,
      localDate: YEGER_UNQUIET_TRIAL_BUCKET
    }
  });
  if (!completed && !unlockedByRemort) {
    return { state: "locked" };
  }

  const sourceItem = itemContents.find((item) => item.id === recipe.sourceItemId);
  const outputItem = itemContents.find((item) => item.id === recipe.outputItemId);
  if (!sourceItem || !outputItem) {
    return { state: "locked" };
  }

  const stack = await tx.characterItem.findUnique({
    where: {
      characterId_itemId: {
        characterId: character.id,
        itemId: recipe.sourceItemId
      }
    }
  });

  return {
    state: "ready",
    character,
    preview: {
      recipe,
      sourceItem,
      outputItem,
      availableQuantity: stack?.quantity ?? 0,
      characterClassId: character.classId
    }
  };
}

async function findCharacter(tx: TxClient, telegramUserId: bigint) {
  return tx.character.findFirst({
    where: {
      user: { telegramUserId }
    },
    include: characterInclude
  });
}

function toCharacterRecord(character: NonNullable<Awaited<ReturnType<typeof findCharacter>>>): CharacterRecord {
  return {
    ...summarizeCharacter({
      ...character,
      currentLocationId: character.user.lastSeenLocationId
    }, {
      remortCount: getIncludedRemortCount(character)
    }),
    id: character.id,
    userId: character.userId,
    statsJson: character.statsJson
  };
}
