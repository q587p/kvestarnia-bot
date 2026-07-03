import { items } from "../content";
import {
  findItemCraftRecipeByCode,
  getCraftRecipesForSourceItem,
  type ItemCraftRecipe
} from "../domain/itemCraft";
import { CryptoRandomSource, type RandomSource } from "../shared/random";
import type {
  ItemCraftConfirmRepositoryResult,
  ItemCraftPreviewRepositoryResult,
  ItemCraftRepository
} from "../db/repositories/itemCraftRepository";
import type { AchievementService, AchievementUnlock } from "./achievementService";

export interface ItemCraftOption {
  recipe: ItemCraftRecipe;
}

export type ItemCraftConfirmResult =
  | Exclude<ItemCraftConfirmRepositoryResult, { state: "crafted" }>
  | (Extract<ItemCraftConfirmRepositoryResult, { state: "crafted" }> & {
      achievementUnlocks?: AchievementUnlock[];
    });

export class ItemCraftService {
  constructor(
    private readonly repository: ItemCraftRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly achievements?: AchievementService,
    private readonly rng: RandomSource = new CryptoRandomSource()
  ) {}

  async getCraftOptionsForTelegramUser(
    telegramUserId: bigint,
    sourceItemId: string
  ): Promise<ItemCraftOption[]> {
    const options: ItemCraftOption[] = [];

    for (const recipe of getCraftRecipesForSourceItem(sourceItemId)) {
      const preview = await this.repository.previewForTelegramUser(telegramUserId, {
        recipe,
        itemContents: items
      });

      if (preview.state === "preview") {
        options.push({ recipe });
      }
    }

    return options;
  }

  async previewForTelegramUser(
    telegramUserId: bigint,
    recipeCode: string
  ): Promise<ItemCraftPreviewRepositoryResult> {
    const recipe = findItemCraftRecipeByCode(recipeCode);

    return recipe
      ? this.repository.previewForTelegramUser(telegramUserId, { recipe, itemContents: items })
      : { state: "locked" };
  }

  async craftForTelegramUser(
    telegramUserId: bigint,
    recipeCode: string
  ): Promise<ItemCraftConfirmResult> {
    const recipe = findItemCraftRecipeByCode(recipeCode);
    const now = this.now();

    const result: ItemCraftConfirmRepositoryResult = recipe
      ? await this.repository.craftForTelegramUser(telegramUserId, {
          recipe,
          itemContents: items,
          now,
          craftSavingsRolls: {
            chanceRoll: this.rng.nextFloat(),
            quantityRoll: this.rng.nextFloat()
          }
        })
      : { state: "locked" };

    if (result.state !== "crafted") {
      return result;
    }

    const achievementUnlocks =
      (await this.achievements?.trackEventSafely({
        type: "item.crafted",
        characterId: result.character.id,
        itemId: result.outputItem.id,
        occurredAt: now,
        sourceId: `${result.recipe.id}:${result.outputItem.id}`
      })) ?? [];

    return {
      ...result,
      achievementUnlocks
    };
  }
}
