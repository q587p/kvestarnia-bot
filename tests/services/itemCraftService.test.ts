import { describe, expect, it, vi } from "vitest";
import { items } from "../../src/content";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  ItemCraftConfirmRepositoryResult,
  ItemCraftRepository
} from "../../src/db/repositories/itemCraftRepository";
import {
  DENSE_BANDAGE_ITEM_ID,
  ITEM_CRAFT_RECIPES,
  RESPONSIBLE_PANIC_BANDAGE_ITEM_ID
} from "../../src/domain/itemCraft";
import type { AchievementService } from "../../src/services/achievementService";
import { ItemCraftService } from "../../src/services/itemCraftService";
import { FakeRandomSource } from "../../src/shared/random";

describe("ItemCraftService", () => {
  it("tracks a successful craft for immediate achievement notifications", async () => {
    const craftedAt = new Date("2026-07-03T09:00:00.000Z");
    const recipe = ITEM_CRAFT_RECIPES.find((candidate) => candidate.outputItemId === DENSE_BANDAGE_ITEM_ID)!;
    const repository = new FakeItemCraftRepository({
      state: "crafted",
      character: makeCharacter(),
      recipe,
      sourceItem: items.find((item) => item.id === RESPONSIBLE_PANIC_BANDAGE_ITEM_ID)!,
      outputItem: items.find((item) => item.id === DENSE_BANDAGE_ITEM_ID)!,
      spentSourceQuantity: 8,
      savedSourceQuantity: 0,
      remainingSourceQuantity: 0,
      outputQuantity: 1
    });
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([
      {
        id: "achievement.bandage.dense-crafted",
        title: "Бинт набрався серйозности",
        cosmeticTitleGrantId: null,
        unlockedAt: craftedAt
      }
    ]);
    const service = new ItemCraftService(
      repository,
      () => craftedAt,
      { trackEventSafely } as unknown as AchievementService,
      new FakeRandomSource([0.99, 0])
    );

    const result = await service.craftForTelegramUser(42n, recipe.code);

    expect(result).toMatchObject({
      state: "crafted",
      achievementUnlocks: [{ id: "achievement.bandage.dense-crafted" }]
    });
    expect(trackEventSafely).toHaveBeenCalledWith({
      type: "item.crafted",
      characterId: "character-42",
      itemId: DENSE_BANDAGE_ITEM_ID,
      occurredAt: craftedAt,
      sourceId: `${recipe.id}:${DENSE_BANDAGE_ITEM_ID}`
    });
  });
});

class FakeItemCraftRepository implements ItemCraftRepository {
  constructor(private readonly craftResult: ItemCraftConfirmRepositoryResult) {}

  previewForTelegramUser(): never {
    throw new Error("Not used in this test.");
  }

  craftForTelegramUser(): Promise<ItemCraftConfirmRepositoryResult> {
    return Promise.resolve(this.craftResult);
  }
}

function makeCharacter(): CharacterRecord {
  return {
    id: "character-42",
    userId: "user-42",
    name: "Мандрівник",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.ranger",
    level: 4,
    xp: 0,
    gold: 0,
    hpCurrent: 6,
    hpMax: 10,
    manaCurrent: 5,
    manaMax: 5,
    statsJson: {}
  };
}
