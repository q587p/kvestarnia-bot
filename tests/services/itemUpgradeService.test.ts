import { describe, expect, it, vi } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  ItemUpgradeAttemptResult,
  ItemUpgradeRepository,
  ItemUpgradeSnapshot
} from "../../src/db/repositories/itemUpgradeRepository";
import { ItemUpgradeService } from "../../src/services/itemUpgradeService";
import type { PublicActivityEventPublisher } from "../../src/services/publicActivityEventPublisher";
import { FakeRandomSource } from "../../src/shared/random";

const now = new Date("2026-07-08T10:00:00.000Z");
const character = buildCharacter();

describe("ItemUpgradeService", () => {
  it("publishes successful upgrades to public manatky activity", async () => {
    const repository = new FakeItemUpgradeRepository({
      state: "attempted",
      success: true,
      character,
      item: {
        id: "row-pan-plus-5",
        characterId: character.id,
        itemId: "item.pan-of-persuasion.plus-5",
        quantity: 1,
        equipped: false
      },
      donorConsumed: false,
      fromLevel: 4,
      targetLevel: 5,
      finalChance: 100,
      pityFailuresBefore: 0,
      pityFailuresAfter: 0,
      pityGuaranteed: false,
      spent: { gold: 900, iskrokamin: 17, mana: 0 }
    });
    const publisher = {
      recordItemUpgradeSucceededSafely: vi.fn(() => Promise.resolve(null))
    };
    const service = new ItemUpgradeService(
      repository,
      () => now,
      new FakeRandomSource([0]),
      undefined,
      publisher as unknown as PublicActivityEventPublisher
    );

    await expect(service.attemptForTelegramUser(42n, {
      itemId: "item.pan-of-persuasion.plus-4",
      method: "npc",
      expectedFromLevel: 4,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({ state: "attempted", success: true });

    expect(publisher.recordItemUpgradeSucceededSafely).toHaveBeenCalledWith({
      characterId: character.id,
      actorDisplayName: character.name,
      sourceId: "npc:character-42:item.pan-of-persuasion.plus-4:4->5",
      itemId: "item.pan-of-persuasion.plus-5",
      itemName: "Пательня переконання +5",
      targetLevel: 5,
      occurredAt: now
    });
  });

  it("does not publish failed upgrade attempts to public activity", async () => {
    const repository = new FakeItemUpgradeRepository({
      state: "attempted",
      success: false,
      character,
      item: {
        id: "row-pan-plus-4",
        characterId: character.id,
        itemId: "item.pan-of-persuasion.plus-4",
        quantity: 1,
        equipped: false
      },
      donorConsumed: false,
      fromLevel: 4,
      targetLevel: 5,
      finalChance: 0,
      pityFailuresBefore: 0,
      pityFailuresAfter: 1,
      pityGuaranteed: false,
      spent: { gold: 900, iskrokamin: 17, mana: 0 }
    });
    const publisher = {
      recordItemUpgradeSucceededSafely: vi.fn(() => Promise.resolve(null))
    };
    const service = new ItemUpgradeService(
      repository,
      () => now,
      new FakeRandomSource([0.99]),
      undefined,
      publisher as unknown as PublicActivityEventPublisher
    );

    await expect(service.attemptForTelegramUser(42n, {
      itemId: "item.pan-of-persuasion.plus-4",
      method: "npc",
      expectedFromLevel: 4,
      expectedQuantity: 1,
      expectedPityFailures: 0
    })).resolves.toMatchObject({ state: "attempted", success: false });

    expect(publisher.recordItemUpgradeSucceededSafely).not.toHaveBeenCalled();
  });
});

class FakeItemUpgradeRepository implements ItemUpgradeRepository {
  constructor(private readonly result: ItemUpgradeAttemptResult) {}

  getSnapshotForTelegramUser(): Promise<ItemUpgradeSnapshot | null> {
    return Promise.resolve(null);
  }

  attemptForTelegramUser(): Promise<ItemUpgradeAttemptResult> {
    return Promise.resolve(this.result);
  }

  setPityForTelegramUser(): Promise<{ character: CharacterRecord; failureCount: number } | null> {
    return Promise.resolve(null);
  }

  unlockForTelegramUser(): ReturnType<ItemUpgradeRepository["unlockForTelegramUser"]> {
    return Promise.resolve({ state: "no-character" });
  }
}

function buildCharacter(): CharacterRecord {
  return {
    id: "character-42",
    userId: "user-42",
    name: "Майстер",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 5,
    xp: 0,
    gold: 1000,
    hpCurrent: 25,
    hpMax: 25,
    manaCurrent: 10,
    manaMax: 10,
    currentLocationId: "location.korchma.yard",
    statsJson: { strength: 6, dexterity: 6, intelligence: 6, charisma: 6, luck: 6 }
  };
}
