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
    expect(text).toContain("перешліть посилання-запрошення");
    expect(text).toContain("«👀 Хто поруч» → «Кинути виклик присутнім»");
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

  it("presents the exact stored claim reward on replay", () => {
    const result = {
      state: "already-completed",
      character: {} as never,
      progress: progress({ accepted: true, completedObjectives: 3, readyToClaim: true }),
      reward: {
        xp: 11,
        gold: 37,
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

    expect(text).toContain("Нагорода та сама");
    expect(text).toContain("Рожеве мило першого правила відтепер числиться інструментом");
    expect(text).toContain("11 XP");
    expect(text).toContain("37");
    expect(text).toContain("Іскрокамінь ×2");
    expect(text.match(/Іскрокамінь ×2/g)).toHaveLength(1);
  });
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
