import { describe, expect, it } from "vitest";
import type { CharacterRecord } from "../../src/db/repositories/characterRepository";
import type {
  LevelBarterConfirmRepositoryResult,
  LevelBarterExchangePlan,
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

  it("previews remort-adjusted XP carry", async () => {
    const service = new LevelBarterService(
      new FakeLevelBarterRepository(snapshot({
        level: 9,
        xp: 800,
        remortCount: 1,
        gold: 975,
        items: [{ itemId: "item.pan-of-persuasion", quantity: 1 }]
      })),
      () => fixedNow
    );

    const preview = await service.createAutoPreviewForTelegramUser(telegramUserId);

    expect(preview.state).toBe("preview");
    if (preview.state === "preview") {
      expect(preview.offer.levelBefore).toBe(9);
      expect(preview.offer.levelAfter).toBe(10);
      expect(preview.offer.xpCarry).toBe(51);
      expect(preview.offer.xpAfter).toBe(1064);
      expect(preview.character.remortCount).toBe(1);
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

  it("replays a completed exchange without spending twice", async () => {
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

    const first = await service.confirmAutoExchangeForTelegramUser(telegramUserId, preview.offer.token);
    const second = await service.confirmAutoExchangeForTelegramUser(telegramUserId, preview.offer.token);

    expect(first.state).toBe("exchanged");
    expect(second.state).toBe("replayed");
    if (second.state === "replayed") {
      expect(second.offer.levelAfter).toBe(5);
      expect(second.character.gold).toBe(0);
    }
    expect(repository.confirmedCount).toBe(1);
  });

  it("denies gold-only exchange even with a full wallet", async () => {
    const service = new LevelBarterService(
      new FakeLevelBarterRepository(snapshot({
        level: 4,
        xp: 48,
        gold: 1000,
        items: []
      })),
      () => fixedNow
    );

    await expect(service.createAutoPreviewForTelegramUser(telegramUserId)).resolves.toMatchObject({
      state: "insufficient",
      eligibleTotalValue: 0,
      gold: 1000,
      combinedValue: 1000
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
  private completed: { character: CharacterRecord; plan: LevelBarterExchangePlan } | null = null;

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

    if (this.completed) {
      return Promise.resolve({
        state: "replayed",
        character: this.completed.character,
        remortCount: this.snapshot.remortCount,
        plan: this.completed.plan
      });
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
    this.completed = { character, plan: plan.plan };

    return Promise.resolve({
      state: "exchanged",
      character,
      remortCount: this.snapshot.remortCount,
      plan: plan.plan
    });
  }
}

function snapshot(input: {
  level?: number;
  xp?: number;
  gold?: number;
  remortCount?: number;
  items: Array<{ itemId: string; quantity: number }>;
}): LevelBarterSnapshot {
  return {
    character: character({
      level: input.level ?? 4,
      xp: input.xp ?? 48,
      gold: input.gold ?? 0
    }),
    remortCount: input.remortCount ?? 0,
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
