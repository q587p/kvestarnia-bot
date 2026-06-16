import { describe, expect, it } from "vitest";
import {
  applyXpReward,
  getLevelForXp,
  getLevelStartXp,
  getNextLevelThreshold,
  getRemortXpExtraTotal
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
    [109, 5],
    [110, 6],
    [159, 6],
    [160, 7],
    [224, 7],
    [225, 8],
    [304, 8],
    [305, 9],
    [449, 9],
    [450, 10],
    [649, 10],
    [650, 11],
    [899, 11],
    [900, 12],
    [1299, 12],
    [1300, 13],
    [1500, 13]
  ])("maps %i XP to level %i", (xp, level) => {
    expect(getLevelForXp(xp)).toBe(level);
  });

  it("returns the next threshold until the current cap", () => {
    expect(getNextLevelThreshold(1)).toBe(10);
    expect(getNextLevelThreshold(2)).toBe(25);
    expect(getNextLevelThreshold(5)).toBe(110);
    expect(getNextLevelThreshold(9)).toBe(450);
    expect(getNextLevelThreshold(10)).toBe(650);
    expect(getNextLevelThreshold(12)).toBe(1300);
    expect(getNextLevelThreshold(13)).toBeNull();
  });

  it("raises thresholds proportionally after remort", () => {
    expect(getRemortXpExtraTotal(1, 1)).toBe(0);
    expect(getRemortXpExtraTotal(13, 1)).toBe(1000);
    expect(getLevelStartXp(13, { remortCount: 1 })).toBe(2300);
    expect(getNextLevelThreshold(12, { remortCount: 1 })).toBe(2300);
    expect(getLevelForXp(1300, { remortCount: 1 })).toBe(10);
    expect(getLevelForXp(2300, { remortCount: 1 })).toBe(13);
  });

  it("detects threshold crossing", () => {
    expect(applyXpReward(7, 8)).toMatchObject({
      oldLevel: 1,
      newLevel: 2,
      newXp: 15,
      leveledUp: true
    });
  });

  it("detects threshold crossing on remort-adjusted curves", () => {
    expect(applyXpReward(990, 30, { remortCount: 1 })).toMatchObject({
      oldLevel: 9,
      newLevel: 10,
      newXp: 1020,
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
