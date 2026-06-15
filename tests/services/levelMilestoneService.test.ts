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
      })
    };
    const service = new LevelMilestoneService(repository);

    await expect(service.getBoard()).resolves.toEqual({ levels: [] });
    expect(calls).toEqual(["backfill", "list"]);
  });
});
