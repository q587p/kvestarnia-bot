import { describe, expect, it } from "vitest";
import { items } from "../../src/content";
import {
  ITEM_CRAFT_RECIPES,
  RESPONSIBLE_PANIC_BANDAGE_ITEM_ID
} from "../../src/domain/itemCraft";
import {
  presentItemCraftPreview,
  presentItemCraftResult
} from "../../src/bot/presenters/itemCraftPresenter";
import type {
  ItemCraftPreviewRepositoryResult
} from "../../src/db/repositories/itemCraftRepository";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";

const denseRecipe = ITEM_CRAFT_RECIPES[0];
const fieldKitRecipe = ITEM_CRAFT_RECIPES[1];
const sourceItem = items.find((item) => item.id === RESPONSIBLE_PANIC_BANDAGE_ITEM_ID)!;
const outputItem = items.find((item) => item.id === denseRecipe.outputItemId)!;

describe("item craft presenter", () => {
  it("limits craft savings preview copy to ranger/Yeger characters", () => {
    const ranger = presentItemCraftPreview(previewResult("class.ranger"));
    const warrior = presentItemCraftPreview(previewResult("class.warrior"));

    expect(ranger).toContain("Єгерська вправність може зекономити");
    expect(ranger).not.toContain("Рівень і удача");
    expect(warrior).toContain("Для цього класу рецепт витрачає рівно стільки бинтів");
    expect(warrior).not.toContain("може зекономити");
    expect(warrior).not.toContain("Рівень і удача");
  });

  it("keeps field-kit preview savings copy ranger-only", () => {
    const priest = presentItemCraftPreview(previewResult("class.priest", fieldKitRecipe));

    expect(priest).toContain("Створити Польова аптечка?");
    expect(priest).toContain("Для цього класу рецепт витрачає рівно стільки бинтів");
    expect(priest).not.toContain("може зекономити");
    expect(priest).not.toContain("Рівень і удача");
  });

  it("does not imply a failed savings roll for non-ranger craft results", () => {
    const text = presentItemCraftResult({
      state: "crafted",
      character: character("class.warrior"),
      recipe: denseRecipe,
      sourceItem,
      outputItem,
      spentSourceQuantity: denseRecipe.sourceQuantity,
      savedSourceQuantity: 0,
      remainingSourceQuantity: 0,
      outputQuantity: 1
    });

    expect(text).toContain("Рецепт витратив рівно стільки бинтів");
    expect(text).not.toContain("Цього разу вузли були чесні");
  });
});

function previewResult(
  characterClassId: string,
  recipe = denseRecipe
): ItemCraftPreviewRepositoryResult {
  return {
    state: "preview",
    preview: {
      recipe,
      sourceItem,
      outputItem: items.find((item) => item.id === recipe.outputItemId)!,
      availableQuantity: 111,
      characterClassId
    }
  };
}

function character(classId: string): CharacterRecord {
  return {
    id: "character-1",
    userId: "user-1",
    name: "Мандрівник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId,
    level: 4,
    xp: 0,
    gold: 0,
    hpCurrent: 25,
    hpMax: 25,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {}
  };
}
