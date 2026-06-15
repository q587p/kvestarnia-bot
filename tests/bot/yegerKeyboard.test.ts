import { describe, expect, it } from "vitest";
import { makeItemDetailCallbackData } from "../../src/bot/callbacks/itemCallbackData";
import {
  buildYegerCornerKeyboard,
  buildYegerKeyboard,
  buildYegerTurnInKeyboard
} from "../../src/bot/keyboards/yegerKeyboard";
import { makeYegerQuestCallbackData } from "../../src/bot/callbacks/yegerCallbackData";
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
