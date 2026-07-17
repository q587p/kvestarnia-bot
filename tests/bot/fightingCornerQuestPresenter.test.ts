import { describe, expect, it } from "vitest";
import {
  presentFightingCornerQuestClaim,
  presentFightingCornerQuestLookup,
  presentFightingCornerQuestProgressNotification
} from "../../src/bot/presenters/fightingCornerQuestPresenter";
import type {
  FightingCornerQuestClaimResult,
  FightingCornerQuestLookupResult
} from "../../src/services/fightingCornerQuestService";

describe("Fighting Corner quest presenter", () => {
  it("explains forwarding, nearby challenges, consent and the three post-accept objectives", () => {
    const text = presentFightingCornerQuestLookup({
      state: "in-progress",
      character: {} as never,
      progress: progress({ accepted: true, trainingCompleted: true, completedObjectives: 1 })
    } satisfies FightingCornerQuestLookupResult);

    expect(text).toContain("<b>Перше правило Бійцівського кутка</b>");
    expect(text).toContain("<i>«Не говорити про Бійцівський куток»</i>");
    expect(text).toContain("<i>«Говорити. Інакше звідки візьметься другий боєць?»</i>");
    expect(text).toContain("<b>Друге правило:</b>");
    expect(text).toContain("перешліть посилання-запрошення");
    expect(text).toContain("<i>«👀 Хто поруч» → «Кинути виклик присутнім»</i>");
    expect(text).toContain("присутнім»</i>.\n\n<b>Третє правило:</b>");
    expect(text).toContain("обидва бійці заходять добровільно");
    expect(text).toContain("а корчмар — із журналом");
    expect(text).not.toContain("за Столом зі справами");
    expect(text).toContain("✅ Потренуватися із Сумлінним Допельґанґером");
    expect(text).toContain("▫️ Завершити миттєву дуель");
  });

  it("directs a 3/3 player back to the physical Quest Table", () => {
    const text = presentFightingCornerQuestProgressNotification({
      telegramUserId: 42n,
      objective: "turn-based-duel",
      progress: progress({
        accepted: true,
        trainingCompleted: true,
        quickDuelCompleted: true,
        turnBasedDuelCompleted: true,
        completedObjectives: 3,
        readyToClaim: true
      })
    });

    expect(text).toContain("3/3");
    expect(text).toContain("Поверніться до столу зі справами");
  });

  it.each(["completed", "already-completed"] as const)(
    "groups the exact stored claim reward into readable paragraphs for %s",
    (state) => {
      const result = {
        state,
        character: {} as never,
        progress: progress({ accepted: true, completedObjectives: 3, readyToClaim: true }),
        reward: {
          xp: 42,
          gold: 91,
          itemGrants: [
            {
              itemId: "item.pink-soap-of-first-rule",
              name: "Рожеве мило першого правила",
              quantity: 1
            },
            { itemId: "item.iskrokamin", name: "Іскрокамінь", quantity: 1 },
            { itemId: "item.iskrokamin", name: "Іскрокамінь", quantity: 1 }
          ]
        },
        levelChange: null
      } satisfies FightingCornerQuestClaimResult;
      const text = presentFightingCornerQuestClaim(result);

      expect(text).toBe([
        "🎁 <b>Перше правило перевірено</b>",
        "",
        state === "already-completed"
          ? "Корчмар показує вже закритий запис. Нагорода та сама; ще раз видати її цей папірець не дозволяє."
          : "Корчмар ставить три галочки й відсуває нагороду подалі від ліктів Бійцівського кутка.",
        "",
        "🧼 Рожеве мило першого правила відтепер числиться інструментом. Бійцівський куток уперше занепокоївся.",
        "",
        "<i>Отримано:</i>",
        "+42 XP",
        "+91 золота",
        "",
        "Здобуто: <i>Рожеве мило першого правила</i>",
        "Здобуто: <i>Іскрокамінь ×2</i>"
      ].join("\n"));
      expect(text.match(/Іскрокамінь ×2/g)).toHaveLength(1);
    }
  );
});

function progress(overrides: Partial<ReturnType<typeof baseProgress>> = {}) {
  return { ...baseProgress(), ...overrides };
}

function baseProgress() {
  return {
    accepted: false,
    trainingCompleted: false,
    quickDuelCompleted: false,
    turnBasedDuelCompleted: false,
    completedObjectives: 0,
    requiredObjectives: 3 as const,
    readyToClaim: false,
    currentLocationId: "location.korchma.quest_table"
  };
}
