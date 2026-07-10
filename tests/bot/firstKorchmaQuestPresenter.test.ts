import { describe, expect, it } from "vitest";
import { presentFirstKorchmaQuestCompletion } from "../../src/bot/presenters/firstKorchmaQuestPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("first Korchma quest presenter", () => {
  it("announces the next two starter quests after completion", () => {
    const text = presentFirstKorchmaQuestCompletion({
      state: "completed",
      character,
      progress: {
        enteredKorchma: true,
        reachedQuestTable: true,
        currentLocationId: "location.korchma.quest-table"
      },
      reward: { xp: 1, gold: 0 },
      levelChange: null,
      achievementUnlocks: []
    });

    expect(text).toContain("📋 <b>Справу закрито: Перший крок до столу</b>");
    expect(text).toContain("На столі для вас розгорнулися ще дві справи:");
    expect(text).toContain("🌯 <b>Підозріла шаурма</b> — новачкова підозра чекає на столі.");
    expect(text).toContain("⚔️ <b>Новачкова сутичка</b> — підозріла шаурма ще не дала свідчень.");
    expect(text).toContain("+1 XP");
  });

  it("stays quiet when the route is not ready", () => {
    expect(presentFirstKorchmaQuestCompletion({
      state: "not-ready",
      character,
      progress: {
        enteredKorchma: true,
        reachedQuestTable: false,
        currentLocationId: "location.korchma.hall"
      }
    })).toBeNull();
  });
});

const character: CharacterSummary = {
    name: "Мандрівник",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Пересічні Пригодники",
    level: 1,
    xp: 1,
    nextLevelXp: 10,
    xpToNextLevel: 9,
    gold: 0,
    hpCurrent: 20,
    hpMax: 20,
    manaCurrent: 10,
    manaMax: 10,
    stats: {
      strength: 8,
      dexterity: 6,
      intelligence: 6,
      charisma: 6,
      luck: 6
    },
    levelBonus: {
      hpMax: 0,
      manaMax: 0,
      primaryStat: {
        stat: "strength",
        bonus: 0
      }
    }
  };
