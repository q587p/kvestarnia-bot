import { describe, expect, it } from "vitest";
import type { RecordActivityEventInput } from "../../src/db/repositories/activityEventRepository";
import { BIG_BARREL_BROTHER_BOSS_KEY, BIG_BARREL_BROTHER_RULES_VERSION } from "../../src/domain/partyBoss/partyBoss";
import {
  backfillActivityEvents,
  type ActivityEventBackfillStore,
  type BackfillCharacterCreatedRow,
  type BackfillLevelAchievementRow,
  type BackfillPartyBossSessionRow,
  type BackfillRareCharacterItemRow
} from "../../src/services/activityEventBackfillService";

describe("backfillActivityEvents", () => {
  it("plans archival activity rows without writing in dry-run mode", async () => {
    const store = new FakeBackfillStore();
    const recorder = new FakeBackfillRecorder();

    const summary = await backfillActivityEvents({
      store,
      recorder,
      apply: false,
      since: new Date("2026-07-01T00:00:00.000Z")
    });

    expect(summary.dryRun).toBe(true);
    expect(recorder.events).toHaveLength(0);
    expect(summary.counts["character.created"]).toMatchObject({ scanned: 1, planned: 1, applied: 0 });
    expect(summary.counts["character.level_reached"]).toMatchObject({ scanned: 1, planned: 1, applied: 0 });
    expect(summary.counts["item.rare_received"]).toMatchObject({ scanned: 1, planned: 1, applied: 0 });
    expect(summary.counts["party.raid_won"]).toMatchObject({ scanned: 1, planned: 1, applied: 0 });
  });

  it("applies new rows and skips existing dedupe and rare item rows", async () => {
    const store = new FakeBackfillStore();
    store.existingDedupeKeys.add("character.created:character-1");
    store.existingRareItems.add("character-1:item.towel-of-forty-two-answers");
    const recorder = new FakeBackfillRecorder();

    const summary = await backfillActivityEvents({
      store,
      recorder,
      apply: true
    });

    expect(summary.dryRun).toBe(false);
    expect(summary.counts["character.created"]).toMatchObject({
      scanned: 1,
      planned: 0,
      applied: 0,
      skippedExisting: 1
    });
    expect(summary.counts["item.rare_received"]).toMatchObject({
      scanned: 1,
      planned: 0,
      applied: 0,
      skippedExisting: 1
    });
    expect(recorder.events.map((event) => event.eventType)).toEqual([
      "character.level_reached",
      "party.raid_won"
    ]);
    expect(recorder.events[0]).toMatchObject({
      dedupeKey: "character.level_reached:character-1:5",
      payload: { level: 5 }
    });
    expect(recorder.events[1]).toMatchObject({
      dedupeKey: "party.raid_won:boss-session-1",
      payload: { participantCount: 2 }
    });
  });

  it("backfills level 8 achievements as important milestone rows", async () => {
    const store = new FakeBackfillStore();
    store.levelAchievements = [
      {
        id: "achievement-row-8",
        characterId: "character-1",
        characterName: "Arden",
        achievementId: "achievement.level.8",
        sourceType: "daily-action",
        sourceId: "daily-8",
        unlockedAt: new Date("2026-07-01T09:08:00.000Z")
      }
    ];
    const recorder = new FakeBackfillRecorder();

    await backfillActivityEvents({
      store,
      recorder,
      apply: true
    });

    const levelEvent = recorder.events.find((event) => event.eventType === "character.level_reached");
    expect(levelEvent).toMatchObject({
      severity: "high",
      dedupeKey: "character.level_reached:character-1:8",
      payload: { level: 8 }
    });
  });

  it("backfills rare manatky as normal and epic manatky as legendary", async () => {
    const store = new FakeBackfillStore();
    store.levelAchievements = [];
    store.partyBossSessions = [];
    store.rareItems = [
      {
        id: "character-item-rare",
        characterId: "character-1",
        characterName: "Arden",
        itemId: "item.towel-of-forty-two-answers",
        createdAt: new Date("2026-07-01T10:00:00.000Z")
      },
      {
        id: "character-item-epic",
        characterId: "character-1",
        characterName: "Arden",
        itemId: "item.loot-v1-w029",
        createdAt: new Date("2026-07-01T10:01:00.000Z")
      }
    ];
    const recorder = new FakeBackfillRecorder();

    await backfillActivityEvents({
      store,
      recorder,
      apply: true
    });

    expect(recorder.events.filter((event) => event.eventType === "item.rare_received")).toEqual([
      expect.objectContaining({
        subjectId: "item.towel-of-forty-two-answers",
        severity: "normal",
        payload: { rarity: "rare" }
      }),
      expect.objectContaining({
        subjectId: "item.loot-v1-w029",
        severity: "legendary",
        payload: { rarity: "epic" }
      })
    ]);
  });

  it("scans source rows in batches when a batch size is provided", async () => {
    const store = new FakeBackfillStore();
    store.characters = [
      { id: "character-1", name: "One", createdAt: new Date("2026-07-01T08:00:00.000Z") },
      { id: "character-2", name: "Two", createdAt: new Date("2026-07-01T08:01:00.000Z") },
      { id: "character-3", name: "Three", createdAt: new Date("2026-07-01T08:02:00.000Z") }
    ];
    store.levelAchievements = [];
    store.rareItems = [];
    store.partyBossSessions = [];
    const recorder = new FakeBackfillRecorder();

    const summary = await backfillActivityEvents({
      store,
      recorder,
      apply: false,
      batchSize: 2
    });

    expect(summary.counts["character.created"]).toMatchObject({ scanned: 3, planned: 3 });
    expect(store.characterPages).toEqual([
      { skip: 0, take: 2 },
      { skip: 2, take: 2 }
    ]);
  });
});

class FakeBackfillStore implements ActivityEventBackfillStore {
  readonly existingDedupeKeys = new Set<string>();
  readonly existingRareItems = new Set<string>();
  readonly characterPages: Array<{ skip: number; take: number }> = [];
  characters: BackfillCharacterCreatedRow[] = [
    {
      id: "character-1",
      name: "Arden",
      createdAt: new Date("2026-07-01T08:00:00.000Z")
    }
  ];
  levelAchievements: BackfillLevelAchievementRow[] = [
    {
      id: "achievement-row-1",
      characterId: "character-1",
      characterName: "Arden",
      achievementId: "achievement.level.5",
      sourceType: "daily-action",
      sourceId: "daily-1",
      unlockedAt: new Date("2026-07-01T09:00:00.000Z")
    }
  ];
  rareItems: BackfillRareCharacterItemRow[] = [
    {
      id: "character-item-1",
      characterId: "character-1",
      characterName: "Arden",
      itemId: "item.towel-of-forty-two-answers",
      createdAt: new Date("2026-07-01T10:00:00.000Z")
    }
  ];
  partyBossSessions: BackfillPartyBossSessionRow[] = [
    {
      id: "boss-session-1",
      status: "won",
      rulesVersion: BIG_BARREL_BROTHER_RULES_VERSION,
      bossKey: BIG_BARREL_BROTHER_BOSS_KEY,
      stateJson: {
        boss: {
          monsterId: BIG_BARREL_BROTHER_BOSS_KEY,
          name: "Big Barrel Brother"
        },
        participants: [
          { characterId: "character-1" },
          { characterId: "character-2" }
        ],
        completedAt: "2026-07-01T11:00:00.000Z"
      },
      completedAt: new Date("2026-07-01T11:00:00.000Z"),
      createdAt: new Date("2026-07-01T10:30:00.000Z")
    }
  ];

  listCharactersCreatedSince(
    _since: Date | null,
    page?: { skip: number; take: number }
  ): Promise<BackfillCharacterCreatedRow[]> {
    if (!page) {
      return Promise.resolve(this.characters);
    }

    this.characterPages.push(page);
    return Promise.resolve(this.characters.slice(page.skip, page.skip + page.take));
  }

  listLevelAchievementsSince(
    _since: Date | null,
    _achievementIds: readonly string[],
    page?: { skip: number; take: number }
  ): Promise<BackfillLevelAchievementRow[]> {
    return Promise.resolve(page
      ? this.levelAchievements.slice(page.skip, page.skip + page.take)
      : this.levelAchievements);
  }

  listRareCharacterItemsSince(
    _since: Date | null,
    _itemIds: readonly string[],
    page?: { skip: number; take: number }
  ): Promise<BackfillRareCharacterItemRow[]> {
    return Promise.resolve(page ? this.rareItems.slice(page.skip, page.skip + page.take) : this.rareItems);
  }

  listWonPartyBossSessionsSince(
    _since: Date | null,
    page?: { skip: number; take: number }
  ): Promise<BackfillPartyBossSessionRow[]> {
    return Promise.resolve(page
      ? this.partyBossSessions.slice(page.skip, page.skip + page.take)
      : this.partyBossSessions);
  }

  hasActivityEventDedupeKey(dedupeKey: string): Promise<boolean> {
    return Promise.resolve(this.existingDedupeKeys.has(dedupeKey));
  }

  hasRareItemEvent(characterId: string, itemId: string): Promise<boolean> {
    return Promise.resolve(this.existingRareItems.has(`${characterId}:${itemId}`));
  }
}

class FakeBackfillRecorder {
  readonly events: RecordActivityEventInput[] = [];

  record(input: RecordActivityEventInput): Promise<unknown> {
    this.events.push(input);
    return Promise.resolve(input);
  }
}
