import { describe, expect, it } from "vitest";
import { buildStarterStats } from "../../src/domain/characters/starterStats";

describe("buildStarterStats", () => {
  it("is deterministic for the same race and class", () => {
    expect(buildStarterStats("race.human-ish", "class.warrior")).toEqual(
      buildStarterStats("race.human-ish", "class.warrior")
    );
  });

  it("applies race and class modifiers predictably", () => {
    const stats = buildStarterStats("race.human-ish", "class.warrior");

    expect(stats.stats.strength).toBe(8);
    expect(stats.stats.dexterity).toBe(6);
    expect(stats.stats.intelligence).toBe(5);
    expect(stats.stats.charisma).toBe(6);
    expect(stats.stats.luck).toBe(5);
  });

  it("keeps generated HP and mana positive", () => {
    const stats = buildStarterStats("race.dryland-rusalka", "class.mage");

    expect(stats.hpCurrent).toBeGreaterThan(0);
    expect(stats.hpMax).toBeGreaterThan(0);
    expect(stats.manaCurrent).toBeGreaterThan(0);
    expect(stats.manaMax).toBeGreaterThan(0);
  });
});
