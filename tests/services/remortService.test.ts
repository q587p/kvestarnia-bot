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
import { buildRemortKeyboard } from "../../src/bot/keyboards/remortKeyboard";
import { makeRemortItemSelectionKey, RemortService } from "../../src/services/remortService";

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

  it("opens a level 13 draft with every known item available for explicit selection", async () => {
    const archivedItemId = "ARCHIVE:Legacy/Item_With_Callback_Breakers_And_A_Name_Long_Enough_To_Overflow";
    const repository = new FakeRemortRepository(snapshot({
      level: 13,
      items: [
        item({ itemId: "item.foam-cork-of-accounting", quantity: 2 }),
        item({ id: "protected", itemId: "item.wet-hero-ticket", quantity: 1 }),
        item({ id: "equipped", itemId: "item.pan-of-persuasion", quantity: 1 }),
        item({ id: "archived", itemId: archivedItemId, quantity: 3 })
      ],
      equippedItemIds: ["item.pan-of-persuasion"]
    }));
    const service = new RemortService(repository, () => fixedNow);

    const result = await service.openForTelegramUser(telegramUserId);

    expect(result.state).toBe("ready");
    if (result.state === "ready") {
      expect(result.eligibleItems.map((row) => row.itemId)).toEqual([
        "item.foam-cork-of-accounting",
        "item.wet-hero-ticket",
        "item.pan-of-persuasion",
        archivedItemId
      ]);
      expect(result.eligibleItems.map((row) => row.itemKey)).toEqual([
        makeRemortItemSelectionKey("item.foam-cork-of-accounting"),
        makeRemortItemSelectionKey("item.wet-hero-ticket"),
        makeRemortItemSelectionKey("item.pan-of-persuasion"),
        makeRemortItemSelectionKey(archivedItemId)
      ]);
      expect(result.eligibleItems.find((row) => row.itemId === "item.foam-cork-of-accounting")).toMatchObject({
        quantity: 2,
        known: true
      });
      expect(result.eligibleItems.find((row) => row.itemId === archivedItemId)).toMatchObject({
        name: "Архівна манатка",
        quantity: 3,
        known: false
      });
      expect(() => buildRemortKeyboard(result)).not.toThrow();
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
        item({ id: "protected", itemId: "item.wet-hero-ticket", quantity: 1 }),
        item({ id: "equipped", itemId: "item.pan-of-persuasion", quantity: 1 }),
        item({ id: "unselected-archived", itemId: "item.archived-old-ladle", quantity: 2 })
      ],
      equippedItemIds: ["item.pan-of-persuasion"]
    }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready") {
      return;
    }

    await service.toggleItem(telegramUserId, opened.draft.token, itemKey(opened, "item.foam-cork-of-accounting"));
    await service.toggleItem(telegramUserId, opened.draft.token, itemKey(opened, "item.wet-hero-ticket"));
    await service.toggleItem(telegramUserId, opened.draft.token, itemKey(opened, "item.pan-of-persuasion"));
    const first = await service.confirmForTelegramUser(telegramUserId, opened.draft.token);
    const second = await service.confirmForTelegramUser(telegramUserId, opened.draft.token);

    expect(first.state).toBe("completed");
    expect(second.state).toBe("replayed");
    if (first.state === "completed") {
      expect(first.character.level).toBe(1);
      expect(first.character.xp).toBe(0);
      expect(first.character.gold).toBe(0);
      expect(first.memoryRank).toBe(2);
      expect(first.hpBonus).toBe(23);
      expect(first.manaBonus).toBe(12);
      expect(first.statBonuses).toEqual([
        { stat: "strength", bonus: 3 },
        { stat: "dexterity", bonus: 1 },
        { stat: "intelligence", bonus: 1 },
        { stat: "charisma", bonus: 1 },
        { stat: "luck", bonus: 1 }
      ]);
      expect(first.statBonus).toEqual({ stat: "strength", bonus: 3 });
      expect(first.preservedItems).toEqual([
        expect.objectContaining({ itemId: "item.foam-cork-of-accounting", quantity: 1 }),
        expect.objectContaining({ itemId: "item.pan-of-persuasion", quantity: 1 }),
        expect.objectContaining({ itemId: "item.wet-hero-ticket", quantity: 1 })
      ]);
      expect(first.preservedItems.map((row) => row.itemId)).not.toContain("item.archived-old-ladle");
    }
    expect(repository.completedCount).toBe(1);
  });

  it("fails confirm when a selected item disappeared before confirmation", async () => {
    const repository = new FakeRemortRepository(snapshot({
      level: 13,
      items: [item({ itemId: "item.foam-cork-of-accounting", quantity: 1 })]
    }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready") {
      return;
    }

    await service.toggleItem(telegramUserId, opened.draft.token, itemKey(opened, "item.foam-cork-of-accounting"));
    repository.setItems([]);

    const result = await service.confirmForTelegramUser(telegramUserId, opened.draft.token);

    expect(result.state).toBe("invalid-draft");
    if (result.state === "invalid-draft") {
      expect(result.reason).toContain("манаток");
    }
    expect(repository.completedCount).toBe(0);
  });

  it("selects and preserves an archived item through its short callback key", async () => {
    const archivedItemId = "ARCHIVE:Legacy/Item_With_Callback_Breakers_And_A_Name_Long_Enough_To_Overflow";
    const repository = new FakeRemortRepository(snapshot({
      level: 13,
      items: [item({ itemId: archivedItemId, quantity: 4 })]
    }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready") {
      return;
    }

    const selected = await service.toggleItem(telegramUserId, opened.draft.token, itemKey(opened, archivedItemId));
    const result = await service.confirmForTelegramUser(telegramUserId, opened.draft.token);

    expect(selected.state).toBe("ready");
    if (selected.state === "ready") {
      expect(selected.selectedItems).toEqual([
        expect.objectContaining({
          itemId: archivedItemId,
          itemKey: makeRemortItemSelectionKey(archivedItemId),
          name: "Архівна манатка",
          quantity: 4
        })
      ]);
    }
    expect(result.state).toBe("completed");
    if (result.state === "completed") {
      expect(result.preservedItems).toEqual([
        expect.objectContaining({
          itemId: archivedItemId,
          name: "Архівна манатка",
          quantity: 1
        })
      ]);
    }
  });

  it("rejects stale remort item keys without crashing", async () => {
    const repository = new FakeRemortRepository(snapshot({
      level: 13,
      items: [item({ itemId: "item.foam-cork-of-accounting", quantity: 1 })]
    }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready") {
      return;
    }

    const result = await service.toggleItem(telegramUserId, opened.draft.token, "ffffffffffff");

    expect(result).toMatchObject({
      state: "invalid-selection",
      reason: "Ця манатка не проходить у нове життя."
    });
  });

  it("applies changed pronoun, race, class, starter stats, and memory bonus", async () => {
    const repository = new FakeRemortRepository(snapshot({
      level: 13,
      remortCount: 2
    }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready") {
      return;
    }

    await service.selectPronoun(telegramUserId, opened.draft.token, "she");
    await service.selectClass(telegramUserId, opened.draft.token, "mage");
    await service.selectRace(telegramUserId, opened.draft.token, "elf");

    const result = await service.confirmForTelegramUser(telegramUserId, opened.draft.token);

    expect(result.state).toBe("completed");
    if (result.state === "completed") {
      expect(result.character.pronoun).toBe("she");
      expect(result.character.path).toBe("moon");
      expect(result.character.raceId).toBe("race.elf");
      expect(result.character.classId).toBe("class.mage");
      expect(result.memoryRank).toBe(3);
      expect(result.hpBonus).toBe(34);
      expect(result.manaBonus).toBe(17);
      expect(result.statBonuses).toEqual([
        { stat: "strength", bonus: 4 },
        { stat: "dexterity", bonus: 2 },
        { stat: "intelligence", bonus: 1 },
        { stat: "charisma", bonus: 2 },
        { stat: "luck", bonus: 2 }
      ]);
      expect(result.statBonus).toEqual({ stat: "strength", bonus: 4 });
      expect(result.character.hpCurrent).toBe(result.character.hpMax);
      expect(result.character.manaCurrent).toBe(result.character.manaMax);
      expect(result.character.stats).toMatchObject({
        strength: 9,
        dexterity: 10,
        intelligence: 10,
        charisma: 7,
        luck: 7
      });
    }
  });

  it("rejects an invalid remort identity instead of completing", async () => {
    const repository = new FakeRemortRepository(snapshot({ level: 13 }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready" || !repository.draft) {
      return;
    }
    repository.draft = {
      ...repository.draft,
      identity: {
        pronoun: "he",
        raceId: "race.dryland-rusalka",
        classId: "class.ranger"
      }
    };

    const result = await service.confirmForTelegramUser(telegramUserId, opened.draft.token);

    expect(result.state).toBe("invalid-draft");
    expect(repository.completedCount).toBe(0);
  });

  it("keeps a selected race and falls back only the incompatible class", async () => {
    const repository = new FakeRemortRepository(snapshot({ level: 13 }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready") {
      return;
    }

    const result = await service.selectRace(telegramUserId, opened.draft.token, "molfar-soul");

    expect(result.state).toBe("ready");
    if (result.state === "ready") {
      expect(result.identity).toMatchObject({
        pronoun: "they",
        raceId: "race.molfar-soul",
        classId: "class.mage"
      });
    }
  });

  it("preserves the current race and class when selecting a still-valid pronoun", async () => {
    const repository = new FakeRemortRepository(snapshot({ level: 13 }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready") {
      return;
    }

    await service.selectRace(telegramUserId, opened.draft.token, "elf");
    await service.selectClass(telegramUserId, opened.draft.token, "mage");
    const result = await service.selectPronoun(telegramUserId, opened.draft.token, "she");

    expect(result.state).toBe("ready");
    if (result.state === "ready") {
      expect(result.identity).toMatchObject({
        pronoun: "she",
        raceId: "race.elf",
        classId: "class.mage"
      });
    }
  });

  it("rejects a race that is unavailable for the current pronoun", async () => {
    const repository = new FakeRemortRepository(snapshot({ level: 13 }));
    const service = new RemortService(repository, () => fixedNow);
    const opened = await service.openForTelegramUser(telegramUserId);
    expect(opened.state).toBe("ready");
    if (opened.state !== "ready") {
      return;
    }

    await service.selectPronoun(telegramUserId, opened.draft.token, "he");
    const result = await service.selectRace(telegramUserId, opened.draft.token, "dryland-rusalka");

    expect(result.state).toBe("invalid-selection");
    if (result.state === "invalid-selection") {
      expect(result.reason).toContain("русалка");
      expect(result.view?.identity.raceId).toBe("race.human-ish");
    }
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
      path: pathForPronoun(validation.identity.pronoun),
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
          manaBonus: validation.manaBonus,
          statBonuses: validation.statBonuses,
          statBonus: validation.statBonus
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

  setItems(items: CharacterItemRecord[]): void {
    if (!this.snapshotValue) {
      return;
    }

    this.snapshotValue = {
      ...this.snapshotValue,
      items
    };
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

function pathForPronoun(pronoun: string): string {
  if (pronoun === "he") {
    return "sun";
  }

  if (pronoun === "she") {
    return "moon";
  }

  return "boundary";
}

function itemKey(
  view: Extract<Awaited<ReturnType<RemortService["openForTelegramUser"]>>, { state: "ready" }>,
  itemId: string
): string {
  const item = view.eligibleItems.find((candidate) => candidate.itemId === itemId);
  if (!item) {
    throw new Error(`Missing remort item in test: ${itemId}`);
  }

  return item.itemKey;
}
