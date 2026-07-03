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

export interface ItemCraftSavingsRolls {
  chanceRoll: number;
  quantityRoll: number;
}

export interface ItemCraftSavingsResult {
  spentSourceQuantity: number;
  savedSourceQuantity: number;
  savingChance: number;
  maxSavedSourceQuantity: number;
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

export function rollItemCraftBandageSavings(
  recipe: ItemCraftRecipe,
  character: { level: number; stats: { luck: number } },
  rolls: ItemCraftSavingsRolls | undefined
): ItemCraftSavingsResult {
  if (!rolls) {
    return {
      spentSourceQuantity: recipe.sourceQuantity,
      savedSourceQuantity: 0,
      savingChance: getItemCraftSavingChance(character),
      maxSavedSourceQuantity: getItemCraftMaxSavedSourceQuantity(recipe, character)
    };
  }

  const savingChance = getItemCraftSavingChance(character);
  const maxSavedSourceQuantity = getItemCraftMaxSavedSourceQuantity(recipe, character);
  const savedSourceQuantity = rolls.chanceRoll < savingChance
    ? Math.min(
        recipe.sourceQuantity - 1,
        1 + Math.floor(clampRoll(rolls.quantityRoll) * maxSavedSourceQuantity)
      )
    : 0;

  return {
    spentSourceQuantity: recipe.sourceQuantity - savedSourceQuantity,
    savedSourceQuantity,
    savingChance,
    maxSavedSourceQuantity
  };
}

function getItemCraftSavingChance(character: { level: number; stats: { luck: number } }): number {
  const level = Math.max(1, Math.floor(character.level));
  const luck = Math.max(0, Math.floor(character.stats.luck));

  return Math.min(0.58, 0.13 + level * 0.012 + luck * 0.025);
}

function getItemCraftMaxSavedSourceQuantity(
  recipe: ItemCraftRecipe,
  character: { level: number; stats: { luck: number } }
): number {
  const level = Math.max(1, Math.floor(character.level));
  const luck = Math.max(0, Math.floor(character.stats.luck));

  return Math.min(5, recipe.sourceQuantity - 1, Math.max(1, Math.floor((level + luck) / 5)));
}

function clampRoll(value: number): number {
  return Math.min(0.999_999, Math.max(0, value));
}
