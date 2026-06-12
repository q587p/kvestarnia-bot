import { describe, expect, it } from "vitest";
import {
  presentFightNoCharacter,
  presentFightResult,
  presentFightStart
} from "../../src/bot/presenters/fightPresenter";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";
import type { FightResult } from "../../src/services/fightService";

const character: CharacterSummary = {
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
  gold: 9,
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

describe("fight presenter", () => {
  it("shows a short Ukrainian start scene", () => {
    const text = presentFightStart(character);

    expect(text).toContain("Сутичка з Міміком-шаурмою");
    expect(text).toContain("❤️ Ви: 22/22");
    expect(text).toContain("🌯 Мімік: 14/14");
    expect(text).toContain("Що робимо?");
    expect(text.length).toBeLessThan(240);
  });

  it("prompts /start when no character exists", () => {
    expect(presentFightNoCharacter()).toContain("/start");
  });

  it("shows combat preview and reward for a completed action", () => {
    const text = presentFightResult(completed("attack", 9, 3));

    expect(text).toContain("Ви вдарили");
    expect(text).toContain("❤️ Ви: 19/22");
    expect(text).toContain("🌯 Мімік: 5/14");
    expect(text).toContain("Нагорода: +9 XP · +3 золота");
    expect(text).toContain("Здобуто: Підозрілий лавашний доказ ×1");
  });

  it("shows level-up line only when level increases", () => {
    expect(presentFightResult(completed("receipt", 7, 5, true))).toContain("Рівень підріс: 1 → 2");
    expect(presentFightResult(completed("receipt", 7, 5, false))).not.toContain("Рівень підріс");
  });

  it("does not imply duplicate rewards for already-completed fight", () => {
    const text = presentFightResult({
      state: "already-completed",
      character
    });

    expect(text).toContain("вже зараховано");
    expect(text).not.toContain("+9 XP");
  });
});

function completed(
  action: "attack" | "receipt" | "flee",
  xp: number,
  gold: number,
  leveledUp = false
): Exclude<FightResult, { state: "no-character" | "already-completed" }> {
  return {
    state: "completed",
    action,
    character,
    combat: {
      action,
      playerHpPreview: 19,
      playerHpMaxPreview: 22,
      enemyHpPreview: 5,
      enemyHpMaxPreview: 14,
      playerDamage: 9,
      enemyDamage: 3,
      outcome: action === "receipt" ? "messy-win" : action === "flee" ? "flee" : "win"
    },
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
