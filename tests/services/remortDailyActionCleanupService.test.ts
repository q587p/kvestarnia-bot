import { describe, expect, it } from "vitest";
import {
  runRemortDailyActionCleanup,
  type RemortCleanupCharacter,
  type RemortDailyActionCleanupStore
} from "../../src/services/remortDailyActionCleanupService";
import {
  YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
  YEGER_UNQUIET_TRIAL_STARTED_KEY
} from "../../src/services/dailyActionKeys";

describe("runRemortDailyActionCleanup", () => {
  it("previews only daily action rows created before the latest remort", async () => {
    const store = new FakeRemortDailyActionCleanupStore([
      {
        id: "character-1",
        name: "Пані Реморт",
        level: 1,
        latestRemortCreatedAt: new Date("2026-06-18T00:00:00.000Z"),
        dailyActions: [
          {
            id: "old-shawarma",
            key: "combat.mimic-shawarma.adventure",
            localDate: "2026-06-17",
            createdAt: new Date("2026-06-17T23:00:00.000Z")
          },
          {
            id: "new-shawarma",
            key: "combat.mimic-shawarma.adventure",
            localDate: "2026-06-18",
            createdAt: new Date("2026-06-18T01:00:00.000Z")
          }
        ]
      }
    ]);

    const summary = await runRemortDailyActionCleanup({
      store,
      apply: false,
      keys: ["combat.mimic-shawarma.adventure"]
    });

    expect(summary).toMatchObject({
      dryRun: true,
      charactersScanned: 1,
      charactersAffected: 1,
      actionsMatched: 1,
      actionsDeleted: 0
    });
    expect(summary.entries[0]?.actionIds).toEqual(["old-shawarma"]);
    expect(store.deletedIds).toEqual([]);
  });

  it("applies deletion by stale daily action ids", async () => {
    const store = new FakeRemortDailyActionCleanupStore([
      {
        id: "character-1",
        name: "Пані Реморт",
        level: 1,
        latestRemortCreatedAt: new Date("2026-06-18T00:00:00.000Z"),
        dailyActions: [
          {
            id: "old-problem",
            key: "quest.problem-chain.13.issued",
            localDate: "once",
            createdAt: new Date("2026-06-17T23:00:00.000Z")
          }
        ]
      }
    ]);

    const summary = await runRemortDailyActionCleanup({
      store,
      apply: true,
      keys: ["quest.problem-chain.13.issued"]
    });

    expect(summary).toMatchObject({
      dryRun: false,
      charactersAffected: 1,
      actionsMatched: 1,
      actionsDeleted: 1
    });
    expect(store.deletedIds).toEqual(["old-problem"]);
  });

  it("includes stale Yeger quest rows in the default remort cleanup keys", async () => {
    const store = new FakeRemortDailyActionCleanupStore([
      {
        id: "character-1",
        name: "Пані Реморт",
        level: 1,
        latestRemortCreatedAt: new Date("2026-06-18T00:00:00.000Z"),
        dailyActions: [
          {
            id: "old-yeger-started",
            key: YEGER_UNQUIET_TRIAL_STARTED_KEY,
            localDate: "once",
            createdAt: new Date("2026-06-17T23:00:00.000Z")
          },
          {
            id: "old-yeger-completed",
            key: YEGER_UNQUIET_TRIAL_COMPLETED_KEY,
            localDate: "once",
            createdAt: new Date("2026-06-17T23:00:01.000Z")
          }
        ]
      }
    ]);

    const summary = await runRemortDailyActionCleanup({
      store,
      apply: false
    });

    expect(store.lastKeys).toEqual(
      expect.arrayContaining([
        YEGER_UNQUIET_TRIAL_STARTED_KEY,
        YEGER_UNQUIET_TRIAL_COMPLETED_KEY
      ])
    );
    expect(summary).toMatchObject({
      charactersAffected: 1,
      actionsMatched: 2,
      actionsDeleted: 0
    });
    expect(summary.entries[0]?.actionIds).toEqual([
      "old-yeger-started",
      "old-yeger-completed"
    ]);
  });
});

class FakeRemortDailyActionCleanupStore implements RemortDailyActionCleanupStore {
  readonly deletedIds: string[] = [];
  lastKeys: readonly string[] = [];

  constructor(private readonly characters: RemortCleanupCharacter[]) {}

  listRemortedCharactersWithDailyActions(keys: readonly string[]): Promise<RemortCleanupCharacter[]> {
    this.lastKeys = keys;
    return Promise.resolve(this.characters);
  }

  deleteDailyActionsByIds(ids: readonly string[]): Promise<number> {
    this.deletedIds.push(...ids);

    return Promise.resolve(ids.length);
  }
}
