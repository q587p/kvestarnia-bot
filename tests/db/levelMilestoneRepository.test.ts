import { describe, expect, it, vi } from "vitest";
import {
  buildLevelMilestoneKey,
  parseLevelMilestoneKey,
  recordLevelMilestones
} from "../../src/db/repositories/levelMilestoneRepository";

describe("level milestone repository helpers", () => {
  it("records each newly reached level milestone", async () => {
    const created: unknown[] = [];
    const tx = {
      dailyAction: {
        create: vi.fn((input: unknown) => {
          created.push(input);
          return Promise.resolve(input);
        })
      }
    };

    await recordLevelMilestones(tx, "character-1", 1, 4, new Date("2026-06-15T10:00:00.000Z"));

    expect(tx.dailyAction.create).toHaveBeenCalledTimes(3);
    expect(created).toEqual([
      {
        data: {
          characterId: "character-1",
          key: "milestone.level.2",
          localDate: "once",
          rewardXp: 0,
          rewardGold: 0,
          createdAt: new Date("2026-06-15T10:00:00.000Z")
        }
      },
      {
        data: {
          characterId: "character-1",
          key: "milestone.level.3",
          localDate: "once",
          rewardXp: 0,
          rewardGold: 0,
          createdAt: new Date("2026-06-15T10:00:00.000Z")
        }
      },
      {
        data: {
          characterId: "character-1",
          key: "milestone.level.4",
          localDate: "once",
          rewardXp: 0,
          rewardGold: 0,
          createdAt: new Date("2026-06-15T10:00:00.000Z")
        }
      }
    ]);
  });

  it("parses only valid level milestone keys", () => {
    expect(buildLevelMilestoneKey(7)).toBe("milestone.level.7");
    expect(parseLevelMilestoneKey("milestone.level.7")).toBe(7);
    expect(parseLevelMilestoneKey("milestone.level.1")).toBeNull();
    expect(parseLevelMilestoneKey("daily.level.7")).toBeNull();
    expect(parseLevelMilestoneKey("milestone.level.nope")).toBeNull();
  });
});
