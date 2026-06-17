import { describe, expect, it } from "vitest";
import {
  presentTrainingDoppelganger,
  presentTrainingDoppelgangerNeedsRest,
  presentTrainingDoppelgangerNoCharacter
} from "../../src/bot/presenters/trainingDoppelgangerPresenter";
import { summarizeCharacter } from "../../src/domain/characters/characterSummary";

describe("training doppelganger presenter", () => {
  it("renders a safe training-only result card", () => {
    const character = summarizeCharacter({
      name: "<b>Мандрівник</b>",
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

    const text = presentTrainingDoppelganger({
      state: "ready",
      character,
      doppelganger: {
        name: "Сумлінний Допельґанґер",
        raceName: character.raceName,
        className: character.className,
        title: character.title,
        level: character.level
      },
      resolution: {
        outcome: "draw",
        reason: "mutual-paperwork",
        heroScore: 42,
        doppelgangerScore: 42
      },
      replayKey: "test"
    });

    expect(text).toContain("🥊 <b>Бійцівський куток</b>");
    expect(text).toContain("&lt;b&gt;Мандрівник&lt;/b&gt;");
    expect(text).toContain("Сумлінний Допельґанґер");
    expect(text).toContain("Результат: нічия");
    expect(text).toContain("Нагород немає");
    expect(text).not.toContain("42");
    expect(text).not.toContain("test");
    expect(text).not.toContain("<b>Мандрівник</b>");
  });

  it("keeps no-character and needs-rest copy short and Ukrainian", () => {
    expect(presentTrainingDoppelgangerNoCharacter()).toContain("/start");

    const character = summarizeCharacter({
      name: "Мандрівник",
      pronoun: "they",
      path: "path.sun",
      raceId: "race.human-ish",
      classId: "class.warrior",
      level: 3,
      xp: 25,
      gold: 0,
      hpCurrent: 0,
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
    const text = presentTrainingDoppelgangerNeedsRest({ state: "needs-rest", character });

    expect(text).toContain("Спершу віддихайтеся");
    expect(text).toContain("Бійцівський куток");
  });
});
