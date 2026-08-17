import { describe, expect, it, vi } from "vitest";
import type { LevelMilestoneRepository } from "../../src/db/repositories/levelMilestoneRepository";
import { LevelMilestoneService } from "../../src/services/levelMilestoneService";

describe("LevelMilestoneService", () => {
  it("backfills current levels before reading the public board", async () => {
    const calls: string[] = [];
    const repository: LevelMilestoneRepository = {
      backfillCurrentLevels: vi.fn(async () => {
        calls.push("backfill");
        await Promise.resolve();
      }),
      listFirstReachedLevels: vi.fn(async () => {
        calls.push("list");
        await Promise.resolve();
        return {
          levels: []
        };
      }),
      listFirstReachedLevelsForRemort: vi.fn(async () => {
        calls.push("list-remort");
        await Promise.resolve();
        return {
          levels: []
        };
      })
    };
    const service = new LevelMilestoneService(repository);

    await expect(service.getBoard()).resolves.toEqual({ levels: [] });
    expect(calls).toEqual(["backfill", "list"]);
  });

  it("backfills current levels before reading a remort-specific board", async () => {
    const calls: string[] = [];
    const repository: LevelMilestoneRepository = {
      backfillCurrentLevels: vi.fn(async () => {
        calls.push("backfill");
        await Promise.resolve();
      }),
      listFirstReachedLevels: vi.fn(async () => {
        calls.push("list");
        await Promise.resolve();
        return {
          levels: []
        };
      }),
      listFirstReachedLevelsForRemort: vi.fn(async (remortNumber: number) => {
        calls.push(`list-remort-${remortNumber}`);
        await Promise.resolve();
        return {
          levels: []
        };
      })
    };
    const service = new LevelMilestoneService(repository);

    await expect(service.getBoardForRemort(2)).resolves.toEqual({ levels: [] });
    expect(calls).toEqual(["backfill", "list-remort-2"]);
  });

  it("decorates public milestone identities with current live guild crests when enabled", async () => {
    const repository = {
      backfillCurrentLevels: vi.fn(() => Promise.resolve(undefined)),
      listFirstReachedLevels: vi.fn(() => Promise.resolve({
        levels: [{
          level: 5,
          entries: [{ characterId: "character-1", name: "Дара", rank: 1 }]
        }]
      })),
      listFirstReachedLevelsForRemort: vi.fn()
    } as unknown as LevelMilestoneRepository;
    const service = new LevelMilestoneService(
      repository,
      { getLiveCrestsForCharacterIds: () => Promise.resolve(new Map([["character-1", "🐸"]])) },
      () => new Date("2026-08-17T10:00:00.000Z")
    );

    await expect(service.getBoard()).resolves.toMatchObject({
      levels: [{ entries: [{ characterId: "character-1", guildCrest: "🐸" }] }]
    });
  });
});
