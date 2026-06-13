import { describe, expect, it } from "vitest";
import {
  presentAdventureAlreadyCompleted,
  presentAdventureNoCharacter,
  presentAdventureResult,
  presentAdventureStart
} from "../../src/bot/presenters/adventurePresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { AdventureResult } from "../../src/services/adventureService";

const character: CharacterSummary = {
  name: "Мандрівник",
  pronoun: "they",
  pronounLabel: "Вони",
  path: "boundary",
  raceId: "race.human-ish",
  raceName: "Людисько",
  classId: "class.warrior",
  className: "Воїн",
  title: "Пересічний Пригодник",
  level: 2,
  xp: 15,
  nextLevelXp: 25,
  xpToNextLevel: 10,
  gold: 9,
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

describe("adventure presenter", () => {
  it("shows a short Ukrainian start scene", () => {
    const text = presentAdventureStart(character);

    expect(text).toContain("Підозріла шаурма");
    expect(text).toContain("Вона дихає");
    expect(text).toContain("🌯 Підозріла шаурма\n\nНа столі лежить шаурма. Вона дихає.");
    expect(text).toContain("Вона дихає.\n\nКорчмар:\n<blockquote>То не моя.</blockquote>");
    expect(text.length).toBeLessThan(260);
  });

  it("adds character-aware flavor when race or class content exists", () => {
    const mage = {
      ...character,
      classId: "class.mage",
      className: "Маг"
    };
    const text = presentAdventureStart(mage);

    expect(text).toContain("дуже амбітний часник");
  });

  it("escapes character names in adventure start text", () => {
    const text = presentAdventureStart({
      ...character,
      name: "<b>Мандрівник</b>"
    });

    expect(text).toContain("<b>&lt;b&gt;Мандрівник&lt;/b&gt;</b>, що робимо?");
    expect(text).not.toContain("<b><b>Мандрівник</b></b>, що робимо?");
  });

  it("prompts /start when no character exists", () => {
    expect(presentAdventureNoCharacter()).toContain("/start");
  });

  it("shows a spent quest screen with an optional fight suggestion", () => {
    const withFight = presentAdventureAlreadyCompleted({
      state: "already-completed",
      character,
      fightAvailable: true
    });
    const withoutFight = presentAdventureAlreadyCompleted({
      state: "already-completed",
      character,
      fightAvailable: false
    });

    expect(withFight).toContain("вже дала свідчення");
    expect(withFight).toContain("/fight");
    expect(withFight).not.toContain("що робимо");
    expect(withoutFight).not.toContain("/fight");
    expect(withoutFight).toContain("/hero");
  });


  it("shows rewards for each action", () => {
    const poke = presentAdventureResult(completed("poke", 8, 4));

    expect(poke).toContain(
      [
        "🏆 Шаурму викрито!",
        "",
        "Мімік визнав, що був не вечерею, а життєвим уроком.",
        "",
        "<b>+8 XP",
        "+4 золота</b>",
        "Здобуто: <i>Підозрілий лавашний доказ</i>"
      ].join("\n")
    );
    expect(poke).not.toContain("×1");
    expect(presentAdventureResult(completed("receipt", 6, 6))).toContain(
      "<b>+6 XP\n+6 золота</b>"
    );
    expect(presentAdventureResult(completed("flee", 2, 0))).toContain("<b>+2 XP</b>");
    expect(presentAdventureResult(completed("flee", 2, 0))).not.toContain("золота");
    expect(presentAdventureResult(completed("flee", 2, 0))).not.toContain("Здобуто:");
  });

  it("adds action-aware flavor to completed adventure outcomes", () => {
    const text = presentAdventureResult({
      ...completed("receipt", 6, 6),
      character: {
        ...character,
        classId: "class.bureaucramancer",
        className: "Бюрокромант"
      }
    });

    expect(text).toContain("Форма на лаваш");
  });

  it("keeps level-up out of the result message", () => {
    expect(presentAdventureResult(completed("poke", 8, 4, true))).not.toContain("Рівень підріс");
    expect(presentAdventureResult(completed("poke", 8, 4, true))).not.toContain("Стало краще");
    expect(presentAdventureResult(completed("poke", 8, 4, false))).not.toContain("Рівень підріс");
    expect(presentAdventureResult(completed("poke", 8, 4, false))).not.toContain("Стало краще");
  });

  it("does not imply duplicate rewards for already-completed adventure", () => {
    const text = presentAdventureResult({
      state: "already-completed",
      character
    });

    expect(text).toContain("вже допитано");
    expect(text).not.toContain("+8 XP");
  });
});

function completed(
  action: "poke" | "receipt" | "flee",
  xp: number,
  gold: number,
  leveledUp = false
): Exclude<AdventureResult, { state: "no-character" | "already-completed" }> {
  return {
    state: "completed",
    action,
    character,
    reward: {
      xp,
      gold,
      localDate: "12026-06-12",
      itemGrants:
        action === "flee"
          ? []
          : [
              {
                itemId:
                  action === "receipt"
                    ? "item.receipt-of-formal-suspicion"
                    : "item.suspicious-shawarma-wrapper",
                name:
                  action === "receipt"
                    ? "Чек формальної підозри"
                    : "Підозрілий лавашний доказ",
                quantity: 1
              }
            ]
    },
    levelChange: {
      oldLevel: 1,
      newLevel: leveledUp ? 2 : 1,
      leveledUp
    }
  };
}
