import { describe, expect, it } from "vitest";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../../src/bot/callbacks/questCallbackData";
import { buildQuestOverviewKeyboard } from "../../src/bot/keyboards/questOverviewKeyboard";
import type { QuestOverviewRow } from "../../src/bot/presenters/questOverviewPresenter";

describe("quest overview keyboard", () => {
  it("keeps direct route buttons passive and adds the table/back routes", () => {
    const keyboard = buildQuestOverviewKeyboard([
      routeRow("daily", "🧾 До обходу", "v1:dkr:o:20260709"),
      routeRow("yeger", "🏹 До Єгеря", "v1:tavern:ranger"),
      routeRow("barrel", "🍺 До бочки", makePlaceCallbackData("barrel"))
    ]);

    expect(buttonRows(keyboard)).toEqual([
      ["🧾 До обходу"],
      ["🏹 До Єгеря"],
      ["🍺 До бочки"],
      ["📋 До Столу зі справами"],
      ["↩️ Назад"]
    ]);
    expect(callbacks(keyboard)).toEqual([
      "v1:dkr:o:20260709",
      "v1:tavern:ranger",
      makePlaceCallbackData("barrel"),
      makeQuestCallbackData("list"),
      makePlaceCallbackData("hall")
    ]);
    expect(callbacks(keyboard)).not.toContain(makeQuestCallbackData("barrel-tutorial"));
    expect(callbacks(keyboard)).not.toContain(makeQuestCallbackData("barrel-tutorial-turn-in"));
    for (const callback of callbacks(keyboard)) {
      expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
  });

  it("does not duplicate the Quest Table route when a row already uses it", () => {
    const keyboard = buildQuestOverviewKeyboard([
      routeRow("starter", "📋 До Столу зі справами", makeQuestCallbackData("list"))
    ]);

    expect(buttonRows(keyboard)).toEqual([
      ["📋 До Столу зі справами"],
      ["↩️ Назад"]
    ]);
  });
});

function routeRow(id: string, label: string, callbackData: string): QuestOverviewRow {
  return {
    id,
    priority: "available",
    title: "Тест",
    body: "Тест",
    route: { label, callbackData }
  };
}

function buttonRows(keyboard: { inline_keyboard: { text: string }[][] }): string[][] {
  return keyboard.inline_keyboard.map((row) => row.map((button) => button.text));
}

function callbacks(keyboard: { inline_keyboard: { callback_data?: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.callback_data ?? "");
}
