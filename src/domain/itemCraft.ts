export const RESPONSIBLE_PANIC_BANDAGE_ITEM_ID = "item.responsible-panic-bandage";
export const DENSE_BANDAGE_ITEM_ID = "item.dense-bandage";
export const FIELD_KIT_ITEM_ID = "item.field-kit";

export type ItemCraftRecipeId = "dense-bandage" | "field-kit";
export type ItemCraftRecipeCode = "dense" | "kit";

export interface ItemCraftRecipe {
  id: ItemCraftRecipeId;
  code: ItemCraftRecipeCode;
  sourceItemId: typeof RESPONSIBLE_PANIC_BANDAGE_ITEM_ID;
  outputItemId: typeof DENSE_BANDAGE_ITEM_ID | typeof FIELD_KIT_ITEM_ID;
  sourceQuantity: number;
  outputQuantity: 1;
  buttonLabel: string;
}

export const ITEM_CRAFT_RECIPES: readonly ItemCraftRecipe[] = [
  {
    id: "dense-bandage",
    code: "dense",
    sourceItemId: RESPONSIBLE_PANIC_BANDAGE_ITEM_ID,
    outputItemId: DENSE_BANDAGE_ITEM_ID,
    sourceQuantity: 8,
    outputQuantity: 1,
    buttonLabel: "🧵 Створити щільний бинт"
  },
  {
    id: "field-kit",
    code: "kit",
    sourceItemId: RESPONSIBLE_PANIC_BANDAGE_ITEM_ID,
    outputItemId: FIELD_KIT_ITEM_ID,
    sourceQuantity: 13,
    outputQuantity: 1,
    buttonLabel: "🧰 Створити польову аптечку"
  }
];

export function findItemCraftRecipeByCode(code: string): ItemCraftRecipe | null {
  return ITEM_CRAFT_RECIPES.find((recipe) => recipe.code === code) ?? null;
}

export function findItemCraftRecipeById(id: string): ItemCraftRecipe | null {
  return ITEM_CRAFT_RECIPES.find((recipe) => recipe.id === id) ?? null;
}

export function getCraftRecipesForSourceItem(itemId: string): readonly ItemCraftRecipe[] {
  return ITEM_CRAFT_RECIPES.filter((recipe) => recipe.sourceItemId === itemId);
}
