import type { ItemContent } from "../../content/schema";
import type { ItemCraftRecipe, ItemCraftSavingsRolls } from "../../domain/itemCraft";
import type { CharacterRecord } from "./characterRepository";

export interface ItemCraftPreviewRecord {
  recipe: ItemCraftRecipe;
  sourceItem: ItemContent;
  outputItem: ItemContent;
  availableQuantity: number;
}

export type ItemCraftPreviewRepositoryResult =
  | { state: "no-character" }
  | { state: "locked" }
  | { state: "combat-locked" }
  | { state: "not-enough"; preview: ItemCraftPreviewRecord }
  | { state: "preview"; preview: ItemCraftPreviewRecord };

export type ItemCraftConfirmRepositoryResult =
  | { state: "no-character" }
  | { state: "locked" }
  | { state: "combat-locked" }
  | { state: "not-enough"; preview: ItemCraftPreviewRecord }
  | {
      state: "crafted";
      character: CharacterRecord;
      recipe: ItemCraftRecipe;
      sourceItem: ItemContent;
      outputItem: ItemContent;
      spentSourceQuantity: number;
      savedSourceQuantity: number;
      remainingSourceQuantity: number;
      outputQuantity: number;
    };

export interface ItemCraftRepository {
  previewForTelegramUser(
    telegramUserId: bigint,
    input: {
      recipe: ItemCraftRecipe;
      itemContents: readonly ItemContent[];
    }
  ): Promise<ItemCraftPreviewRepositoryResult>;

  craftForTelegramUser(
    telegramUserId: bigint,
    input: {
      recipe: ItemCraftRecipe;
      itemContents: readonly ItemContent[];
      now: Date;
      craftSavingsRolls?: ItemCraftSavingsRolls;
    }
  ): Promise<ItemCraftConfirmRepositoryResult>;
}
