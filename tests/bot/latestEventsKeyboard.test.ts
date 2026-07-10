import { describe, expect, it } from "vitest";
import { makeLatestEventsListCallbackData } from "../../src/bot/callbacks/latestEventsCallbackData";
import { buildLatestEventsKeyboard } from "../../src/bot/keyboards/latestEventsKeyboard";

describe("latest events keyboard", () => {
  it("marks the selected filter", () => {
    const important = buttonTexts(buildLatestEventsKeyboard({
      filter: "imp",
      page: 0,
      hasNextPage: false
    }));
    const manatky = buttonTexts(buildLatestEventsKeyboard({
      filter: "itm",
      page: 0,
      hasNextPage: false
    }));

    expect(important).toContain("🔘 ⭐ Важливе");
    expect(important).toContain("👥 Пригодники");
    expect(important).not.toContain("🔘 👥 Пригодники");
    expect(important).not.toContain("✅ ⭐ Важливе");
    expect(manatky).toContain("🔘 🎒 Манатки");
    expect(manatky).not.toContain("✅ 🎒 Манатки");
    expect(manatky).toContain("⭐ Важливе");
  });

  it("keeps pagination on the selected filter", () => {
    const keyboard = buildLatestEventsKeyboard({
      filter: "cmb",
      page: 1,
      hasNextPage: true
    });

    expect(buttonCallbacks(keyboard)).toContain(makeLatestEventsListCallbackData("cmb", 0));
    expect(buttonCallbacks(keyboard)).toContain(makeLatestEventsListCallbackData("cmb", 2));
  });
});

function buttonTexts(keyboard: { inline_keyboard: Array<Array<{ text: string }>> } | undefined): string[] {
  return keyboard?.inline_keyboard.flat().map((button) => button.text) ?? [];
}

function buttonCallbacks(
  keyboard: { inline_keyboard: Array<Array<{ callback_data?: string }>> } | undefined
): string[] {
  return keyboard?.inline_keyboard.flat().flatMap((button) =>
    button.callback_data ? [button.callback_data] : []
  ) ?? [];
}
