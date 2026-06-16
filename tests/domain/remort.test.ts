import { describe, expect, it } from "vitest";
import { buildRemortStarterStats, getRemortMemoryRank } from "../../src/domain/remort";

describe("remort memory bonuses", () => {
  it("uses 23 percent of previous level growth, rounded up, including the previous primary stat", () => {
    const stats = buildRemortStarterStats({
      raceId: "race.human-ish",
      classId: "class.warrior",
      remortNumber: 1,
      previousLevel: 13,
      previousClassId: "class.mage"
    });

    expect(stats.memoryRank).toBe(1);
    expect(stats.hpBonus).toBe(12);
    expect(stats.manaBonus).toBe(6);
    expect(stats.statBonus).toEqual({ stat: "intelligence", bonus: 3 });
    expect(stats.hpMax).toBe(32);
    expect(stats.manaMax).toBe(16);
    expect(stats.stats.intelligence).toBe(9);
  });

  it("does not cap memory rank at a public or hidden x/5 scale", () => {
    expect(getRemortMemoryRank(7)).toBe(7);
  });
});
