import { describe, expect, it } from "vitest";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { buildQuestOverviewKeyboard } from "../../src/bot/keyboards/questOverviewKeyboard";

describe("quest overview keyboard", () => {
  it("keeps only safe navigation buttons", () => {
    const keyboard = buildQuestOverviewKeyboard();

    expect(buttonRows(keyboard)).toEqual([
      ["📋 До Столу зі справами"]
    ]);
    expect(callbacks(keyboard)).toEqual([
      makePlaceCallbackData("quest-table")
    ]);
    expect(buttonRows(keyboard).flat()).not.toEqual(expect.arrayContaining([
      "🧾 До обходу",
      "📋 До Трьох справ",
      "🧾 До Корчмаря",
      "🪜 До Низу",
      "🏹 До Єгеря",
      "🐭 До льоху",
      "🍺 До бочки",
      "🍻 До шинку",
      "✨ До задвірка"
    ]));
    expect(callbacks(keyboard)).not.toContain("v1:dkr:o:20260709");
    expect(callbacks(keyboard)).not.toContain("v1:tavern:ranger");
    expect(callbacks(keyboard)).not.toContain(makePlaceCallbackData("bar"));
    expect(callbacks(keyboard)).not.toContain(makePlaceCallbackData("barrel"));
    expect(callbacks(keyboard)).not.toContain(makePlaceCallbackData("deep"));
    expect(callbacks(keyboard)).not.toContain(makePlaceCallbackData("yard"));
    expect(callbacks(keyboard)).not.toContain(makeQuestCallbackData("overview"));
    expect(callbacks(keyboard)).not.toContain(makeQuestCallbackData("barrel-tutorial"));
    expect(callbacks(keyboard)).not.toContain(makeQuestCallbackData("barrel-tutorial-turn-in"));
    for (const callback of callbacks(keyboard)) {
      expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
  });

  it("uses the same safe buttons even when no rows are visible", () => {
    const keyboard = buildQuestOverviewKeyboard();

    expect(buttonRows(keyboard)).toEqual([
      ["📋 До Столу зі справами"]
    ]);
  });
});

function buttonRows(keyboard: { inline_keyboard: { text: string }[][] }): string[][] {
  return keyboard.inline_keyboard.map((row) => row.map((button) => button.text));
}

function callbacks(keyboard: { inline_keyboard: { callback_data?: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.callback_data ?? "");
}
