import { describe, expect, it } from "vitest";
import {
  presentYegerHelp,
  presentYegerQuest,
  presentYegerStart,
  presentYegerTurnIn
} from "../../src/bot/presenters/yegerPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("Yeger presenter", () => {
  it("shows the offered quest without unsafe HTML", () => {
    const text = presentYegerQuest({
      state: "offered",
      character: {
        ...character,
        name: "<b>Мандрівник</b>",
        title: "Титул <i>підступу</i>"
      },
      progress: { wins: 0, target: 5 }
    });

    expect(text).toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>");
    expect(text).toContain("Доступна справа:");
    expect(text).toContain("<b>Неспокійні справи</b>");
    expect(text).not.toContain("<b>Мандрівник</b>");
  });

  it("renders progress and turn-in copy", () => {
    const text = presentYegerQuest({
      state: "turn-in-ready",
      character,
      progress: { wins: 5, target: 5 }
    });

    expect(text).toContain("Прогрес: <b>5/5</b>.");
    expect(text).toContain("Єгер має вираз обличчя");
  });

  it("renders completed reward as separate lines", () => {
    const text = presentYegerTurnIn({
      state: "completed",
      character,
      progress: { wins: 5, target: 5 },
      reward: {
        xp: 80,
        gold: 120,
        itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }]
      },
      levelChange: {
        oldLevel: 4,
        newLevel: 4,
        leveledUp: false
      }
    });

    expect(text).toContain("Нагорода:");
    expect(text).toContain("<b>+80 XP\n+120 золота</b>");
    expect(text).toContain("Здобуто: <i>Єгерська риска на дощечці</i>");
  });

  it("explains start and target help", () => {
    expect(presentYegerStart({ state: "in-progress", character, progress: { wins: 0, target: 5 } })).toContain(
      "дозвіл на прогрес"
    );
    expect(presentYegerHelp()).toContain("Втеча, поразка й протермінована сутичка");
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
  level: 4,
  xp: 70,
  nextLevelXp: 110,
  xpToNextLevel: 40,
  gold: 0,
  hpCurrent: 24,
  hpMax: 24,
  manaCurrent: 12,
  manaMax: 12,
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
