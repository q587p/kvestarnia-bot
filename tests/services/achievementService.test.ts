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

  it("unlocks rewardless referral achievements from an authoritative arrival count", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    const first = await service.trackEvent({
      type: "referral.arrivals",
      characterId: "character-1",
      count: 1,
      occurredAt: new Date("2026-08-20T12:00:00.000Z"),
      sourceId: "referral-1"
    });
    const thirteenth = await service.trackEvent({
      type: "referral.arrivals",
      characterId: "character-1",
      count: 13,
      occurredAt: new Date("2026-08-20T13:00:00.000Z"),
      sourceId: "referral-13"
    });

    expect(first.map((unlock) => unlock.id)).toEqual(["achievement.referral.first-arrival"]);
    expect(thirteenth.map((unlock) => unlock.id)).toEqual(["achievement.referral.thirteen-arrivals"]);
    expect(repo.snapshot.titleGrants).toHaveLength(0);
  });

  it("unlocks the first other-recipient Varenyk feed achievement", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    const unlocks = await service.trackEvent({
      type: "varenyk.sated.other",
      characterId: "character-1",
      occurredAt: new Date("2026-07-16T09:00:00.000Z"),
      sourceId: "activation-1"
    });

    expect(unlocks.map((unlock) => unlock.id)).toEqual([
      "achievement.varenyk.sated.other-first"
    ]);
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

  it("keeps the first combat win achievement separate from the starter shawarma probe", async () => {
    const starterRepo = new FakeAchievementRepository();
    const starterService = new AchievementService(starterRepo);

    const starterUnlocks = await starterService.trackEvent({
      type: "combat.finished",
      characterId: "character-1",
      outcome: "won",
      monsterId: "monster.mimic-shawarma",
      occurredAt: new Date("2026-06-28T09:00:00.000Z"),
      sourceId: "starter-shawarma-session"
    });

    expect(starterUnlocks.map((unlock) => unlock.id)).not.toContain("achievement.combat.first-win");
    expect(starterRepo.snapshot.titleGrants).toHaveLength(0);

    const normalRepo = new FakeAchievementRepository();
    const normalService = new AchievementService(normalRepo);

    const normalUnlocks = await normalService.trackEvent({
      type: "combat.finished",
      characterId: "character-1",
      outcome: "won",
      monsterId: "monster.deadline-spider",
      occurredAt: new Date("2026-06-28T09:10:00.000Z"),
      sourceId: "normal-session"
    });

    expect(normalUnlocks.map((unlock) => unlock.id)).toContain("achievement.combat.first-win");
    expect(normalRepo.snapshot.titleGrants).toMatchObject([
      {
        titleGrantId: "cosmetic-title.first-puddle-victor",
        achievementId: "achievement.combat.first-win"
      }
    ]);
  });

  it("unlocks the latest events opener once", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);
    const event = {
      type: "latest-events.opened" as const,
      characterId: "character-1",
      occurredAt: new Date("2026-07-02T09:00:00.000Z"),
      sourceId: "character-1"
    };

    const first = await service.trackEvent(event);
    const second = await service.trackEvent(event);

    expect(first.map((unlock) => unlock.id)).toEqual(["achievement.journey.latest-events-opened"]);
    expect(second).toEqual([]);
    expect(repo.snapshot.achievements).toHaveLength(1);
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
    }, {
      id: "stored-disabled",
      characterId: "character-1",
      achievementId: "achievement.level.23",
      sourceType: "test",
      sourceId: null,
      sourceJson: null,
      unlockedAt: new Date("2026-06-28T09:01:00.000Z"),
      notifiedAt: null,
      createdAt: new Date("2026-06-28T09:01:00.000Z")
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
    expect(allEntries.find((entry) => entry.id === "achievement.remort.first-memory")).toBeUndefined();
    expect(allEntries.find((entry) => entry.id === "achievement.combat.critical-1")).toBeUndefined();
    expect(allEntries.find((entry) => entry.id === "achievement.level.23")).toMatchObject({
      earned: true,
      title: "Двадцять три причини не питати"
    });
    expect(firstPage.totalCount).toBe(allEntries.length);
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

  it("sorts earned achievement list entries by newest unlock first", async () => {
    const repo = new FakeAchievementRepository();
    repo.snapshot.achievements.push(
      makeStoredAchievement("achievement.character.created", "2026-06-28T09:00:00.000Z"),
      makeStoredAchievement("achievement.level.3", "2026-06-28T11:00:00.000Z"),
      makeStoredAchievement("achievement.item.first-received", "2026-06-28T10:00:00.000Z")
    );
    const service = new AchievementService(repo);

    const earned = await service.listForCharacter("character-1", 0, "earned");
    const firstAllPage = await service.listForCharacter("character-1", 0, "all");
    const remainingAllPages = await Promise.all(
      Array.from({ length: firstAllPage.totalPages - 1 }, (_, index) =>
        service.listForCharacter("character-1", index + 1, "all")
      )
    );
    const allEntries = [firstAllPage, ...remainingAllPages].flatMap((page) => page.entries);

    expect(earned.entries.map((entry) => entry.id)).toEqual([
      "achievement.level.3",
      "achievement.item.first-received",
      "achievement.character.created"
    ]);
    const allIds = allEntries.map((entry) => entry.id);
    expect(allIds.indexOf("achievement.character.created")).toBeLessThan(
      allIds.indexOf("achievement.level.3")
    );
    expect(allIds.indexOf("achievement.level.3")).toBeLessThan(
      allIds.indexOf("achievement.item.first-received")
    );
  });

  it("unlocks won combat thresholds from normal combat events", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      combat: {
        won: 3,
        lost: 0,
        fled: 0,
        expired: 0
      },
      combatFinishedAt: {
        won: [
          new Date("2026-06-28T09:00:00.000Z"),
          new Date("2026-06-28T09:10:00.000Z"),
          new Date("2026-06-28T09:20:00.000Z")
        ],
        lost: [],
        fled: [],
        expired: []
      }
    });
    const service = new AchievementService(repo);

    const thirdWin = await service.trackEvent({
      type: "combat.finished",
      characterId: "character-1",
      outcome: "won",
      occurredAt: new Date("2026-06-28T09:20:00.000Z"),
      sourceId: "session-3"
    });

    expect(thirdWin.map((unlock) => unlock.id)).toContain("achievement.combat.three-wins");
    expect(repo.progressFor("achievement.combat.three-wins")?.current).toBe(3);

    const repo13 = new FakeAchievementRepository();
    repo13.recalculationSnapshot = makeRecalculationSnapshot({
      combat: {
        won: 13,
        lost: 0,
        fled: 0,
        expired: 0
      },
      combatFinishedAt: {
        won: Array.from({ length: 13 }, (_, index) => new Date(2026, 5, 28, 9, index)),
        lost: [],
        fled: [],
        expired: []
      }
    });
    const service13 = new AchievementService(repo13);

    const thirteenthWin = await service13.trackEvent({
      type: "combat.finished",
      characterId: "character-1",
      outcome: "won",
      occurredAt: new Date("2026-06-28T09:13:00.000Z"),
      sourceId: "session-13"
    });

    expect(thirteenthWin.map((unlock) => unlock.id)).toContain("achievement.combat.thirteen-wins");
    expect(repo13.progressFor("achievement.combat.thirteen-wins")?.current).toBe(13);
  });

  it("recalculates the first combat win only from non-starter-shawarma wins", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      combat: {
        won: 1,
        lost: 0,
        fled: 0,
        expired: 0
      },
      combatFinishedAt: {
        won: [new Date("2026-06-28T09:00:00.000Z")],
        lost: [],
        fled: [],
        expired: []
      },
      activityDates: {
        "combat.finished.won.exclude:monster.mimic-shawarma": []
      }
    });
    const service = new AchievementService(repo);

    const result = await service.recalculateForCharacter(
      "character-1",
      new Date("2026-06-28T09:05:00.000Z")
    );

    expect(result.unlocks.map((unlock) => unlock.id)).not.toContain("achievement.combat.first-win");
    expect(repo.snapshot.titleGrants.map((grant) => grant.titleGrantId)).not.toContain(
      "cosmetic-title.first-puddle-victor"
    );
  });

  it("unlocks problem-chain 93 from the fourth problem reward event", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      completedProblemQuestStages: 4,
      problemQuestCompletedAt: [
        new Date("2026-06-28T09:00:00.000Z"),
        new Date("2026-06-28T09:10:00.000Z"),
        new Date("2026-06-28T09:20:00.000Z"),
        new Date("2026-06-28T09:30:00.000Z")
      ]
    });
    const service = new AchievementService(repo);

    const unlocks = await service.trackEvent({
      type: "problem.quest.completed",
      characterId: "character-1",
      stageId: "93",
      occurredAt: new Date("2026-06-28T09:30:00.000Z"),
      sourceId: "quest.problem-chain.93.reward"
    });

    expect(unlocks.map((unlock) => unlock.id)).toContain("achievement.quest.problem-chain.93");
    expect(repo.progressFor("achievement.quest.problem-chain.93")?.current).toBe(4);
  });

  it("unlocks inventory and equipment thresholds from normal item/equipment events", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      inventoryItemQuantity: 3,
      inventoryItemQuantities: {
        "item.test": 3
      },
      inventoryItemRows: {
        "item.test": {
          quantity: 3,
          createdAt: new Date("2026-06-28T09:00:00.000Z"),
          updatedAt: new Date("2026-06-28T09:02:00.000Z")
        }
      },
      firstInventoryItemReceivedAt: new Date("2026-06-28T09:00:00.000Z"),
      inventoryObservedAt: new Date("2026-06-28T09:02:00.000Z"),
      equippedItemCount: 3,
      firstEquippedItemAt: new Date("2026-06-28T09:03:00.000Z"),
      equipmentObservedAt: new Date("2026-06-28T09:05:00.000Z")
    });
    const service = new AchievementService(repo);

    const itemUnlocks = await service.trackEvent({
      type: "item.received",
      characterId: "character-1",
      itemIds: ["item.test"],
      occurredAt: new Date("2026-06-28T09:02:00.000Z"),
      sourceId: "reward-3"
    });
    const equipmentUnlocks = await service.trackEvent({
      type: "equipment.item_equipped",
      characterId: "character-1",
      itemId: "item.test",
      occurredAt: new Date("2026-06-28T09:05:00.000Z"),
      sourceId: "equip-3"
    });

    expect(itemUnlocks.map((unlock) => unlock.id)).toContain("achievement.item.three-owned");
    expect(equipmentUnlocks.map((unlock) => unlock.id)).toContain("achievement.equipment.three-equipped");
    expect(repo.progressFor("achievement.item.three-owned")?.current).toBe(3);
    expect(repo.progressFor("achievement.equipment.three-equipped")?.current).toBe(3);
  });

  it("unlocks full-slot equipment and cumulative hidden fitting milestones", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      equippedItemCount: 7,
      firstEquippedItemAt: new Date("2026-07-03T10:00:00.000Z"),
      equipmentObservedAt: new Date("2026-07-03T10:07:00.000Z")
    });
    const service = new AchievementService(repo);

    const fullSlots = await service.trackEvent({
      type: "equipment.item_equipped",
      characterId: "character-1",
      itemId: "item.full-slot-test",
      occurredAt: new Date("2026-07-03T10:07:00.000Z"),
      sourceId: "equip-full"
    });

    expect(fullSlots.map((unlock) => unlock.id)).toEqual(expect.arrayContaining([
      "achievement.equipment.first-equipped",
      "achievement.equipment.three-equipped",
      "achievement.equipment.all-slots-equipped"
    ]));
    expect(repo.progressFor("achievement.equipment.all-slots-equipped")?.current).toBe(7);

    const cumulativeRepo = new FakeAchievementRepository();
    const cumulativeService = new AchievementService(cumulativeRepo);
    let lastUnlockIds: string[] = [];

    for (let index = 0; index < 93; index += 1) {
      const unlocks = await cumulativeService.trackEvent({
        type: "equipment.item_equipped",
        characterId: "character-1",
        itemId: `item.fitting-${index}`,
        occurredAt: new Date(2026, 6, 3, 10, index),
        sourceId: `equip-${index}`
      });
      lastUnlockIds = unlocks.map((unlock) => unlock.id);
    }

    expect(lastUnlockIds).toContain("achievement.equipment.ninety-three-equipped-total");
    expect(cumulativeRepo.progressFor("achievement.equipment.ninety-three-equipped-total")?.current).toBe(93);
  });

  it("unlocks gold balance milestones from direct gold balance events", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    const leet = await service.trackEvent({
      type: "gold.balance",
      characterId: "character-1",
      gold: 1337,
      occurredAt: new Date("2026-06-28T10:00:00.000Z"),
      sourceId: "test:1337"
    });
    const overNineThousand = await service.trackEvent({
      type: "gold.balance",
      characterId: "character-1",
      gold: 9001,
      occurredAt: new Date("2026-06-28T10:01:00.000Z"),
      sourceId: "test:9001"
    });

    expect(leet.map((unlock) => unlock.id)).toEqual(["achievement.gold.leet-balance"]);
    expect(overNineThousand.map((unlock) => unlock.id)).toEqual([
      "achievement.gold.over-nine-thousand"
    ]);
  });

  it("recalculates gold balance milestones from the current character balance", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({ gold: 9001 });
    const service = new AchievementService(repo);

    const result = await service.recalculateForCharacter(
      "character-1",
      new Date("2026-06-28T10:00:00.000Z")
    );

    expect(result.unlocks.map((unlock) => unlock.id)).toEqual([
      "achievement.character.created",
      "achievement.race.human-ish",
      "achievement.class.warrior",
      "achievement.gold.leet-balance",
      "achievement.gold.over-nine-thousand"
    ]);
  });

  it("unlocks bandage craft and use achievements from direct item events", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    const craftUnlocks = await service.trackEvent({
      type: "item.crafted",
      characterId: "character-1",
      itemId: "item.dense-bandage",
      occurredAt: new Date("2026-06-28T09:10:00.000Z"),
      sourceId: "recipe.dense-bandage:item.dense-bandage"
    });
    const useUnlocks = await service.trackEvent({
      type: "item.used",
      characterId: "character-1",
      itemId: "item.field-kit",
      occurredAt: new Date("2026-06-28T09:11:00.000Z"),
      sourceId: "session-1:turn:1:item:item.field-kit"
    });

    expect(craftUnlocks.map((unlock) => unlock.id)).toEqual([
      "achievement.bandage.dense-crafted"
    ]);
    expect(useUnlocks.map((unlock) => unlock.id)).toEqual([
      "achievement.consumable.first-used",
      "achievement.bandage.field-kit-used"
    ]);
  });

  it("unlocks first Iskrokamin received from item reward events", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    const unlocks = await service.trackEvent({
      type: "item.received",
      characterId: "character-1",
      itemIds: ["item.iskrokamin"],
      occurredAt: new Date("2026-07-08T09:10:00.000Z"),
      sourceId: "fight-reward-iskrokamin"
    });

    expect(unlocks.map((unlock) => unlock.id)).toContain("achievement.iskrokamin.first-owned");
    expect(repo.achievementFor("achievement.iskrokamin.first-owned")).toBeDefined();
  });

  it("unlocks the first Mantok gear-action achievement from a committed gear event", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);
    const event = {
      type: "mantok.gear-action.used" as const,
      characterId: "character-1",
      occurredAt: new Date("2026-07-07T09:11:00.000Z"),
      sourceId: "session-1:turn:1:gear:mantok-ability.red-line-dagger"
    };

    const first = await service.trackEvent(event);
    const second = await service.trackEvent(event);

    expect(first.map((unlock) => unlock.id)).toEqual([
      "achievement.mantok.gear-action.first"
    ]);
    expect(second).toEqual([]);
  });

  it("unlocks Bureaucramancer protocol achievements from committed raid-prep and trigger events", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    const filed = await service.trackEvent({
      type: "bureaucramancer.protocol.filed",
      characterId: "character-1",
      occurredAt: new Date("2026-07-10T09:11:00.000Z"),
      sourceId: "protocol-1"
    });
    const signed = await service.trackEvent({
      type: "bureaucramancer.protocol.signed",
      characterId: "character-2",
      occurredAt: new Date("2026-07-10T09:12:00.000Z"),
      sourceId: "protocol-1"
    });
    const triggered = await service.trackEvent({
      type: "bureaucramancer.protocol.triggered",
      characterId: "character-2",
      occurredAt: new Date("2026-07-10T09:13:00.000Z"),
      sourceId: "big-barrel:1:personal:character-2"
    });

    expect(filed.map((unlock) => unlock.id)).toEqual(["achievement.bureaucramancer.protocol.filed"]);
    expect(signed.map((unlock) => unlock.id)).toEqual(["achievement.bureaucramancer.protocol.signed"]);
    expect(triggered.map((unlock) => unlock.id)).toEqual(["achievement.bureaucramancer.protocol.triggered"]);
  });

  it("unlocks Warrior Raid Taunt only once from its committed activation event", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);
    const event = {
      type: "warrior.raid-taunt.activated" as const,
      characterId: "character-warrior",
      occurredAt: new Date("2026-07-11T09:13:00.000Z"),
      sourceId: "boss-session:turn:1:warrior-taunt"
    };

    expect((await service.trackEvent(event)).map((unlock) => unlock.id)).toEqual([
      "achievement.warrior.raid-taunt.activated"
    ]);
    expect(await service.trackEvent(event)).toEqual([]);
  });

  it("recovers Warrior Raid Taunt from the durable recalculation snapshot", async () => {
    const repo = new FakeAchievementRepository();
    const activatedAt = new Date("2026-07-11T09:13:00.000Z");
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      activityDates: { "warrior.raid-taunt.activated": [activatedAt] }
    });
    const service = new AchievementService(repo);

    const result = await service.recalculateForCharacter(
      "character-warrior",
      new Date("2026-07-12T09:13:00.000Z")
    );

    expect(result.unlocks.map((unlock) => unlock.id)).toContain("achievement.warrior.raid-taunt.activated");
    expect(repo.achievementFor("achievement.warrior.raid-taunt.activated")?.unlockedAt).toEqual(activatedAt);
  });

  it("unlocks simple ledger-backed triggers immediately and snapshots their thresholds", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      activityDates: {
        "adventure.choice.completed": Array.from(
          { length: 13 },
          (_, index) => new Date(2026, 5, 28, 9, index)
        )
      }
    });
    const service = new AchievementService(repo);

    const unlocks = await service.trackEvent({
      type: "adventure.choice.completed",
      characterId: "character-1",
      occurredAt: new Date("2026-06-28T09:12:00.000Z"),
      sourceId: "adventure-13"
    });

    expect(new Set(unlocks.map((unlock) => unlock.id))).toEqual(new Set([
      "achievement.adventure.choice.first",
      "achievement.adventure.choice.thirteen"
    ]));
    expect(repo.progressFor("achievement.adventure.choice.thirteen")?.current).toBe(13);
  });

  it("unlocks daily Korchma round milestone thresholds from durable reward rows", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      activityDates: {
        "daily.korchma-round.completed": Array.from(
          { length: 13 },
          (_, index) => new Date(2026, 5, 28, 9, index)
        )
      }
    });
    const service = new AchievementService(repo);

    const unlocks = await service.trackEvent({
      type: "daily.korchma-round.completed",
      characterId: "character-1",
      occurredAt: new Date("2026-06-28T09:12:00.000Z"),
      sourceId: "daily-korchma-round-13"
    });

    expect(new Set(unlocks.map((unlock) => unlock.id))).toEqual(new Set([
      "achievement.quest.daily-korchma-round",
      "achievement.quest.daily-korchma-round.seven",
      "achievement.quest.daily-korchma-round.thirteen"
    ]));
    expect(repo.progressFor("achievement.quest.daily-korchma-round.seven")?.current).toBe(7);
    expect(repo.progressFor("achievement.quest.daily-korchma-round.thirteen")?.current).toBe(13);
  });

  it("unlocks the Barrel beer tutorial achievement from its completion event", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      activityDates: {
        "quest.barrel-beer-tutorial.completed": [new Date("2026-07-06T09:12:00.000Z")]
      }
    });
    const service = new AchievementService(repo);

    const unlocks = await service.trackEvent({
      type: "quest.barrel-beer-tutorial.completed",
      characterId: "character-1",
      occurredAt: new Date("2026-07-06T09:12:00.000Z"),
      sourceId: "quest.barrel-or-there-and-back"
    });

    expect(unlocks.map((unlock) => unlock.id)).toEqual([
      "achievement.quest.barrel-beer-tutorial"
    ]);
    expect(repo.achievementFor("achievement.quest.barrel-beer-tutorial")?.unlockedAt).toEqual(
      new Date("2026-07-06T09:12:00.000Z")
    );
  });

  it("unlocks the first Korchma route achievement from its completion event", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    const unlocks = await service.trackEvent({
      type: "quest.first-korchma.completed",
      characterId: "character-1",
      occurredAt: new Date("2026-07-09T18:00:00.000Z"),
      sourceId: "quest-first-korchma"
    });

    expect(unlocks.map((unlock) => unlock.id)).toEqual([
      "achievement.quest.first-korchma"
    ]);
  });

  it("unlocks tavern table game milestones from durable completed table rows", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      activityDates: {
        "tavern.game.played": [new Date("2026-07-02T09:00:00.000Z")],
        "tavern.game.won": [
          new Date("2026-07-02T09:00:00.000Z"),
          new Date("2026-07-02T09:10:00.000Z"),
          new Date("2026-07-02T09:20:00.000Z")
        ],
        "tavern.game.lost": Array.from({ length: 13 }, (_, index) => new Date(2026, 6, 2, 10, index)),
        "tavern.game.drawn": [new Date("2026-07-02T11:00:00.000Z")]
      }
    });
    const service = new AchievementService(repo);

    const played = await service.trackEvent({
      type: "tavern.game.played",
      characterId: "character-1",
      occurredAt: new Date("2026-07-02T09:00:00.000Z"),
      sourceId: "table-1"
    });
    const won = await service.trackEvent({
      type: "tavern.game.won",
      characterId: "character-1",
      occurredAt: new Date("2026-07-02T09:20:00.000Z"),
      sourceId: "table-3"
    });
    const lost = await service.trackEvent({
      type: "tavern.game.lost",
      characterId: "character-1",
      occurredAt: new Date("2026-07-02T10:12:00.000Z"),
      sourceId: "table-loss-13"
    });
    const drawn = await service.trackEvent({
      type: "tavern.game.drawn",
      characterId: "character-1",
      occurredAt: new Date("2026-07-02T11:00:00.000Z"),
      sourceId: "table-draw-1"
    });

    expect(played.map((unlock) => unlock.id)).toEqual(["achievement.tavern.game.first"]);
    expect(won.map((unlock) => unlock.id)).toEqual([
      "achievement.tavern.game.win.first",
      "achievement.tavern.game.win.three"
    ]);
    expect(lost.map((unlock) => unlock.id)).toEqual([
      "achievement.tavern.game.loss.first",
      "achievement.tavern.game.loss.three",
      "achievement.tavern.game.loss.thirteen"
    ]);
    expect(drawn.map((unlock) => unlock.id)).toEqual(["achievement.tavern.game.draw.first"]);
    expect(repo.progressFor("achievement.tavern.game.win.three")?.current).toBe(3);
    expect(repo.progressFor("achievement.tavern.game.loss.thirteen")?.current).toBe(13);
  });

  it("recalculates provable historical achievements from the current character snapshot", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = {
      characterId: "character-1",
      level: 13,
      gold: 9001,
      raceId: "race.domovyk",
      classId: "class.ranger",
      createdAt: new Date("2026-06-28T08:00:00.000Z"),
      historicalIdentities: [],
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
      completedProblemQuestStages: 4,
      problemQuestCompletedAt: [
        new Date("2026-06-28T09:50:00.000Z"),
        new Date("2026-06-28T09:55:00.000Z"),
        new Date("2026-06-28T09:56:00.000Z"),
        new Date("2026-06-28T09:57:00.000Z")
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
      activeCosmeticTitleGrantId: null,
      activityDates: {
        "remort.completed": [new Date("2026-06-28T08:55:00.000Z")],
        "starter.mimic-shawarma.completed": [new Date("2026-06-28T08:56:00.000Z")],
        "starter.mimic-shawarma.probe.completed": [new Date("2026-06-28T08:57:00.000Z")],
        "cellar.mouse.completed": [new Date("2026-06-28T08:58:00.000Z")],
        "quest.first-korchma.completed": [new Date("2026-06-28T08:58:15.000Z")],
        "quest.barrel-beer-tutorial.completed": [new Date("2026-06-28T08:58:30.000Z")],
        "yeger.trial.completed": [new Date("2026-06-28T08:59:00.000Z")],
        "combat.finished.won.exclude:monster.mimic-shawarma": [new Date("2026-06-28T09:00:00.000Z")],
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
        "item.used:item.dense-bandage": [new Date("2026-06-28T10:14:00.000Z")],
        "item.used:item.field-kit": [new Date("2026-06-28T10:15:00.000Z")],
        "mantok.chest.completed": [new Date("2026-06-28T10:20:00.000Z")],
        "level.barter.completed": [new Date("2026-06-28T10:21:00.000Z")],
        "training.doppelganger.finished": [new Date("2026-06-28T10:22:00.000Z")],
        "training.doppelganger.won": [
          new Date("2026-06-28T10:22:00.000Z"),
          ...Array.from({ length: 12 }, (_, index) => new Date(2026, 5, 28, 11, index))
        ],
        "duel.resolved": [new Date("2026-06-28T10:23:00.000Z")],
        "duel.won": [new Date("2026-06-28T10:23:00.000Z")],
        "duel.turnbased.defend": [new Date("2026-06-28T10:23:30.000Z")],
        "duel.quick.resolved": [new Date("2026-06-28T10:23:00.000Z")],
        "duel.turnbased.resolved": [new Date("2026-06-28T10:24:00.000Z")],
        "barrel.raid.claimed": [new Date("2026-06-28T10:25:00.000Z")],
        "barrel.raid.lost": [new Date("2026-06-28T10:25:30.000Z")],
        "barrel.raid.bandage-used": [new Date("2026-06-28T10:25:45.000Z")],
        "bureaucramancer.protocol.filed": [new Date("2026-06-28T10:25:46.000Z")],
        "bureaucramancer.protocol.signed": [new Date("2026-06-28T10:25:47.000Z")],
        "bureaucramancer.protocol.triggered": [new Date("2026-06-28T10:25:48.000Z")],
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
          ...Array.from({ length: 12 }, (_, index) => new Date(2026, 5, 28, 12, index))
        ],
        "adventure.choice.strong-success": [new Date("2026-06-28T10:42:00.000Z")],
        "adventure.choice.complication": [new Date("2026-06-28T10:44:00.000Z")],
        "combat.persistent.won": Array.from({ length: 23 }, (_, index) => new Date(2026, 5, 28, 13, index)),
        "combat.persistent.hard-win": [new Date("2026-06-28T10:48:00.000Z")],
        "combat.persistent.adventure-origin-win": [new Date("2026-06-28T10:49:00.000Z")],
        "combat.persistent.yeger-origin-win": [new Date("2026-06-28T10:50:00.000Z")],
        "combat.persistent.low-hp-win": [new Date("2026-06-28T10:51:00.000Z")],
        "combat.persistent.zero-gold-item-win": [new Date("2026-06-28T10:52:00.000Z")],
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
      "achievement.level.8",
      "achievement.level.10",
      "achievement.level.13",
      "achievement.remort.first",
      "achievement.combat.first-win",
      "achievement.combat.three-wins",
      "achievement.combat.persistent-win-23",
      "achievement.combat.first-loss",
      "achievement.combat.first-flee",
      "achievement.quest.first-problem",
      "achievement.quest.problem-chain.23",
      "achievement.quest.problem-chain.42",
      "achievement.quest.first-korchma",
      "achievement.quest.mimic-shawarma",
      "achievement.quest.cellar-mouse",
      "achievement.quest.barrel-beer-tutorial",
      "achievement.quest.problem-chain.93",
      "achievement.quest.yeger-first",
      "achievement.quest.strong-success",
      "achievement.combat.starter-probe",
      "achievement.item.first-received",
      "achievement.item.three-owned",
      "achievement.item.thirteen-owned",
      "achievement.bandage.first-owned",
      "achievement.bandage.ninety-three-owned",
      "achievement.consumable.first-used",
      "achievement.bandage.first-used",
      "achievement.bandage.four-used",
      "achievement.bandage.dense-used",
      "achievement.bandage.field-kit-used",
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
      "achievement.social.training-win-1",
      "achievement.social.training-win-13",
      "achievement.duel.quick.first",
      "achievement.social.duel-resolved",
      "achievement.social.duel-win",
      "achievement.duel.turnbased.first",
      "achievement.social.duel-defend",
      "achievement.barrel.raid.first",
      "achievement.barrel.raid.first-loss",
      "achievement.barrel.raid.bandage-used",
      "achievement.bureaucramancer.protocol.filed",
      "achievement.bureaucramancer.protocol.signed",
      "achievement.bureaucramancer.protocol.triggered",
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
      "achievement.adventure.choice.thirteen",
      "achievement.adventure.choice.complication.first",
      "achievement.combat.threat-escalation.first",
      "achievement.combat.threat-escalation.three",
      "achievement.combat.threat-pressure.first",
      "achievement.combat.hard-passage-win",
      "achievement.combat.adventure-origin-win",
      "achievement.combat.yeger-origin-win",
      "achievement.combat.low-hp-win",
      "achievement.gear.zero-gold-item",
      "achievement.gold.leet-balance",
      "achievement.gold.over-nine-thousand"
    ]);
    expect(duplicate.unlocks).toEqual([]);
    expect(repo.achievementFor("achievement.character.created")?.unlockedAt).toEqual(
      new Date("2026-06-28T08:00:00.000Z")
    );
    expect(repo.achievementFor("achievement.level.3")?.unlockedAt).toEqual(
      new Date("2026-06-28T08:20:00.000Z")
    );
    expect(repo.progressFor("achievement.level.23")).toBeUndefined();
    expect(repo.progressFor("achievement.combat.thirteen-wins")?.current).toBe(3);
    expect(repo.progressFor("achievement.item.thirteen-owned")?.current).toBe(13);
    expect(repo.progressFor("achievement.bandage.ninety-three-owned")?.current).toBe(93);
    expect(repo.progressFor("achievement.bandage.four-used")?.current).toBe(4);
    expect(repo.progressFor("achievement.shynok.drink.four")?.current).toBe(4);
    expect(repo.progressFor("achievement.passage.search.all-current")?.current).toBe(5);
    expect(repo.progressFor("achievement.hunt.contract.thirteen")?.current).toBe(1);
    expect(repo.progressFor("achievement.adventure.choice.thirteen")?.current).toBe(13);
    expect(repo.progressFor("achievement.combat.threat-pressure.three")?.current).toBe(2);
  });

  it("recalculates race and class achievements from stored remort identity history", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      raceId: "race.human-ish",
      classId: "class.warrior",
      createdAt: new Date("2026-06-28T08:00:00.000Z"),
      historicalIdentities: [
        {
          raceId: "race.elf",
          classId: "class.mage",
          occurredAt: new Date("2026-06-28T09:00:00.000Z")
        },
        {
          raceId: "race.dwarf",
          classId: "class.ranger",
          occurredAt: new Date("2026-06-28T10:00:00.000Z")
        },
        {
          raceId: "race.bisyny",
          classId: "class.bard",
          occurredAt: new Date("2026-06-28T11:00:00.000Z")
        }
      ]
    });
    const service = new AchievementService(repo);

    const result = await service.recalculateForCharacter(
      "character-1",
      new Date("2026-06-28T12:00:00.000Z")
    );
    const ids = new Set(result.unlocks.map((unlock) => unlock.id));

    expect(ids).toContain("achievement.race.human-ish");
    expect(ids).toContain("achievement.race.elf");
    expect(ids).toContain("achievement.race.dwarf");
    expect(ids).toContain("achievement.race.bisyny");
    expect(ids).toContain("achievement.class.mage");
    expect(ids).toContain("achievement.class.ranger");
    expect(ids).toContain("achievement.class.bard");
    expect(repo.achievementFor("achievement.race.elf")?.unlockedAt).toEqual(
      new Date("2026-06-28T09:00:00.000Z")
    );
    expect(repo.achievementFor("achievement.race.dwarf")?.unlockedAt).toEqual(
      new Date("2026-06-28T10:00:00.000Z")
    );
    expect(repo.achievementFor("achievement.race.bisyny")?.unlockedAt).toEqual(
      new Date("2026-06-28T11:00:00.000Z")
    );
    expect(repo.snapshot.titleGrants.map((grant) => grant.titleGrantId)).toEqual(
      expect.arrayContaining([
        "cosmetic-title.human-ish-paperproof",
        "cosmetic-title.elf-offended-accuracy",
        "cosmetic-title.dwarf-low-shelf",
        "cosmetic-title.bisyny-locked-dictionary"
      ])
    );
  });

  it("lists cosmetic title grants with active markers and archived unknown rows", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);
    const grantedAt = new Date("2026-06-28T09:00:00.000Z");

    await service.trackEvent({
      type: "character.created",
      characterId: "character-1",
      raceId: "race.human-ish",
      classId: "class.warrior",
      occurredAt: grantedAt,
      sourceId: "character-1"
    });
    repo.snapshot.titleGrants.push({
      id: "title-row-archived",
      characterId: "character-1",
      titleGrantId: "cosmetic-title.retired",
      achievementId: "achievement.retired",
      sourceType: "test",
      sourceId: null,
      grantedAt,
      createdAt: grantedAt
    });
    repo.activeTitleGrantId = "cosmetic-title.first-ink";

    const view = await service.listCosmeticTitlesForCharacter("character-1");

    expect(view).toMatchObject({
      activeTitleGrantId: "cosmetic-title.first-ink",
      activeTitleMissing: false,
      entries: [
        {
          titleGrantId: "cosmetic-title.first-ink",
          active: true,
          archived: false
        },
        {
          titleGrantId: "cosmetic-title.human-ish-paperproof",
          active: false,
          archived: false
        },
        {
          titleGrantId: "cosmetic-title.warrior-straight-plan",
          active: false,
          archived: false
        },
        {
          titleGrantId: "cosmetic-title.retired",
          title: "Архівний титул",
          sourceAchievementTitle: "архівний запис",
          active: false,
          archived: true
        }
      ]
    });
  });

  it("paginates cosmetic title grants", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);
    const grantedAt = new Date("2026-06-28T09:00:00.000Z");
    repo.snapshot.titleGrants = Array.from({ length: 12 }, (_unused, index) => ({
      id: `title-row-${index + 1}`,
      characterId: "character-1",
      titleGrantId: `cosmetic-title.test-${index + 1}`,
      achievementId: `achievement.test-${index + 1}`,
      sourceType: "test",
      sourceId: null,
      grantedAt,
      createdAt: grantedAt
    }));

    const view = await service.listCosmeticTitlesForCharacter("character-1", 1);

    expect(view).toMatchObject({
      page: 1,
      totalPages: 2,
      totalCount: 12,
      entries: [
        { grantRowId: "title-row-11" },
        { grantRowId: "title-row-12" }
      ]
    });
  });

  it("sets an owned active cosmetic title once and unlocks first-selection once", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);

    await service.trackEvent({
      type: "character.created",
      characterId: "character-1",
      raceId: "race.human-ish",
      classId: "class.warrior",
      occurredAt: new Date("2026-06-28T09:00:00.000Z"),
      sourceId: "character-1"
    });

    const titleGrant = repo.snapshot.titleGrants[0]!;
    const first = await service.selectActiveCosmeticTitle({
      characterId: "character-1",
      titleGrantRowId: titleGrant.id,
      expectedRemortCount: 0,
      occurredAt: new Date("2026-06-28T09:05:00.000Z")
    });
    const duplicate = await service.selectActiveCosmeticTitle({
      characterId: "character-1",
      titleGrantRowId: titleGrant.id,
      expectedRemortCount: 0,
      occurredAt: new Date("2026-06-28T09:06:00.000Z")
    });

    expect(first?.state).toBe("selected");
    expect(first?.unlocks.map((unlock) => unlock.id)).toEqual([
      "achievement.journey.cosmetic-title-selected"
    ]);
    expect(first?.view.entries.find((entry) => entry.grantRowId === titleGrant.id)?.active).toBe(true);
    expect(duplicate?.state).toBe("already-active");
    expect(duplicate?.unlocks).toEqual([]);
    expect(repo.snapshot.achievements.filter((row) =>
      row.achievementId === "achievement.journey.cosmetic-title-selected"
    )).toHaveLength(1);
  });

  it("recalculates first cosmetic title selection when the active pointer proves it", async () => {
    const repo = new FakeAchievementRepository();
    repo.recalculationSnapshot = makeRecalculationSnapshot({
      activeCosmeticTitleGrantId: "cosmetic-title.first-ink"
    });
    const service = new AchievementService(repo);

    const result = await service.recalculateForCharacter(
      "character-1",
      new Date("2026-06-28T09:10:00.000Z")
    );

    expect(result.unlocks.map((unlock) => unlock.id)).toContain(
      "achievement.journey.cosmetic-title-selected"
    );
  });

  it("clears active cosmetic titles idempotently", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);
    repo.activeTitleGrantId = "cosmetic-title.first-ink";

    const cleared = await service.clearActiveCosmeticTitle({
      characterId: "character-1",
      expectedRemortCount: 0
    });
    const duplicate = await service.clearActiveCosmeticTitle({
      characterId: "character-1",
      expectedRemortCount: 0
    });

    expect(cleared?.state).toBe("cleared");
    expect(cleared?.view.activeTitleGrantId).toBeNull();
    expect(duplicate?.state).toBe("already-clear");
  });

  it("rejects not-owned and stale-life cosmetic title mutations safely", async () => {
    const repo = new FakeAchievementRepository();
    const service = new AchievementService(repo);
    repo.remortCount = 1;

    const stale = await service.selectActiveCosmeticTitle({
      characterId: "character-1",
      titleGrantRowId: "title-row-missing",
      expectedRemortCount: 0
    });
    const notOwned = await service.selectActiveCosmeticTitle({
      characterId: "character-1",
      titleGrantRowId: "title-row-missing",
      expectedRemortCount: 1
    });

    expect(stale?.state).toBe("stale-life");
    expect(notOwned?.state).toBe("not-owned");
    expect(repo.activeTitleGrantId).toBeNull();
  });
});

function makeRecalculationSnapshot(
  overrides: Partial<AchievementRecalculationSnapshot> = {}
): AchievementRecalculationSnapshot {
  return {
    characterId: "character-1",
    level: 1,
    gold: 0,
    raceId: "race.human-ish",
    classId: "class.warrior",
    createdAt: new Date("2026-06-28T08:00:00.000Z"),
    historicalIdentities: [],
    levelReachedAt: {},
    combat: {
      won: 0,
      lost: 0,
      fled: 0,
      expired: 0
    },
    combatFinishedAt: {
      won: [],
      lost: [],
      fled: [],
      expired: []
    },
    completedProblemQuestStages: 0,
    problemQuestCompletedAt: [],
    inventoryItemQuantity: 0,
    inventoryItemQuantities: {},
    inventoryItemRows: {},
    firstInventoryItemReceivedAt: null,
    inventoryObservedAt: null,
    equippedItemCount: 0,
    firstEquippedItemAt: null,
    equipmentObservedAt: null,
    activeCosmeticTitleGrantId: null,
    activityDates: {},
    ...overrides
  };
}

function makeStoredAchievement(achievementId: string, unlockedAtIso: string): CharacterAchievementRecord {
  const unlockedAt = new Date(unlockedAtIso);

  return {
    id: `stored-${achievementId}`,
    characterId: "character-1",
    achievementId,
    sourceType: "test",
    sourceId: null,
    sourceJson: null,
    unlockedAt,
    notifiedAt: null,
    createdAt: unlockedAt
  };
}

class FakeAchievementRepository implements AchievementRepository {
  snapshot: CharacterAchievementSnapshot = {
    achievements: [],
    progress: [],
    titleGrants: []
  };
  activeTitleGrantId: string | null = null;
  remortCount = 0;
  recalculationSnapshot: AchievementRecalculationSnapshot | null = null;

  listForCharacter(): Promise<CharacterAchievementSnapshot> {
    return Promise.resolve(this.snapshot);
  }

  listCosmeticTitlesForCharacter(characterId: string) {
    return Promise.resolve({
      characterId,
      activeTitleGrantId: this.activeTitleGrantId,
      remortCount: this.remortCount,
      titleGrants: this.snapshot.titleGrants.filter((row) => row.characterId === characterId)
    });
  }

  setActiveCosmeticTitle(input: {
    characterId: string;
    titleGrantRowId: string;
    expectedRemortCount?: number;
  }): Promise<"selected" | "already-active" | "not-owned" | "stale-life" | "no-character"> {
    if (input.expectedRemortCount !== undefined && input.expectedRemortCount !== this.remortCount) {
      return Promise.resolve("stale-life");
    }

    const grant = this.snapshot.titleGrants.find(
      (row) => row.characterId === input.characterId && row.id === input.titleGrantRowId
    );

    if (!grant) {
      return Promise.resolve("not-owned");
    }

    if (this.activeTitleGrantId === grant.titleGrantId) {
      return Promise.resolve("already-active");
    }

    this.activeTitleGrantId = grant.titleGrantId;
    return Promise.resolve("selected");
  }

  clearActiveCosmeticTitle(input: {
    expectedRemortCount?: number;
  }): Promise<"cleared" | "already-clear" | "stale-life" | "no-character"> {
    if (input.expectedRemortCount !== undefined && input.expectedRemortCount !== this.remortCount) {
      return Promise.resolve("stale-life");
    }

    if (!this.activeTitleGrantId) {
      return Promise.resolve("already-clear");
    }

    this.activeTitleGrantId = null;
    return Promise.resolve("cleared");
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

  incrementProgress(input: {
    characterId: string;
    achievementId: string;
    amount?: number;
    target?: number;
  }): Promise<CharacterAchievementProgressRecord> {
    const existing = this.progressFor(input.achievementId);
    const row = existing ?? {
      id: `progress-row-${this.snapshot.progress.length + 1}`,
      characterId: input.characterId,
      achievementId: input.achievementId,
      current: 0,
      target: input.target ?? null,
      updatedAt: new Date("2026-06-28T09:00:00.000Z"),
      createdAt: new Date("2026-06-28T09:00:00.000Z")
    };

    row.current += Math.max(0, Math.floor(input.amount ?? 1));
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
