import { describe, expect, it } from "vitest";
import { buildEffectiveCharacterStats } from "../../src/domain/progression/effectiveStats";
import type { CharacterStats } from "../../src/domain/characters/starterStats";

const storedStats: CharacterStats = {
  strength: 8,
  dexterity: 6,
  intelligence: 6,
  charisma: 6,
  luck: 6
};

describe("buildEffectiveCharacterStats", () => {
  it("returns stored HP, mana, and stats unchanged at level 1", () => {
    expect(buildEffectiveCharacterStats(input({ level: 1 }))).toMatchObject({
      hpCurrent: 20,
      hpMax: 20,
      manaCurrent: 10,
      manaMax: 10,
      stats: storedStats,
      levelBonus: {
        hpMax: 0,
        manaMax: 0,
        primaryStat: {
          stat: "strength",
          bonus: 0
        }
      }
    });
  });

  it("adds HP, mana, and one primary stat point at level 2", () => {
    expect(buildEffectiveCharacterStats(input({ level: 2 }))).toMatchObject({
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12,
      stats: {
        strength: 9,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      },
      levelBonus: {
        hpMax: 4,
        manaMax: 2,
        primaryStat: {
          stat: "strength",
          bonus: 1
        }
      }
    });
  });

  it("adds cumulative level growth at level 3", () => {
    expect(buildEffectiveCharacterStats(input({ level: 3 }))).toMatchObject({
      hpCurrent: 28,
      hpMax: 28,
      manaCurrent: 14,
      manaMax: 14,
      stats: {
        strength: 10
      },
      levelBonus: {
        hpMax: 8,
        manaMax: 4,
        primaryStat: {
          stat: "strength",
          bonus: 2
        }
      }
    });
  });

  it("scales HP and mana for unknown classes without crashing", () => {
    expect(buildEffectiveCharacterStats(input({ classId: "class.mystery", level: 2 }))).toMatchObject({
      hpCurrent: 24,
      hpMax: 24,
      manaCurrent: 12,
      manaMax: 12,
      stats: storedStats,
      levelBonus: {
        hpMax: 4,
        manaMax: 2
      }
    });
  });

  it("does not mutate the input stats object", () => {
    const stats = { ...storedStats };

    buildEffectiveCharacterStats(input({ level: 3, stats }));

    expect(stats).toEqual(storedStats);
  });

  it("treats levels below 1 as level 1", () => {
    expect(buildEffectiveCharacterStats(input({ level: 0 }))).toMatchObject({
      hpMax: 20,
      manaMax: 10,
      stats: storedStats
    });
  });
});

function input(
  overrides: Partial<Parameters<typeof buildEffectiveCharacterStats>[0]> = {}
): Parameters<typeof buildEffectiveCharacterStats>[0] {
  return {
    level: 1,
    classId: "class.warrior",
    hpCurrent: 11,
    hpMax: 20,
    manaCurrent: 3,
    manaMax: 10,
    stats: storedStats,
    ...overrides
  };
}
