import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  LevelBarterConfirmRepositoryResult,
  LevelBarterPlanResult,
  LevelBarterRepository,
  LevelBarterSnapshot
} from "../../src/db/repositories/levelBarterRepository";
import { LevelBarterService } from "../../src/services/levelBarterService";

const telegramUserId = 42n;
const fixedNow = new Date("2026-06-16T08:30:00.000Z");

describe("LevelBarterService", () => {
  it("returns no-character without a character", async () => {
    const service = new LevelBarterService(new FakeLevelBarterRepository(null), () => fixedNow);

    await expect(service.getOfferForTelegramUser(telegramUserId)).resolves.toEqual({
      state: "no-character"
    });
  });

  it("previews item value plus missing wallet gold", async () => {
    const service = new LevelBarterService(
      new FakeLevelBarterRepository(snapshot({
        gold: 975,
        items: [{ itemId: "item.pan-of-persuasion", quantity: 1 }]
      })),
      () => fixedNow
    );

    const preview = await service.createAutoPreviewForTelegramUser(telegramUserId);

    expect(preview.state).toBe("preview");
    if (preview.state === "preview") {
      expect(preview.offer.itemTotalValue).toBe(25);
      expect(preview.offer.goldSpent).toBe(975);
      expect(preview.offer.selectedTotalValue).toBe(1000);
      expect(preview.offer.levelAfter).toBe(5);
    }
  });

  it("confirms one level with XP carry and wallet spend", async () => {
    const repository = new FakeLevelBarterRepository(snapshot({
      level: 4,
      xp: 48,
      gold: 975,
      items: [{ itemId: "item.pan-of-persuasion", quantity: 1 }]
    }));
    const service = new LevelBarterService(repository, () => fixedNow);
    const preview = await service.createAutoPreviewForTelegramUser(telegramUserId);
    expect(preview.state).toBe("preview");
    if (preview.state !== "preview") {
      return;
    }

    const result = await service.confirmAutoExchangeForTelegramUser(telegramUserId, preview.offer.token);

    expect(result.state).toBe("exchanged");
    if (result.state === "exchanged") {
      expect(result.offer.levelBefore).toBe(4);
      expect(result.offer.levelAfter).toBe(5);
      expect(result.offer.xpCarry).toBe(3);
      expect(result.offer.xpAfter).toBe(73);
      expect(result.character.gold).toBe(0);
    }
    expect(repository.confirmedCount).toBe(1);
  });

  it("treats changed preview input as stale", async () => {
    const repository = new FakeLevelBarterRepository(snapshot({
      gold: 975,
      items: [{ itemId: "item.pan-of-persuasion", quantity: 1 }]
    }));
    const service = new LevelBarterService(repository, () => fixedNow);
    const preview = await service.createAutoPreviewForTelegramUser(telegramUserId);
    expect(preview.state).toBe("preview");
    if (preview.state !== "preview") {
      return;
    }
    repository.snapshot = snapshot({ gold: 975, items: [{ itemId: "item.pan-of-persuasion", quantity: 2 }] });

    await expect(service.confirmAutoExchangeForTelegramUser(telegramUserId, preview.offer.token)).resolves.toEqual({
      state: "stale-selection"
    });
  });

  it("blocks exchange into level 13", async () => {
    const service = new LevelBarterService(
      new FakeLevelBarterRepository(snapshot({
        level: 12,
        xp: 901,
        gold: 1000,
        items: []
      })),
      () => fixedNow
    );

    await expect(service.getOfferForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "battle-only-level",
      level: 13
    });
  });
});

class FakeLevelBarterRepository implements LevelBarterRepository {
  confirmedCount = 0;

  constructor(public snapshot: LevelBarterSnapshot | null) {}

  getSnapshotForTelegramUser(): Promise<LevelBarterSnapshot | null> {
    return Promise.resolve(this.snapshot);
  }

  confirmAutoExchangeForTelegramUser(
    _telegramUserId: bigint,
    input: {
      expectedToken: string;
      now: Date;
      createPlan: (snapshot: LevelBarterSnapshot) => LevelBarterPlanResult;
    }
  ): Promise<LevelBarterConfirmRepositoryResult> {
    if (!this.snapshot) {
      return Promise.resolve({ state: "no-character" });
    }

    const plan = input.createPlan(this.snapshot);

    if (plan.state === "battle-only-level" || plan.state === "insufficient") {
      return Promise.resolve(plan);
    }

    if (plan.state === "token-mismatch" || plan.plan.token !== input.expectedToken) {
      return Promise.resolve({ state: "stale-selection" });
    }

    this.confirmedCount += 1;
    const character = {
      ...this.snapshot.character,
      level: plan.plan.levelAfter,
      xp: plan.plan.xpAfter,
      gold: this.snapshot.character.gold - plan.plan.goldSpent
    };

    this.snapshot = {
      ...this.snapshot,
      character
    };

    return Promise.resolve({
      state: "exchanged",
      character,
      plan: plan.plan
    });
  }
}

function snapshot(input: {
  level?: number;
  xp?: number;
  gold?: number;
  items: Array<{ itemId: string; quantity: number }>;
}): LevelBarterSnapshot {
  return {
    character: character({
      level: input.level ?? 4,
      xp: input.xp ?? 48,
      gold: input.gold ?? 0
    }),
    items: input.items.map((entry, index) => ({
      id: `character-item-${index}`,
      characterId: "character-1",
      itemId: entry.itemId,
      quantity: entry.quantity,
      createdAt: fixedNow,
      updatedAt: fixedNow
    })),
    equippedItemIds: []
  };
}

function character(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: "character-1",
    userId: "user-1",
    currentLocationId: "location.korchma.front",
    name: "Shannar de Kassal",
    pronoun: "they",
    path: "boundary",
    raceId: "race.intellectual-orc",
    classId: "class.priest",
    level: 4,
    xp: 48,
    gold: 0,
    hpCurrent: 30,
    hpMax: 20,
    manaCurrent: 16,
    manaMax: 10,
    statsJson: {
      strength: 5,
      dexterity: 5,
      intelligence: 8,
      charisma: 6,
      luck: 5
    },
    ...overrides
  };
}
