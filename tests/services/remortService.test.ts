import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type { CharacterItemRecord } from "../../src/db/repositories/inventoryRepository";
import type {
  RemortBoard,
  RemortCompletionInput,
  RemortCompletionResult,
  RemortDraftRecord,
  RemortRepository,
  RemortSnapshot
} from "../../src/db/repositories/remortRepository";
import { RemortService } from "../../src/services/remortService";

const telegramUserId = 42n;
const fixedNow = new Date("2026-06-16T09:00:00.000Z");

describe("RemortService", () => {
  it("locks remort below level 13", async () => {
    const service = new RemortService(
      new FakeRemortRepository(snapshot({ level: 12 })),
      () => fixedNow
    );

    await expect(service.openForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "locked",
      requiredLevel: 13
    });
  });

  it("opens a level 13 draft with safe item selection", async () => {
    const repository = new FakeRemortRepository(snapshot({
      level: 13,
      items: [
        item({ itemId: "item.foam-cork-of-accounting", quantity: 2 }),
        item({ id: "protected", itemId: "item.wet-hero-ticket", quantity: 1 }),
        item({ id: "equipped", itemId: "item.pan-of-persuasion", quantity: 1 })
      ],
      equippedItemIds: ["item.pan-of-persuasion"]
    }));
    const service = new RemortService(repository, () => fixedNow);

    const result = await service.openForTelegramUser(telegramUserId);

    expect(result.state).toBe("ready");
    if (result.state === "ready") {
      expect(result.eligibleItems.map((row) => row.itemId)).toEqual(["item.foam-cork-of-accounting"]);
      expect(result.selectedItems).toEqual([]);
      expect(repository.draft?.identity).toMatchObject({
        pronoun: "they",
        raceId: "race.human-ish",
        classId: "class.warrior"
      });
    }
  });

  it("confirms remort once, replays repeat, and resets to level 1 with memory bonus", async () => {
    const repository = new FakeRemortRepository(snapshot({
      level: 13,
      xp: 1300,
      gold: 777,
      remortCount: 1,
      items: [
        item({ itemId: "item.foam-cork-of-accounting", quantity: 2 }),
        item({ id: "protected", itemId: "item.wet-hero-ticket", quantity: 1 })
      ]
    }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready") {
      return;
    }

    await service.toggleItem(telegramUserId, opened.draft.token, "item.foam-cork-of-accounting");
    const first = await service.confirmForTelegramUser(telegramUserId, opened.draft.token);
    const second = await service.confirmForTelegramUser(telegramUserId, opened.draft.token);

    expect(first.state).toBe("completed");
    expect(second.state).toBe("replayed");
    if (first.state === "completed") {
      expect(first.character.level).toBe(1);
      expect(first.character.xp).toBe(0);
      expect(first.character.gold).toBe(0);
      expect(first.memoryRank).toBe(2);
      expect(first.hpBonus).toBe(4);
      expect(first.manaBonus).toBe(2);
      expect(first.preservedItems.map((row) => row.itemId)).toEqual([
        "item.foam-cork-of-accounting",
        "item.wet-hero-ticket"
      ]);
    }
    expect(repository.completedCount).toBe(1);
  });
});

class FakeRemortRepository implements RemortRepository {
  draft: RemortDraftRecord | null = null;
  completedCount = 0;
  private remort: RemortCompletionResult | null = null;

  constructor(private snapshotValue: RemortSnapshot | null) {}

  getSnapshotForTelegramUser(): Promise<RemortSnapshot | null> {
    if (!this.snapshotValue) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      ...this.snapshotValue,
      draft: this.draft
    });
  }

  createOrUpdateDraftForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<RemortRepository["createOrUpdateDraftForTelegramUser"]>[1]
  ): Promise<RemortDraftRecord | null> {
    this.draft = draft({
      token: input.token,
      identity: input.identity,
      selectedItems: input.selectedItems,
      expiresAt: input.expiresAt
    });
    return Promise.resolve(this.draft);
  }

  updateDraftForTelegramUser(
    _telegramUserId: bigint,
    input: Parameters<RemortRepository["updateDraftForTelegramUser"]>[1]
  ): Promise<RemortDraftRecord | null> {
    if (!this.draft || this.draft.token !== input.token) {
      return Promise.resolve(null);
    }

    this.draft = {
      ...this.draft,
      ...(input.identity ? { identity: input.identity } : {}),
      ...(input.selectedItems ? { selectedItems: input.selectedItems } : {}),
      expiresAt: input.expiresAt
    };

    return Promise.resolve(this.draft);
  }

  completeDraftForTelegramUser(
    _telegramUserId: bigint,
    input: RemortCompletionInput
  ): Promise<RemortCompletionResult> {
    if (this.remort) {
      return Promise.resolve({ ...this.remort, state: "replayed" } as RemortCompletionResult);
    }

    if (!this.snapshotValue || !this.draft) {
      return Promise.resolve({ state: "no-character" });
    }

    const validation = input.validate({
      ...this.snapshotValue,
      draft: this.draft
    });

    if (validation.state !== "ready") {
      return Promise.resolve(validation);
    }

    this.completedCount += 1;
    const character = {
      ...this.snapshotValue.character,
      pronoun: validation.identity.pronoun,
      raceId: validation.identity.raceId,
      classId: validation.identity.classId,
      level: 1,
      xp: 0,
      gold: 0,
      hpCurrent: validation.hpCurrent,
      hpMax: validation.hpMax,
      manaCurrent: validation.manaCurrent,
      manaMax: validation.manaMax,
      statsJson: validation.statsJson
    };
    this.snapshotValue = {
      ...this.snapshotValue,
      character,
      remortCount: this.snapshotValue.remortCount + 1
    };
    this.remort = {
      state: "completed",
      character,
      remort: {
        id: "remort-1",
        characterId: character.id,
        token: input.token,
        remortNumber: validation.remortNumber,
        previousLevel: 13,
        previousXp: 1300,
        previousGold: 777,
        displayNameSnapshot: character.name,
        preservedPayload: {
          identity: validation.identity,
          items: validation.keptItems,
          memoryRank: validation.memoryRank,
          hpBonus: validation.hpBonus,
          manaBonus: validation.manaBonus
        },
        createdAt: fixedNow
      }
    };

    return Promise.resolve(this.remort);
  }

  countByTelegramUserId(): Promise<number> {
    return Promise.resolve(this.snapshotValue?.remortCount ?? 0);
  }

  listBoard(): Promise<RemortBoard> {
    return Promise.resolve({ remorts: [] });
  }
}

function snapshot(input: {
  level: number;
  xp?: number;
  gold?: number;
  remortCount?: number;
  items?: CharacterItemRecord[];
  equippedItemIds?: string[];
}): RemortSnapshot {
  return {
    character: character({
      level: input.level,
      xp: input.xp ?? 0,
      gold: input.gold ?? 0
    }),
    remortCount: input.remortCount ?? 0,
    items: input.items ?? [],
    equippedItemIds: input.equippedItemIds ?? [],
    draft: null
  };
}

function draft(overrides: Partial<RemortDraftRecord>): RemortDraftRecord {
  return {
    id: "draft-1",
    characterId: "character-1",
    token: "0123456789abcdef",
    status: "pending",
    identity: {
      pronoun: "they",
      raceId: "race.human-ish",
      classId: "class.warrior"
    },
    selectedItems: [],
    expiresAt: new Date("2026-06-16T09:30:00.000Z"),
    completedAt: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function item(overrides: Partial<CharacterItemRecord>): CharacterItemRecord {
  return {
    id: "item-row-1",
    characterId: "character-1",
    itemId: "item.foam-cork-of-accounting",
    quantity: 1,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides
  };
}

function character(overrides: Partial<CharacterRecord>): CharacterRecord {
  return {
    id: "character-1",
    userId: "user-1",
    currentLocationId: "location.korchma.front",
    name: "Shannar de Kassal",
    pronoun: "they",
    path: "boundary",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 13,
    xp: 1300,
    gold: 0,
    hpCurrent: 40,
    hpMax: 40,
    manaCurrent: 20,
    manaMax: 20,
    statsJson: {
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    ...overrides
  };
}
