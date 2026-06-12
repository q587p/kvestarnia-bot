import { describe, expect, it } from "vitest";
import {
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
  title: "Пересічний Герой",
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
    expect(text).toContain("Вона дихає.\n\nШинкар:\n<blockquote>То не моя.</blockquote>");
    expect(text.length).toBeLessThan(260);
  });

  it("prompts /start when no character exists", () => {
    expect(presentAdventureNoCharacter()).toContain("/start");
  });

  it("shows rewards for each action", () => {
    expect(presentAdventureResult(completed("poke", 8, 4))).toContain("+8 XP · +4 золота");
    expect(presentAdventureResult(completed("poke", 8, 4))).toContain(
      "Здобуто: Підозрілий лавашний доказ"
    );
    expect(presentAdventureResult(completed("poke", 8, 4))).not.toContain("×1");
    expect(presentAdventureResult(completed("receipt", 6, 6))).toContain("+6 XP · +6 золота");
    expect(presentAdventureResult(completed("flee", 2, 0))).toContain("+2 XP");
    expect(presentAdventureResult(completed("flee", 2, 0))).not.toContain("золота");
    expect(presentAdventureResult(completed("flee", 2, 0))).not.toContain("Здобуто:");
  });

  it("shows level-up line only when level increases", () => {
    expect(presentAdventureResult(completed("poke", 8, 4, true))).toContain("Рівень підріс: 1 → 2");
    expect(presentAdventureResult(completed("poke", 8, 4, true))).toContain(
      "Стало краще: +4 HP · +2 мани · +1 Сили"
    );
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
