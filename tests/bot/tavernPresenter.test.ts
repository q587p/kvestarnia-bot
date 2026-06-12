import { describe, expect, it } from "vitest";
import {
  presentTavern,
  presentTavernNoCharacter,
  presentTavernRaidResult
} from "../../src/bot/presenters/tavernPresenter";
import type { TavernRaidResult } from "../../src/services/tavernRaidService";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Герой",
  level: 1,
  xp: 7,
  gold: 5,
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

describe("tavern presenter", () => {
  it("shows a short Ukrainian tavern screen", () => {
    const text = presentTavern(character);

    expect(text).toContain("Таверна Квестарні");
    expect(text).toContain("Бочка Пінного Міражу");
    expect(text).toContain("> Шинкар: «Це не проблема. Це рейд на 1-3 хвилини».");
    expect(text).toContain("Що робимо?");
    expect(text.length).toBeLessThan(320);
  });

  it("prompts /start when no character exists", () => {
    expect(presentTavernNoCharacter()).toContain("/start");
  });

  it("presents first completion and repeated completion without real drinking framing", () => {
    const completed: Exclude<TavernRaidResult, { state: "no-character" }> = {
      state: "completed",
      character,
      reward: {
        xp: 7,
        gold: 5,
        flavor: "квиток мокрого героя",
        localDate: "2026-06-12"
      },
      levelChange: {
        oldLevel: 1,
        newLevel: 1,
        leveledUp: false
      }
    };
    const repeated = {
      ...completed,
      state: "already-completed" as const,
      levelChange: null
    };

    expect(presentTavernRaidResult(completed)).toContain("+7 XP · +5 золота");
    expect(presentTavernRaidResult(completed)).toContain("квиток мокрого героя");
    expect(presentTavernRaidResult(repeated)).toContain("уже зараховано");
    expect(presentTavernRaidResult(completed).toLowerCase()).not.toContain("пий");
  });

  it("shows level-up only when tavern reward increases level", () => {
    const completed: Exclude<TavernRaidResult, { state: "no-character" }> = {
      state: "completed",
      character,
      reward: {
        xp: 7,
        gold: 5,
        flavor: "квиток мокрого героя",
        localDate: "2026-06-12"
      },
      levelChange: {
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      }
    };

    expect(presentTavernRaidResult(completed)).toContain("Рівень підріс: 1 → 2");
  });
});
