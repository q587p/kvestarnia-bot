import { describe, expect, it } from "vitest";
import {
  applyXpReward,
  getLevelForXp,
  getNextLevelThreshold
} from "../../src/domain/progression/level";

describe("level progression", () => {
  it.each([
    [0, 1],
    [9, 1],
    [10, 2],
    [24, 2],
    [25, 3],
    [44, 3],
    [45, 4],
    [69, 4],
    [70, 5],
    [999, 5]
  ])("maps %i XP to level %i", (xp, level) => {
    expect(getLevelForXp(xp)).toBe(level);
  });

  it("returns the next threshold until the current cap", () => {
    expect(getNextLevelThreshold(1)).toBe(10);
    expect(getNextLevelThreshold(2)).toBe(25);
    expect(getNextLevelThreshold(5)).toBeNull();
  });

  it("detects threshold crossing", () => {
    expect(applyXpReward(7, 8)).toMatchObject({
      oldLevel: 1,
      newLevel: 2,
      newXp: 15,
      leveledUp: true
    });
  });

  it("keeps level unchanged when reward does not cross a threshold", () => {
    expect(applyXpReward(2, 2)).toMatchObject({
      oldLevel: 1,
      newLevel: 1,
      newXp: 4,
      leveledUp: false
    });
  });
});
