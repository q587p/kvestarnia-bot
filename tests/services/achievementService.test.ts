import { describe, expect, it } from "vitest";
import type {
  AchievementRepository,
  AchievementRecalculationSnapshot,
  CharacterAchievementProgressRecord,
  CharacterAchievementRecord,
  CharacterAchievementSnapshot,
  UnlockAchievementInput,
  UnlockAchievementResult
} from "../../src/db/repositories/achievementRepository";
import { AchievementService } from "../../src/services/achievementService";

describe("AchievementService", () => {
  it("unlocks character creation once and grants cosmetic title provenance", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);
    const event = {
      type: "character.created" as const,
      characterId: "character-1",
      raceId: "race.human-ish",
      classId: "class.bard",
      occurredAt: new Date("2026-06-28T09:00:00.000Z"),
      sourceId: "character-1"
    };

    const first = await service.trackEvent(event);
    const second = await service.trackEvent(event);

    expect(first.map((unlock) => unlock.id)).toEqual([
      "achievement.character.created",
      "achievement.race.human-ish",
      "achievement.class.bard"
    ]);
    expect(second).toEqual([]);
    expect(repo.snapshot.achievements).toHaveLength(3);
    expect(repo.snapshot.titleGrants).toMatchObject([
      {
        titleGrantId: "cosmetic-title.first-ink",
        achievementId: "achievement.character.created",
        sourceType: "character.created",
        sourceId: "character-1"
      },
      {
        titleGrantId: "cosmetic-title.human-ish-paperproof",
        achievementId: "achievement.race.human-ish",
        sourceType: "character.created",
        sourceId: "character-1"
      },
      {
        titleGrantId: "cosmetic-title.bard-dangerous-couplet",
        achievementId: "achievement.class.bard",
        sourceType: "character.created",
        sourceId: "character-1"
      }
    ]);
  });

  it("keeps level progress monotonic and unlocks thresholds once", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    await service.trackEvent({
      type: "level.reached",
      characterId: "character-1",
      level: 4,
      occurredAt: new Date("2026-06-28T09:00:00.000Z"),
      sourceId: "daily-1"
    });
    await service.trackEvent({
      type: "level.reached",
      characterId: "character-1",
      level: 2,
      occurredAt: new Date("2026-06-28T09:01:00.000Z"),
      sourceId: "daily-2"
    });
    const levelFive = await service.trackEvent({
      type: "level.reached",
      characterId: "character-1",
      level: 5,
      occurredAt: new Date("2026-06-28T09:02:00.000Z"),
      sourceId: "daily-3"
    });

    expect(repo.progressFor("achievement.level.3")?.current).toBe(3);
    expect(repo.progressFor("achievement.level.5")?.current).toBe(5);
    expect(levelFive.map((unlock) => unlock.id)).toEqual(["achievement.level.5"]);
  });

  it("ignores disabled definitions", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    const unlocks = await service.trackEvent({
      type: "combat.finished",
      characterId: "character-1",
      outcome: "expired",
      occurredAt: new Date("2026-06-28T09:00:00.000Z"),
      sourceId: "session-1"
    });

    expect(unlocks).toEqual([]);
  });

  it("lists earned, locked, hidden and unknown stored entries safely", async () => {
    const repo = new FakeAchievementRepository();
    repo.snapshot.achievements.push({
      id: "stored-unknown",
      characterId: "character-1",
      achievementId: "achievement.retired.example",
      sourceType: "test",
      sourceId: null,
      sourceJson: null,
      unlockedAt: new Date("2026-06-28T09:00:00.000Z"),
      notifiedAt: null,
      createdAt: new Date("2026-06-28T09:00:00.000Z")
    });
    const service = new AchievementService(repo);

    const firstPage = await service.listForCharacter("character-1");
    const remainingPages = await Promise.all(
      Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
        service.listForCharacter("character-1", index + 1)
      )
    );
    const allEntries = [firstPage, ...remainingPages].flatMap((page) => page.entries);

    expect(allEntries.some((entry) => entry.earned && entry.unknownStored)).toBe(true);
    const hiddenLocked = allEntries.find((entry) => entry.id === "achievement.remort.first-memory");
    expect(hiddenLocked).toMatchObject({
      earned: false,
      title: "Таємна ачівка"
    });
    expect(hiddenLocked?.description).not.toContain("реморт");
  });

  it("filters earned and locked achievement list entries", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    await service.trackEvent({
      type: "character.created",
      characterId: "character-1",
      occurredAt: new Date("2026-06-28T09:00:00.000Z"),
      sourceId: "character-1"
    });

    const earned = await service.listForCharacter("character-1", 0, "earned");
    const locked = await service.listForCharacter("character-1", 0, "locked");

    expect(earned.filter).toBe("earned");
    expect(earned.entries.every((entry) => entry.earned)).toBe(true);
    expect(locked.filter).toBe("locked");
    expect(locked.entries.every((entry) => !entry.earned)).toBe(true);
    expect(earned.earnedCount).toBe(locked.earnedCount);
    expect(earned.totalCount).toBe(locked.totalCount);
  });


  it("recalculates provable historical achievements from the current character snapshot", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = {
      characterId: "character-1",
      level: 13,
      raceId: "race.domovyk",
      classId: "class.ranger",
      createdAt: new Date("2026-06-28T08:00:00.000Z"),
      levelReachedAt: {
        2: new Date("2026-06-28T08:10:00.000Z"),
        3: new Date("2026-06-28T08:20:00.000Z"),
        5: new Date("2026-06-28T08:30:00.000Z"),
        10: new Date("2026-06-28T08:40:00.000Z"),
        13: new Date("2026-06-28T08:50:00.000Z")
      },
      combat: {
        won: 3,
        lost: 1,
        fled: 1,
        expired: 0
      },
      combatFinishedAt: {
        won: [
          new Date("2026-06-28T09:00:00.000Z"),
          new Date("2026-06-28T09:10:00.000Z"),
          new Date("2026-06-28T09:20:00.000Z")
        ],
        lost: [new Date("2026-06-28T09:30:00.000Z")],
        fled: [new Date("2026-06-28T09:40:00.000Z")],
        expired: []
      },
      completedProblemQuestStages: 2,
      problemQuestCompletedAt: [
        new Date("2026-06-28T09:50:00.000Z"),
        new Date("2026-06-28T09:55:00.000Z")
      ],
      inventoryItemQuantity: 106,
      inventoryItemQuantities: {
        "item.responsible-panic-bandage": 93,
        "item.test-other": 13
      },
      inventoryItemRows: {
        "item.responsible-panic-bandage": {
          quantity: 93,
          createdAt: new Date("2026-06-28T09:45:00.000Z"),
          updatedAt: new Date("2026-06-28T10:45:00.000Z")
        },
        "item.test-other": {
          quantity: 13,
          createdAt: new Date("2026-06-28T09:46:00.000Z"),
          updatedAt: new Date("2026-06-28T10:46:00.000Z")
        }
      },
      firstInventoryItemReceivedAt: new Date("2026-06-28T09:45:00.000Z"),
      inventoryObservedAt: new Date("2026-06-28T10:46:00.000Z"),
      equippedItemCount: 3,
      firstEquippedItemAt: new Date("2026-06-28T10:00:00.000Z"),
      equipmentObservedAt: new Date("2026-06-28T10:05:00.000Z"),
      activityDates: {
        "item.used": [
          new Date("2026-06-28T10:10:00.000Z"),
          new Date("2026-06-28T10:11:00.000Z"),
          new Date("2026-06-28T10:12:00.000Z"),
          new Date("2026-06-28T10:13:00.000Z")
        ],
        "item.used:item.responsible-panic-bandage": [
          new Date("2026-06-28T10:10:00.000Z"),
          new Date("2026-06-28T10:11:00.000Z"),
          new Date("2026-06-28T10:12:00.000Z"),
          new Date("2026-06-28T10:13:00.000Z")
        ],
        "mantok.chest.completed": [new Date("2026-06-28T10:20:00.000Z")],
        "level.barter.completed": [new Date("2026-06-28T10:21:00.000Z")],
        "training.doppelganger.finished": [new Date("2026-06-28T10:22:00.000Z")],
        "duel.quick.resolved": [new Date("2026-06-28T10:23:00.000Z")],
        "duel.turnbased.resolved": [new Date("2026-06-28T10:24:00.000Z")],
        "barrel.raid.claimed": [new Date("2026-06-28T10:25:00.000Z")],
        "korchma.round.purchased": [new Date("2026-06-28T10:26:00.000Z")],
        "item.gift.sent": [new Date("2026-06-28T10:27:00.000Z")],
        "item.gift.received": [new Date("2026-06-28T10:28:00.000Z")],
        "mantok.sale.completed": [new Date("2026-06-28T10:29:00.000Z")],
        "bard.performance.completed": [new Date("2026-06-28T10:30:00.000Z")],
        "yeger.free-bandage.claimed": [new Date("2026-06-28T10:31:00.000Z")],
        "shynok.drink.activated": [
          new Date("2026-06-28T10:32:00.000Z"),
          new Date("2026-06-28T10:33:00.000Z"),
          new Date("2026-06-28T10:34:00.000Z"),
          new Date("2026-06-28T10:35:00.000Z")
        ],
        "passage.search.completed": [
          new Date("2026-06-28T10:36:00.000Z"),
          new Date("2026-06-28T10:37:00.000Z"),
          new Date("2026-06-28T10:38:00.000Z"),
          new Date("2026-06-28T10:39:00.000Z"),
          new Date("2026-06-28T10:40:00.000Z")
        ],
        "passage.search.monster-attack": [new Date("2026-06-28T10:37:00.000Z")],
        "passage.search.unique-nodes": [
          new Date("2026-06-28T10:36:00.000Z"),
          new Date("2026-06-28T10:37:00.000Z"),
          new Date("2026-06-28T10:38:00.000Z"),
          new Date("2026-06-28T10:39:00.000Z"),
          new Date("2026-06-28T10:40:00.000Z")
        ],
        "hunt.contract.completed": [new Date("2026-06-28T10:41:00.000Z")],
        "adventure.choice.completed": [
          new Date("2026-06-28T10:42:00.000Z"),
          new Date("2026-06-28T10:43:00.000Z"),
          new Date("2026-06-28T10:44:00.000Z")
        ],
        "adventure.choice.complication": [new Date("2026-06-28T10:44:00.000Z")],
        "combat.threat-escalated": [
          new Date("2026-06-28T10:45:00.000Z"),
          new Date("2026-06-28T10:46:00.000Z"),
          new Date("2026-06-28T10:47:00.000Z")
        ],
        "combat.threat-pressure": [
          new Date("2026-06-28T10:46:00.000Z"),
          new Date("2026-06-28T10:47:00.000Z")
        ]
      }
    };
    const service = new AchievementService(repo);

    const result = await service.recalculateForCharacter(
      "character-1",
      new Date("2026-06-28T10:00:00.000Z")
    );
    const duplicate = await service.recalculateForCharacter(
      "character-1",
      new Date("2026-06-28T10:01:00.000Z")
    );

    expect(result.unlocks.map((unlock) => unlock.id)).toEqual([
      "achievement.character.created",
      "achievement.race.domovyk",
      "achievement.class.ranger",
      "achievement.level.2",
      "achievement.level.3",
      "achievement.level.5",
      "achievement.level.10",
      "achievement.level.13",
      "achievement.combat.first-win",
      "achievement.combat.three-wins",
      "achievement.combat.first-loss",
      "achievement.combat.first-flee",
      "achievement.quest.first-problem",
      "achievement.quest.problem-chain.23",
      "achievement.item.first-received",
      "achievement.item.three-owned",
      "achievement.item.thirteen-owned",
      "achievement.bandage.first-owned",
      "achievement.bandage.ninety-three-owned",
      "achievement.bandage.first-used",
      "achievement.bandage.four-used",
      "achievement.yeger.free-bandage.first",
      "achievement.equipment.first-equipped",
      "achievement.equipment.three-equipped",
      "achievement.item.twenty-three-owned",
      "achievement.item.forty-two-owned",
      "achievement.item.ninety-three-owned",
      "achievement.mantok.chest.first",
      "achievement.mantok.sale.first",
      "achievement.level.barter.first",
      "achievement.bard.performance.first",
      "achievement.training.doppelganger.first",
      "achievement.duel.quick.first",
      "achievement.duel.turnbased.first",
      "achievement.barrel.raid.first",
      "achievement.korchma.round.first",
      "achievement.item.gift.sent.first",
      "achievement.item.gift.received.first",
      "achievement.shynok.drink.first",
      "achievement.shynok.drink.four",
      "achievement.passage.search.first",
      "achievement.passage.search.monster.first",
      "achievement.passage.search.all-current",
      "achievement.hunt.contract.first",
      "achievement.adventure.choice.first",
      "achievement.adventure.choice.complication.first",
      "achievement.combat.threat-escalation.first",
      "achievement.combat.threat-escalation.three",
      "achievement.combat.threat-pressure.first"
    ]);
    expect(duplicate.unlocks).toEqual([]);
    expect(repo.achievementFor("achievement.character.created")?.unlockedAt).toEqual(
      new Date("2026-06-28T08:00:00.000Z")
    );
    expect(repo.achievementFor("achievement.level.3")?.unlockedAt).toEqual(
      new Date("2026-06-28T08:20:00.000Z")
    );
    expect(repo.progressFor("achievement.level.23")?.current).toBe(13);
    expect(repo.progressFor("achievement.combat.thirteen-wins")?.current).toBe(3);
    expect(repo.progressFor("achievement.item.thirteen-owned")?.current).toBe(13);
    expect(repo.progressFor("achievement.bandage.ninety-three-owned")?.current).toBe(93);
    expect(repo.progressFor("achievement.bandage.four-used")?.current).toBe(4);
    expect(repo.progressFor("achievement.shynok.drink.four")?.current).toBe(4);
    expect(repo.progressFor("achievement.passage.search.all-current")?.current).toBe(5);
    expect(repo.progressFor("achievement.hunt.contract.thirteen")?.current).toBe(1);
    expect(repo.progressFor("achievement.adventure.choice.thirteen")?.current).toBe(3);
    expect(repo.progressFor("achievement.combat.threat-pressure.three")?.current).toBe(2);
  });
});

class FakeAchievementRepository implements AchievementRepository {
  snapshot: CharacterAchievementSnapshot = {
    achievements: [],
    progress: [],
    titleGrants: []
  };
  recalculationSnapshot: AchievementRecalculationSnapshot | null = null;

  listForCharacter(): Promise<CharacterAchievementSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  getRecalculationSnapshot(): Promise<AchievementRecalculationSnapshot | null> {
    return Promise.resolve(this.recalculationSnapshot);
  }

  unlockAchievement(input: UnlockAchievementInput): Promise<UnlockAchievementResult> {
    const existing = this.snapshot.achievements.find(
      (row) => row.characterId === input.characterId && row.achievementId === input.achievementId
    );

    if (existing) {
      return Promise.resolve({
        created: false,
        achievement: existing,
        titleGrant: input.cosmeticTitleGrantId
          ? this.snapshot.titleGrants.find((row) => row.titleGrantId === input.cosmeticTitleGrantId) ?? null
          : null
      });
    }

    const achievement: CharacterAchievementRecord = {
      id: `achievement-row-${this.snapshot.achievements.length + 1}`,
      characterId: input.characterId,
      achievementId: input.achievementId,
      sourceType: input.source.type,
      sourceId: input.source.id ?? null,
      sourceJson: null,
      unlockedAt: input.source.occurredAt,
      notifiedAt: null,
      createdAt: input.source.occurredAt
    };
    this.snapshot.achievements.push(achievement);

    const titleGrant = input.cosmeticTitleGrantId
      ? {
          id: `title-row-${this.snapshot.titleGrants.length + 1}`,
          characterId: input.characterId,
          titleGrantId: input.cosmeticTitleGrantId,
          achievementId: input.achievementId,
          sourceType: input.source.type,
          sourceId: input.source.id ?? null,
          grantedAt: input.source.occurredAt,
          createdAt: input.source.occurredAt
        }
      : null;

    if (titleGrant) {
      this.snapshot.titleGrants.push(titleGrant);
    }

    return Promise.resolve({ created: true, achievement, titleGrant });
  }

  updateProgressMax(input: {
    characterId: string;
    achievementId: string;
    current: number;
    target?: number;
  }): Promise<CharacterAchievementProgressRecord> {
    const existing = this.progressFor(input.achievementId);

    if (existing && existing.current >= input.current) {
      return Promise.resolve(existing);
    }

    const row = existing ?? {
      id: `progress-row-${this.snapshot.progress.length + 1}`,
      characterId: input.characterId,
      achievementId: input.achievementId,
      current: 0,
      target: input.target ?? null,
      updatedAt: new Date("2026-06-28T09:00:00.000Z"),
      createdAt: new Date("2026-06-28T09:00:00.000Z")
    };
    row.current = input.current;
    row.target = input.target ?? row.target;

    if (!existing) {
      this.snapshot.progress.push(row);
    }

    return Promise.resolve(row);
  }

  progressFor(achievementId: string): CharacterAchievementProgressRecord | undefined {
    return this.snapshot.progress.find((row) => row.achievementId === achievementId);
  }

  achievementFor(achievementId: string): CharacterAchievementRecord | undefined {
    return this.snapshot.achievements.find((row) => row.achievementId === achievementId);
  }
}
