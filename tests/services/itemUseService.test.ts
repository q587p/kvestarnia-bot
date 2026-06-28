import { describe, expect, it, vi } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  ItemUseConfirmRepositoryResult,
  ItemUseRepository
} from "../../src/db/repositories/itemUseRepository";
import type { AchievementService } from "../../src/services/achievementService";
import { BANDAGE_ITEM_ID, ItemUseService } from "../../src/services/itemUseService";

describe("ItemUseService", () => {
  it("tracks a successful bandage use for immediate achievement notifications", async () => {
    const completedAt = new Date("2026-06-28T09:00:00.000Z");
    const repository = new FakeItemUseRepository({
      state: "used",
      character: makeCharacter(),
      order: {
        id: "item-use-1",
        token: "token-1",
        characterId: "character-42",
        telegramUserId: 42n,
        remortCount: 0,
        itemId: BANDAGE_ITEM_ID,
        itemName: "Бинт відповідальної паніки",
        itemFingerprint: "fingerprint",
        quantity: 1,
        effectKind: "heal-hp",
        status: "completed",
        preview: {
          rulesVersion: "item-use-v1",
          hpBefore: 1,
          hpMax: 10,
          healAmount: 5,
          hpAfter: 6
        },
        result: {
          kind: "heal-hp",
          itemId: BANDAGE_ITEM_ID,
          itemName: "Бинт відповідальної паніки",
          rulesVersion: "item-use-v1",
          hpBefore: 1,
          hpMax: 10,
          healAmount: 5,
          hpAfter: 6
        },
        expiresAt: new Date("2026-06-28T09:23:00.000Z"),
        completedAt,
        cancelledAt: null,
        createdAt: completedAt,
        updatedAt: completedAt
      }
    });
    const trackEventSafely = vi.fn<AchievementService["trackEventSafely"]>().mockResolvedValue([
      {
        id: "achievement.bandage.first-used",
        title: "Паніка спрацювала за призначенням",
        cosmeticTitleGrantId: null,
        unlockedAt: completedAt
      }
    ]);
    const service = new ItemUseService(
      repository,
      () => completedAt,
      { trackEventSafely } as unknown as AchievementService
    );

    const result = await service.confirmForTelegramUser(42n, "token-1");

    expect(result).toMatchObject({
      state: "used",
      achievementUnlocks: [{ id: "achievement.bandage.first-used" }]
    });
    expect(trackEventSafely).toHaveBeenCalledWith({
      type: "item.used",
      characterId: "character-42",
      itemId: BANDAGE_ITEM_ID,
      occurredAt: completedAt,
      sourceId: "item-use-1"
    });
  });
});

class FakeItemUseRepository implements ItemUseRepository {
  constructor(private readonly confirmResult: ItemUseConfirmRepositoryResult) {}

  createPreviewForTelegramUser(): never {
    throw new Error("Not used in this test.");
  }

  confirmForTelegramUser(): Promise<ItemUseConfirmRepositoryResult> {
    return Promise.resolve(this.confirmResult);
  }

  cancelForTelegramUser(): never {
    throw new Error("Not used in this test.");
  }

  restoreToFullForTelegramUser(): never {
    throw new Error("Not used in this test.");
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
