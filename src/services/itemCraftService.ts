import { items } from "../content";
import {
  findItemCraftRecipeByCode,
  getCraftRecipesForSourceItem,
  type ItemCraftRecipe
} from "../domain/itemCraft";
import type {
  ItemCraftConfirmRepositoryResult,
  ItemCraftPreviewRepositoryResult,
  ItemCraftRepository
} from "../db/repositories/itemCraftRepository";

export interface ItemCraftOption {
  recipe: ItemCraftRecipe;
}

export class ItemCraftService {
  constructor(
    private readonly repository: ItemCraftRepository,
    private readonly now: () => Date = () => new Date()
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
  ): Promise<ItemCraftConfirmRepositoryResult> {
    const recipe = findItemCraftRecipeByCode(recipeCode);

    return recipe
      ? this.repository.craftForTelegramUser(telegramUserId, {
          recipe,
          itemContents: items,
          now: this.now()
        })
      : { state: "locked" };
  }
}
