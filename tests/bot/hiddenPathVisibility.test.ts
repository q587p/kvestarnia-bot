import { describe, expect, it } from "vitest";
import {
  presentCharacterCreated,
  presentCharacterSummary,
  presentClassSelected
} from "../../src/bot/presenters/onboardingPresenter";
import { presentAdventureStart } from "../../src/bot/presenters/adventurePresenter";
import { presentCellarResult, presentCellarStart } from "../../src/bot/presenters/cellarPresenter";
import { presentFightStart } from "../../src/bot/presenters/fightPresenter";
import { presentHero } from "../../src/bot/presenters/heroPresenter";
import { presentKorchmaHall, presentTavern } from "../../src/bot/presenters/tavernPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

const summary: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "he",
  pronounLabel: "Він",
  path: "sun",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Герой",
  level: 1,
  xp: 0,
  nextLevelXp: 10,
  xpToNextLevel: 10,
  gold: 0,
  hpCurrent: 20,
  hpMax: 20,
  manaCurrent: 10,
  manaMax: 10,
  stats: {
    strength: 7,
    dexterity: 5,
    intelligence: 5,
    charisma: 5,
    luck: 5
  },
  levelBonus: {
    hpMax: 0,
    manaMax: 0,
    primaryStat: null
  }
};

describe("hidden character path visibility", () => {
  it("keeps internal path names out of player-facing presenters", () => {
    const texts = [
      presentClassSelected("he", "race.human-ish", "class.warrior"),
      presentCharacterSummary(summary),
      presentCharacterCreated(summary, true),
      presentHero(summary),
      presentKorchmaHall(summary),
      presentTavern(summary),
      presentAdventureStart(summary),
      presentFightStart(summary),
      presentCellarStart({ state: "ready", character: summary }),
      presentCellarResult({
        state: "completed",
        action: "sweep-bravely",
        character: summary,
        reward: {
          xp: 1,
          gold: 0,
          itemGrants: []
        },
        availableAt: new Date("2026-06-13T10:03:00.000Z"),
        now: new Date("2026-06-13T10:00:00.000Z"),
        levelChange: {
          oldLevel: 1,
          newLevel: 1,
          leveledUp: false
        }
      })
    ];

    for (const text of texts) {
      expect(text).not.toMatch(/\b(?:sun|moon|boundary)\b/i);
      expect(text).not.toContain("Сонячний шлях");
      expect(text).not.toContain("Місячний шлях");
      expect(text).not.toContain("Межовий шлях");
      expect(text).not.toContain("hidden path");
    }
  });
});
