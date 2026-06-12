import { describe, expect, it } from "vitest";
import { presentHero, presentHeroMissing } from "../../src/bot/presenters/heroPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

const summary: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Герой",
  level: 1,
  xp: 0,
  gold: 0,
  hpCurrent: 22,
  hpMax: 22,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 8,
    dexterity: 6,
    intelligence: 6,
    charisma: 6,
    luck: 6
  }
};

describe("hero presenter", () => {
  it("shows race, class, stats, and a next step for an existing character", () => {
    const text = presentHero(summary);

    expect(text).toContain("Людисько");
    expect(text).toContain("Воїн");
    expect(text).toContain("Звертання: Вони");
    expect(text).not.toContain("Стать:");
    expect(text).toContain("Вони");
    expect(text).toContain("Пересічний Герой");
    expect(text).toContain("Сили 8");
    expect(text).toContain("Вдача 6");
    expect(text).toContain("Далі:");
    expect(text.split("\n").length).toBeLessThanOrEqual(8);
  });

  it("prompts /start when the character does not exist", () => {
    expect(presentHeroMissing()).toContain("/start");
  });
});
