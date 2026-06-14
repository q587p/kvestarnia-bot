import { describe, expect, it } from "vitest";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";

describe("summarizeCharacter", () => {
  it("returns effective HP, mana, and stats for a level 2 character", () => {
    expect(summarizeCharacter(character({ level: 2, xp: 15 }))).toMatchObject({
      level: 2,
      xp: 15,
      nextLevelXp: 25,
      xpToNextLevel: 10,
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

  it("includes next level progress when not capped", () => {
    expect(summarizeCharacter(character({ level: 3, xp: 31 }))).toMatchObject({
      nextLevelXp: 45,
      xpToNextLevel: 14
    });
  });

  it("uses XP to lift characters past the former level cap", () => {
    expect(summarizeCharacter(character({ level: 5, xp: 225 }))).toMatchObject({
      level: 8,
      nextLevelXp: 305,
      xpToNextLevel: 80
    });
  });

  it("handles capped level", () => {
    expect(summarizeCharacter(character({ level: 10, xp: 425 }))).toMatchObject({
      level: 10,
      nextLevelXp: null,
      xpToNextLevel: null
    });
  });

  it("uses the selected pronoun for content-derived titles", () => {
    expect(
      summarizeCharacter(
        character({
          pronoun: "she",
          raceId: "race.intellectual-orc",
          classId: "class.priest"
        })
      )
    ).toMatchObject({
      pronounLabel: "Вона",
      title: "Етична Зцілювачка Кулаком"
    });
  });
});

function character(overrides: Partial<Parameters<typeof summarizeCharacter>[0]> = {}) {
  return {
    name: "Мандрівник",
    pronoun: "they",
    raceId: "race.human-ish",
    classId: "class.warrior",
    level: 1,
    xp: 0,
    gold: 0,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    statsJson: {
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    ...overrides
  };
}
