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
      spent: { gold: 900, iskrokamin: 89, mana: 0 }
    });
    const publisher = {
      recordItemUpgradeSucceededSafely:
        vi.fn<PublicActivityEventPublisher["recordItemUpgradeSucceededSafely"]>().mockResolvedValue(null)
    };
    const service = new ItemUpgradeService(
      repository,
      () => now,
      new FakeRandomSource([0]),
      undefined,
      publisher as unknown as PublicActivityEventPublisher,
      () => "activity-1"
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
      sourceId: "npc:character-42:item.pan-of-persuasion.plus-4:4->5:activity-1",
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
      spent: { gold: 900, iskrokamin: 89, mana: 0 }
    });
    const publisher = {
      recordItemUpgradeSucceededSafely:
        vi.fn<PublicActivityEventPublisher["recordItemUpgradeSucceededSafely"]>().mockResolvedValue(null)
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

  it("publishes separate successful upgrades with distinct public activity source ids", async () => {
    const repository = new SequencedItemUpgradeRepository([
      {
        state: "attempted",
        success: true,
        character,
        item: {
          id: "row-pan-plus-1-a",
          characterId: character.id,
          itemId: "item.pan-of-persuasion.plus-1",
          quantity: 1,
          equipped: false
        },
        donorConsumed: false,
        fromLevel: 0,
        targetLevel: 1,
        finalChance: 100,
        pityFailuresBefore: 0,
        pityFailuresAfter: 0,
        pityGuaranteed: false,
        spent: { gold: 50, iskrokamin: 2, mana: 0 }
      },
      {
        state: "attempted",
        success: true,
        character,
        item: {
          id: "row-pan-plus-1-b",
          characterId: character.id,
          itemId: "item.pan-of-persuasion.plus-1",
          quantity: 1,
          equipped: false
        },
        donorConsumed: false,
        fromLevel: 0,
        targetLevel: 1,
        finalChance: 100,
        pityFailuresBefore: 0,
        pityFailuresAfter: 0,
        pityGuaranteed: false,
        spent: { gold: 50, iskrokamin: 2, mana: 0 }
      }
    ]);
    const publisher = {
      recordItemUpgradeSucceededSafely:
        vi.fn<PublicActivityEventPublisher["recordItemUpgradeSucceededSafely"]>().mockResolvedValue(null)
    };
    let nonce = 0;
    const service = new ItemUpgradeService(
      repository,
      () => now,
      new FakeRandomSource([0, 0]),
      undefined,
      publisher as unknown as PublicActivityEventPublisher,
      () => `activity-${++nonce}`
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(service.attemptForTelegramUser(42n, {
        itemId: "item.pan-of-persuasion",
        method: "npc",
        expectedFromLevel: 0,
        expectedQuantity: 2 - attempt,
        expectedPityFailures: 0
      })).resolves.toMatchObject({ state: "attempted", success: true });
    }

    const sourceIds = publisher.recordItemUpgradeSucceededSafely.mock.calls.map(([input]) => input.sourceId);

    expect(sourceIds).toEqual([
      "npc:character-42:item.pan-of-persuasion:0->1:activity-1",
      "npc:character-42:item.pan-of-persuasion:0->1:activity-2"
    ]);
    expect(new Set(sourceIds)).toHaveProperty("size", 2);
  });

  it("orders same-template donors before same-set and same-slot donors in previews", async () => {
    const repository = new FakeItemUpgradeRepository({ state: "no-character" }, {
      character,
      unlocked: true,
      pities: [],
      items: [
        {
          id: "row-helm",
          characterId: character.id,
          itemId: "item.set.barrel-brother.helm",
          quantity: 2,
          equipped: false
        },
        {
          id: "row-cuirass",
          characterId: character.id,
          itemId: "item.set.barrel-brother.cuirass",
          quantity: 1,
          equipped: false
        },
        {
          id: "row-pot-helmet",
          characterId: character.id,
          itemId: "item.pot-helmet-of-early-access",
          quantity: 1,
          equipped: false
        }
      ]
    });
    const service = new ItemUpgradeService(repository, () => now, new FakeRandomSource([0]));

    const result = await service.previewForTelegramUser(42n, "item.set.barrel-brother.helm");

    expect(result).toMatchObject({
      state: "ready",
      item: {
        isSetPiece: true,
        setId: "mantok-set.barrel-brother-bulwark"
      }
    });
    expect(result.state === "ready" ? result.donorOptions.map((donor) => donor.kind) : []).toEqual([
      "same-template",
      "same-set",
      "same-slot"
    ]);
  });

  it("returns current gold and Iskrokamin balances in upgrade previews", async () => {
    const repository = new FakeItemUpgradeRepository({ state: "no-character" }, {
      character: { ...character, gold: 321 },
      unlocked: true,
      pities: [],
      items: [
        {
          id: "row-pan",
          characterId: character.id,
          itemId: "item.pan-of-persuasion",
          quantity: 1,
          equipped: false
        },
        {
          id: "row-iskrokamin",
          characterId: character.id,
          itemId: "item.iskrokamin",
          quantity: 8,
          equipped: false
        }
      ]
    });
    const service = new ItemUpgradeService(repository, () => now, new FakeRandomSource([0]));

    const result = await service.previewForTelegramUser(42n, "item.pan-of-persuasion");

    expect(result).toMatchObject({
      state: "ready",
      available: {
        gold: 321,
        iskrokamin: 8
      }
    });
  });
});

class FakeItemUpgradeRepository implements ItemUpgradeRepository {
  constructor(
    private readonly result: ItemUpgradeAttemptResult,
    private readonly snapshot: ItemUpgradeSnapshot | null = null
  ) {}

  getSnapshotForTelegramUser(): Promise<ItemUpgradeSnapshot | null> {
    return Promise.resolve(this.snapshot);
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

class SequencedItemUpgradeRepository implements ItemUpgradeRepository {
  private index = 0;

  constructor(private readonly results: ItemUpgradeAttemptResult[]) {}

  getSnapshotForTelegramUser(): Promise<ItemUpgradeSnapshot | null> {
    return Promise.resolve(null);
  }

  attemptForTelegramUser(): Promise<ItemUpgradeAttemptResult> {
    const result = this.results[this.index];
    this.index += 1;

    if (!result) {
      throw new Error("No fake item upgrade result configured for attempt.");
    }

    return Promise.resolve(result);
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
