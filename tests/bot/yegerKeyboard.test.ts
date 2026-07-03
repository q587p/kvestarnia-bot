import { describe, expect, it } from "vitest";
import { makeItemDetailCallbackData } from "../../src/bot/callbacks/itemCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import {
  buildYegerBandagesKeyboard,
  buildYegerBandagePurchaseKeyboard,
  buildYegerCornerKeyboard,
  buildYegerHuntKeyboard,
  buildYegerKeyboard,
  buildYegerTurnInKeyboard
} from "../../src/bot/keyboards/yegerKeyboard";
import {
  makeYegerBandagesCallbackData,
  makeYegerBuyBandageCallbackData,
  makeYegerConfirmBandagePurchaseCallbackData,
  makeYegerFreeBandageCallbackData,
  makeYegerOutsideCallbackData,
  makeYegerQuestCallbackData,
  makeYegerTurnInCallbackData
} from "../../src/bot/callbacks/yegerCallbackData";
import type { CharacterSummary } from "../../src/domain/characters/characterSummary";

describe("Yeger keyboard", () => {
  it("opens active quest details from the base Yeger corner", () => {
    const keyboard = buildYegerCornerKeyboard({
      state: "offered",
      character,
      progress: { wins: 0, target: 5 }
    });

    expect(flatButtons(keyboard)[0]).toEqual({
      text: "🏹 Неспокійні справи",
      callback_data: makeYegerQuestCallbackData()
    });
  });

  it("turns in ready boards directly from the base Yeger corner", () => {
    const keyboard = buildYegerCornerKeyboard({
      state: "turn-in-ready",
      character,
      progress: { wins: 5, target: 5 }
    });

    expect(flatButtons(keyboard)[0]).toEqual({
      text: "🏹 Здати Єгерю",
      callback_data: makeYegerTurnInCallbackData()
    });
    expect(flatButtons(keyboard).map((button) => button.callback_data)).not.toContain(
      makeYegerQuestCallbackData()
    );
  });

  it("hides the quest detail button after the board is closed", () => {
    const keyboard = buildYegerCornerKeyboard({
      state: "completed",
      character,
      progress: { wins: 17, target: 17, stageId: "second" },
      reward: {
        xp: 56,
        gold: 170,
        itemGrants: [{ itemId: "item.yeger.first-notch", name: "Єгерська риска на дощечці", quantity: 2 }]
      }
    });

    expect(flatButtons(keyboard).map((button) => button.callback_data)).not.toContain(
      makeYegerQuestCallbackData()
    );
    expect(flatButtons(keyboard).map((button) => button.text)).toEqual([
      "🩹 Бинти",
      "📖 Бестіарій",
      "🍺 До зали"
    ]);
  });

  it("keeps paid Yeger bandages inside the bandages submenu", () => {
    const keyboard = buildYegerCornerKeyboard({
      state: "completed",
      character,
      progress: { wins: 5, target: 5 },
      reward
    });
    const bandages = buildYegerBandagesKeyboard({
      state: "completed",
      character,
      progress: { wins: 5, target: 5 },
      reward
    });

    expect(flatButtons(keyboard)).toContainEqual({
      text: "🩹 Бинти",
      callback_data: makeYegerBandagesCallbackData()
    });
    expect(flatButtons(keyboard)).not.toEqual(expect.arrayContaining([
      { text: "🩹 1 бинт", callback_data: makeYegerBuyBandageCallbackData(1) },
      { text: "🩹 5 бинтів", callback_data: makeYegerBuyBandageCallbackData(5) },
      { text: "🩹 17 бинтів", callback_data: makeYegerBuyBandageCallbackData(17) },
      { text: "🩹 93 бинти", callback_data: makeYegerBuyBandageCallbackData(93) }
    ]));
    expect(flatButtons(bandages)).toEqual(expect.arrayContaining([
      { text: "🩹 1 бинт", callback_data: makeYegerBuyBandageCallbackData(1) },
      { text: "🩹 5 бинтів", callback_data: makeYegerBuyBandageCallbackData(5) },
      { text: "🩹 17 бинтів", callback_data: makeYegerBuyBandageCallbackData(17) },
      { text: "🩹 93 бинти", callback_data: makeYegerBuyBandageCallbackData(93) }
    ]));
    expect(bandages.inline_keyboard.slice(0, 2).map((row) => row.map((button) => button.text))).toEqual([
      ["🩹 1 бинт", "🩹 5 бинтів"],
      ["🩹 17 бинтів", "🩹 93 бинти"]
    ]);
  });

  it("can label an affordable paid-bandage confirmation quantity", () => {
    const token = "123e4567-e89b-42d3-a456-426614174000";
    const keyboard = buildYegerBandagePurchaseKeyboard(token, { confirmLabel: "✅ Купити 5" });

    expect(flatButtons(keyboard)).toContainEqual({
      text: "✅ Купити 5",
      callback_data: makeYegerConfirmBandagePurchaseCallbackData(token)
    });
  });

  it("keeps bandage supplies hidden before the base Yeger board is completed", () => {
    const keyboard = buildYegerCornerKeyboard({
      state: "level-locked",
      character: {
        ...character,
        classId: "class.ranger",
        className: "Єгер",
        level: 1
      },
      requiredLevel: 4
    });
    const bandages = buildYegerBandagesKeyboard({
      state: "level-locked",
      character: {
        ...character,
        classId: "class.ranger",
        className: "Єгер",
        level: 1
      },
      requiredLevel: 4
    });

    expect(flatButtons(keyboard)).not.toContainEqual({
      text: "🏹 Неспокійні справи",
      callback_data: makeYegerQuestCallbackData()
    });
    expect(flatButtons(keyboard)).not.toContainEqual({
      text: "🩹 Бинти",
      callback_data: makeYegerBandagesCallbackData()
    });
    expect(flatButtons(keyboard)).not.toContainEqual({
      text: "🧰 Єгерський бинт",
      callback_data: makeYegerFreeBandageCallbackData()
    });
    expect(flatButtons(bandages).map((button) => button.callback_data)).not.toContain(
      makeYegerBuyBandageCallbackData(1)
    );
    expect(flatButtons(bandages)).not.toContainEqual({
      text: "🧰 Єгерський бинт",
      callback_data: makeYegerFreeBandageCallbackData()
    });
  });

  it("shows bandage supplies after the base Yeger board is completed", () => {
    const keyboard = buildYegerCornerKeyboard({
      state: "offered",
      character: {
        ...character,
        classId: "class.ranger",
        className: "Єгер"
      },
      progress: { wins: 0, target: 17, stageId: "second" },
      rangerBandage: { kind: "bandage", state: "available" }
    });
    const bandages = buildYegerBandagesKeyboard({
      state: "offered",
      character: {
        ...character,
        classId: "class.ranger",
        className: "Єгер"
      },
      progress: { wins: 0, target: 17, stageId: "second" },
      rangerBandage: { kind: "bandage", state: "available" }
    });

    expect(flatButtons(keyboard)).toContainEqual({
      text: "🏹 Неспокійні справи 2.0",
      callback_data: makeYegerQuestCallbackData()
    });
    expect(flatButtons(keyboard)).toContainEqual({
      text: "🩹 Бинти",
      callback_data: makeYegerBandagesCallbackData()
    });
    expect(flatButtons(bandages)).toContainEqual({
      text: "🧰 5 єгерських бинтів",
      callback_data: makeYegerFreeBandageCallbackData()
    });
  });

  it("shows improved ranger supplies after the second Yeger board is completed", () => {
    const bandages = buildYegerBandagesKeyboard({
      state: "completed",
      character: {
        ...character,
        classId: "class.ranger",
        className: "Єгер"
      },
      progress: { wins: 17, target: 17, stageId: "second" },
      reward,
      rangerBandage: { kind: "bandage", state: "available" },
      rangerDenseBandage: { kind: "dense-bandage", state: "available" },
      rangerFieldKit: { kind: "field-kit", state: "available" }
    });

    expect(flatButtons(bandages)).toEqual(expect.arrayContaining([
      {
        text: "🧰 5 єгерських бинтів",
        callback_data: makeYegerFreeBandageCallbackData("bandage")
      },
      {
        text: "🧵 Єгерський щільний",
        callback_data: makeYegerFreeBandageCallbackData("dense-bandage")
      },
      {
        text: "🧰 Єгерська аптечка",
        callback_data: makeYegerFreeBandageCallbackData("field-kit")
      }
    ]));
  });

  it("hides the free ranger bandage button while it is on cooldown", () => {
    const bandages = buildYegerBandagesKeyboard({
      state: "completed",
      character: {
        ...character,
        classId: "class.ranger",
        className: "Р„РіРµСЂ"
      },
      progress: { wins: 5, target: 5 },
      reward,
      rangerBandage: {
        kind: "bandage",
        state: "on-cooldown",
        nextAvailableAt: new Date("2026-06-15T11:38:00.000Z"),
        now: new Date("2026-06-15T10:05:00.000Z")
      }
    });

    expect(flatButtons(bandages).map((button) => button.callback_data)).not.toContain(
      makeYegerFreeBandageCallbackData()
    );
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
