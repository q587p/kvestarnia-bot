import { describe, expect, it } from "vitest";
import {
  presentFightAlreadyCompleted,
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

describe("fight presenter", () => {
  it("shows a short Ukrainian start scene", () => {
    const text = presentFightStart(character);

    expect(text).toContain("Сутичка з підозрілим монстром");
    expect(text).toContain("Це Мімік-шаурма");
    expect(text).toContain("дуже простий і металевий");
    expect(text).toContain("❤️ Ви: 24/24");
    expect(text).toContain("🌯 Мімік: 14/14");
    expect(text).toContain("Що робимо?");
    expect(text.length).toBeLessThan(320);
  });

  it("prompts /start when no character exists", () => {
    expect(presentFightNoCharacter()).toContain("/start");
  });

  it("shows a spent fight screen with an optional quest suggestion", () => {
    const withQuest = presentFightAlreadyCompleted({
      state: "already-completed",
      character,
      questAvailable: true
    });
    const withoutQuest = presentFightAlreadyCompleted({
      state: "already-completed",
      character,
      questAvailable: false
    });

    expect(withQuest).toContain("вже зараховано");
    expect(withQuest).toContain("/quest");
    expect(withQuest).not.toContain("Що робимо?");
    expect(withoutQuest).not.toContain("/quest");
    expect(withoutQuest).toContain("/hero");
  });

  it("shows combat preview and reward for a completed action", () => {
    const text = presentFightResult(completed("attack", 9, 3));

    expect(text).toContain("Ви вдарили");
    expect(text).toContain("навіть лаваш зрозумів сюжет");
    expect(text).toContain("❤️ Ви: 19/22");
    expect(text).toContain("🌯 Мімік: 5/14");
    expect(text).toContain("Нагорода: <b>+9 XP · +3 золота</b>");
    expect(text).toContain("Здобуто: <i>Підозрілий лавашний доказ</i>");
    expect(text).not.toContain("×1");
  });

  it("shows level-up line only when level increases", () => {
    expect(presentFightResult(completed("receipt", 7, 5, true))).toContain("Рівень підріс: 1 → 2");
    expect(presentFightResult(completed("receipt", 7, 5, true))).toContain(
      "Стало краще: +4 HP · +2 мани · +1 Сили"
    );
    expect(presentFightResult(completed("receipt", 7, 5, false))).not.toContain("Рівень підріс");
    expect(presentFightResult(completed("receipt", 7, 5, false))).not.toContain("Стало краще");
  });

  it("does not imply duplicate rewards for already-completed fight", () => {
    const text = presentFightResult({
      state: "already-completed",
      character,
      questAvailable: true
    });

    expect(text).toContain("вже зараховано");
    expect(text).toContain("/quest");
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
