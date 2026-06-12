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
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Герой",
  level: 1,
  xp: 7,
  nextLevelXp: 10,
  xpToNextLevel: 3,
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

describe("tavern presenter", () => {
  it("shows a short Ukrainian tavern screen", () => {
    const text = presentTavern(character);

    expect(text).toContain("Таверна Квестарні");
    expect(text).toContain("Бочка Пінного Міражу");
    expect(text).toContain(
      "Шинкар:\n<blockquote>Це не проблема. Це рейд на 1-3 хвилини.</blockquote>"
    );
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
        localDate: "2026-06-12",
        itemGrants: [
          {
            itemId: "item.wet-hero-ticket",
            name: "Квиток мокрого героя",
            quantity: 1
          }
        ]
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

    expect(presentTavernRaidResult(completed)).toContain("<b>+7 XP · +5 золота</b>");
    expect(presentTavernRaidResult(completed)).toContain(
      "Здобуто: <i>Квиток мокрого героя</i>"
    );
    expect(presentTavernRaidResult(completed)).not.toContain("×1");
    expect(presentTavernRaidResult(repeated)).toContain("уже зараховано");
    expect(presentTavernRaidResult(repeated)).toContain(
      "Вже отримано: <b>+7 XP · +5 золота</b>"
    );
    expect(presentTavernRaidResult(repeated)).not.toContain("Здобуто:");
    expect(presentTavernRaidResult(completed).toLowerCase()).not.toContain("пий");
  });

  it("shows level-up only when tavern reward increases level", () => {
    const completed: Exclude<TavernRaidResult, { state: "no-character" }> = {
      state: "completed",
      character,
      reward: {
        xp: 7,
        gold: 5,
        localDate: "2026-06-12",
        itemGrants: []
      },
      levelChange: {
        oldLevel: 1,
        newLevel: 2,
        leveledUp: true
      }
    };

    expect(presentTavernRaidResult(completed)).toContain("Рівень підріс: 1 → 2");
    expect(presentTavernRaidResult(completed)).toContain(
      "Стало краще: +4 HP · +2 мани · +1 Сили"
    );
  });
});
