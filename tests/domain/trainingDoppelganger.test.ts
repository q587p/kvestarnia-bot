import { describe, expect, it } from "vitest";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";
import { resolveTrainingDoppelgangerSparring } from "../../src/domain/trainingDoppelganger";
import { FakeRandomSource } from "../../src/shared/random";

describe("training doppelganger domain", () => {
  it("resolves a deterministic hero win, mirror win or draw from equal copies", () => {
    const character = summarizeCharacter({
      name: "Мандрівник",
      pronoun: "they",
      path: "path.sun",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 5,
      xp: 100,
      gold: 0,
      hpCurrent: 30,
      hpMax: 30,
      manaCurrent: 14,
      manaMax: 14,
      statsJson: {
        strength: 9,
        dexterity: 7,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    });

    const result = resolveTrainingDoppelgangerSparring(
      character,
      new FakeRandomSource([0.99, 0, 0])
    );

    expect(result).toMatchObject({
      outcome: "hero-wins",
      reason: "hero-found-gap"
    });
    expect(result.heroScore).toBeGreaterThan(result.doppelgangerScore);
  });

  it("uses equipment contributions in the hidden training score", () => {
    const base = summarizeCharacter({
      name: "Мандрівник",
      pronoun: "they",
      path: "path.sun",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 3,
      xp: 25,
      gold: 0,
      hpCurrent: 22,
      hpMax: 22,
      manaCurrent: 10,
      manaMax: 10,
      statsJson: {
        strength: 8,
        dexterity: 6,
        intelligence: 6,
        charisma: 6,
        luck: 6
      }
    });
    const equipped = summarizeCharacter(
      {
        name: "Мандрівник",
        pronoun: "they",
        path: "path.sun",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 3,
        xp: 25,
        gold: 0,
        hpCurrent: 22,
        hpMax: 22,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: {
          strength: 8,
          dexterity: 6,
          intelligence: 6,
          charisma: 6,
          luck: 6
        }
      },
      {
        equippedItems: [
          {
            id: "item.test-pan",
            name: "Тестова пательня",
            description: "Для перевірки.",
            rarity: "common",
            slot: "weapon",
            goldValue: 1,
            effect: { weaponDamage: 2 }
          }
        ]
      }
    );

    const baseResult = resolveTrainingDoppelgangerSparring(
      base,
      new FakeRandomSource([0.5, 0.5, 0.5])
    );
    const equippedResult = resolveTrainingDoppelgangerSparring(
      equipped,
      new FakeRandomSource([0.5, 0.5, 0.5])
    );

    expect(equippedResult.heroScore).toBeGreaterThan(baseResult.heroScore);
    expect(equippedResult.doppelgangerScore).toBeGreaterThan(baseResult.doppelgangerScore);
  });
});
