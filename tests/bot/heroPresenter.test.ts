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
  level: 2,
  xp: 15,
  nextLevelXp: 25,
  xpToNextLevel: 10,
  gold: 12,
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
};

describe("hero presenter", () => {
  it("shows race, class, stats, and a next step for an existing character", () => {
    const text = presentHero(summary);

    expect(text).toContain("<b>Мандрівник</b>");
    expect(text).toContain("<i>Людисько · Воїн</i>");
    expect(text).toContain("Людисько");
    expect(text).toContain("Воїн");
    expect(text).toContain("Звертання: Вони");
    expect(text).not.toContain("Стать:");
    expect(text).toContain("Вони");
    expect(text).toContain("Пересічний Герой");
    expect(text).toContain("до рівня 3: 10 XP");
    expect(text).toContain("HP 24/24 · мана 12/12");
    expect(text).toContain("Сили 9");
    expect(text).toContain("Вдача 6");
    expect(text).toContain("Ріст рівня: +4 HP · +2 мани · +1 Сили");
    expect(text).toContain("<i>Далі:");
    expect(text).toContain("\n\nЗвертання:");
    expect(text).toContain("\n\nHP");
    expect(text.split("\n").length).toBeLessThanOrEqual(13);
  });

  it("shows alpha cap wording at the current level cap", () => {
    const text = presentHero({
      ...summary,
      level: 5,
      xp: 75,
      nextLevelXp: null,
      xpToNextLevel: null
    });

    expect(text).toContain("поточна стеля альфи");
    expect(text).not.toContain("до рівня 6");
  });

  it("prompts /start when the character does not exist", () => {
    expect(presentHeroMissing()).toContain("/start");
  });
});
