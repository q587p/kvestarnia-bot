import { describe, expect, it } from "vitest";
import { makeHelpCallbackData } from "../../src/bot/callbacks/helpCallbackData";
import { buildHelpKeyboard } from "../../src/bot/keyboards/helpKeyboard";

describe("help keyboard", () => {
  it("opens five focused sections from the menu", () => {
    const keyboard = buildHelpKeyboard();

    expect(buttonTexts(keyboard)).toEqual([
      "👤 Персонаж",
      "⚔️ Пригоди й бої",
      "🎒 Манатки",
      "🍺 Корчма й люди",
      "📰 Довідки й вісті"
    ]);
    expect(buttonCallbacks(keyboard)).toEqual([
      makeHelpCallbackData("hero"),
      makeHelpCallbackData("adventures"),
      makeHelpCallbackData("items"),
      makeHelpCallbackData("korchma"),
      makeHelpCallbackData("news")
    ]);
  });

  it("paginates between adjacent sections and returns to the menu", () => {
    expect(buttonCallbacks(buildHelpKeyboard("adventures"))).toEqual([
      makeHelpCallbackData("hero"),
      makeHelpCallbackData("menu"),
      makeHelpCallbackData("items")
    ]);
    expect(buttonCallbacks(buildHelpKeyboard("hero"))).toEqual([
      makeHelpCallbackData("menu"),
      makeHelpCallbackData("adventures")
    ]);
    expect(buttonCallbacks(buildHelpKeyboard("news"))).toEqual([
      makeHelpCallbackData("korchma"),
      makeHelpCallbackData("menu")
    ]);
  });
});

function buttonTexts(keyboard: { inline_keyboard: Array<Array<{ text: string }>> }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

function buttonCallbacks(
  keyboard: { inline_keyboard: Array<Array<{ callback_data?: string }>> }
): string[] {
  return keyboard.inline_keyboard.flat().flatMap((button) =>
    button.callback_data ? [button.callback_data] : []
  );
}
