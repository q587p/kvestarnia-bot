import { describe, expect, it } from "vitest";
import { makeItemDetailCallbackData } from "../../src/bot/callbacks/itemCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import {
  buildYegerCornerKeyboard,
  buildYegerHuntKeyboard,
  buildYegerKeyboard,
  buildYegerTurnInKeyboard
} from "../../src/bot/keyboards/yegerKeyboard";
import {
  makeYegerBuyBandageCallbackData,
  makeYegerOutsideCallbackData,
  makeYegerQuestCallbackData
} from "../../src/bot/callbacks/yegerCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("Yeger keyboard", () => {
  it("opens the quest details from the base Yeger corner", () => {
    const keyboard = buildYegerCornerKeyboard({
      state: "completed",
      character,
      progress: { wins: 5, target: 5 },
      reward
    });

    expect(flatButtons(keyboard)[0]).toEqual({
      text: "🏹 Неспокійні справи",
      callback_data: makeYegerQuestCallbackData()
    });
  });

  it("offers paid Yeger bandages as fixed bundle quantities", () => {
    const keyboard = buildYegerCornerKeyboard({
      state: "completed",
      character,
      progress: { wins: 5, target: 5 },
      reward
    });

    expect(flatButtons(keyboard)).toEqual(expect.arrayContaining([
      { text: "🩹 1 бинт", callback_data: makeYegerBuyBandageCallbackData(1) },
      { text: "🩹 5 бинтів", callback_data: makeYegerBuyBandageCallbackData(5) },
      { text: "🩹 17 бинтів", callback_data: makeYegerBuyBandageCallbackData(17) },
      { text: "🩹 93 бинти", callback_data: makeYegerBuyBandageCallbackData(93) }
    ]));
    expect(keyboard.inline_keyboard.slice(1, 3).map((row) => row.map((button) => button.text))).toEqual([
      ["🩹 1 бинт", "🩹 5 бинтів"],
      ["🩹 17 бинтів", "🩹 93 бинти"]
    ]);
  });

  it("links the completed Yeger keepsake from the quest screen", () => {
    const keyboard = buildYegerKeyboard({
      state: "completed",
      character,
      progress: { wins: 5, target: 5 },
      reward
    });

    expect(flatButtons(keyboard)).toContainEqual({
      text: "🔎 Єгерська риска на дощечці",
      callback_data: makeItemDetailCallbackData("item.yeger.first-notch")
    });
  });

  it("links the completed Yeger keepsake after turn-in replay", () => {
    const keyboard = buildYegerTurnInKeyboard({
      state: "already-completed",
      character,
      progress: { wins: 5, target: 5 },
      reward,
      levelChange: null
    });

    expect(flatButtons(keyboard)[0]).toEqual({
      text: "🔎 Єгерська риска на дощечці",
      callback_data: makeItemDetailCallbackData("item.yeger.first-notch")
    });
  });

  it("sends active Yeger quests outside from the Yeger corner", () => {
    const keyboard = buildYegerKeyboard({
      state: "in-progress",
      character,
      progress: { wins: 1, target: 5 },
      tracking: {
        state: "tracking-ready",
        availableAt: new Date("2026-06-15T10:04:00.000Z"),
        now: new Date("2026-06-15T10:05:00.000Z")
      }
    });

    expect(flatButtons(keyboard)[0]).toEqual({
      text: "🚪 Надвір",
      callback_data: makeYegerOutsideCallbackData()
    });
    expect(flatButtons(keyboard).map((button) => button.text)).toContain("📖 Кого шукати?");
  });

  it("shows tracking state actions on the outdoor hunt surface", () => {
    const pending = buildYegerHuntKeyboard({
      state: "in-progress",
      character,
      progress: { wins: 1, target: 5 },
      tracking: {
        state: "tracking-pending",
        availableAt: new Date("2026-06-15T10:08:00.000Z"),
        now: new Date("2026-06-15T10:05:00.000Z")
      }
    });
    const ready = buildYegerHuntKeyboard({
      state: "in-progress",
      character,
      progress: { wins: 1, target: 5 },
      tracking: {
        state: "tracking-ready",
        availableAt: new Date("2026-06-15T10:04:00.000Z"),
        now: new Date("2026-06-15T10:05:00.000Z")
      }
    });

    const none = buildYegerHuntKeyboard({
      state: "in-progress",
      character,
      progress: { wins: 1, target: 5 },
      tracking: {
        state: "none"
      }
    });

    expect(flatButtons(pending)[0]?.text).toBe("⏳ Чекати слід");
    expect(flatButtons(ready)[0]?.text).toBe("🔎 Перевірити слід");
    expect(flatButtons(none)[0]?.text).toBe("👣 Взяти слід");
    expect(flatButtons(ready)[1]).toEqual({
      text: "⬅️ Надвір",
      callback_data: makePlaceCallbackData("front")
    });
  });
});

const reward = {
  xp: 80,
  gold: 120,
  itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 1 }]
};

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

function flatButtons(keyboard: {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string }>>;
}): Array<{ text: string; callback_data?: string }> {
  return keyboard.inline_keyboard.flat();
}
