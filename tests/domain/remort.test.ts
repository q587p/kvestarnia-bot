import { describe, expect, it } from "vitest";
import { buildRemortStarterStats, getRemortMemoryRank } from "../../src/domain/remort";

describe("remort memory bonuses", () => {
  it("uses 23 percent of previous distributed level growth, rounded up per stat", () => {
    const stats = buildRemortStarterStats({
      raceId: "race.human-ish",
      classId: "class.warrior",
      remortNumber: 1,
      previousLevel: 13,
      previousClassId: "class.mage",
      previousRaceId: "race.human-ish",
      previousPath: "boundary"
    });

    expect(stats.memoryRank).toBe(1);
    expect(stats.hpBonus).toBe(12);
    expect(stats.manaBonus).toBe(6);
    expect(stats.statBonuses).toEqual([
      { stat: "strength", bonus: 1 },
      { stat: "dexterity", bonus: 1 },
      { stat: "intelligence", bonus: 2 },
      { stat: "charisma", bonus: 1 },
      { stat: "luck", bonus: 1 }
    ]);
    expect(stats.statBonus).toEqual({ stat: "intelligence", bonus: 2 });
    expect(stats.hpMax).toBe(32);
    expect(stats.manaMax).toBe(16);
    expect(stats.stats).toMatchObject({
      strength: 9,
      dexterity: 7,
      intelligence: 7,
      charisma: 7,
      luck: 6
    });
  });

  it("uses previous race and path when preserving distributed growth memory", () => {
    const stats = buildRemortStarterStats({
      raceId: "race.human-ish",
      classId: "class.warrior",
      remortNumber: 3,
      previousLevel: 13,
      previousClassId: "class.warrior",
      previousRaceId: "race.human-ish",
      previousPath: "sun"
    });

    expect(stats.statBonuses).toEqual([
      { stat: "strength", bonus: 4 },
      { stat: "dexterity", bonus: 3 },
      { stat: "intelligence", bonus: 1 },
      { stat: "charisma", bonus: 1 },
      { stat: "luck", bonus: 2 }
    ]);
    expect(stats.stats).toMatchObject({
      strength: 12,
      dexterity: 9,
      intelligence: 6,
      charisma: 7,
      luck: 7
    });
  });

  it("does not cap memory rank at a public or hidden x/5 scale", () => {
    expect(getRemortMemoryRank(7)).toBe(7);
  });
});
