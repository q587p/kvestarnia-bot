import { describe, expect, it } from "vitest";
import {
  DEV_HELP_PAGES,
  makeDevHelpCallbackData,
  parseDevHelpCallbackData
} from "../../src/bot/callbacks/devHelpCallbackData";
import { buildDevHelpKeyboard } from "../../src/bot/keyboards/devHelpKeyboard";

describe("dev help callbacks", () => {
  it.each(DEV_HELP_PAGES)("round-trips %s", (page) => {
    const data = makeDevHelpCallbackData(page);

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
    expect(parseDevHelpCallbackData(data)).toEqual({ ok: true, value: page });
  });

  it("rejects stale, foreign and malformed callback data", () => {
    expect(parseDevHelpCallbackData("v0:dh:menu").ok).toBe(false);
    expect(parseDevHelpCallbackData("v1:help:menu").ok).toBe(false);
    expect(parseDevHelpCallbackData("v1:dh:nope").ok).toBe(false);
    expect(parseDevHelpCallbackData("v1:dh:menu:extra").ok).toBe(false);
  });

  it("shows only available section buttons and paginates them", () => {
    const visibility = {
      includeDevReset: true,
      includeDevGrant: false,
      includePartySessions: false,
      includeRaidChat: false,
      includeHpRecovery: false
    };

    expect(flatButtonTexts(buildDevHelpKeyboard(visibility))).toEqual([
      "🧰 Загальне",
      "⚔️ Бої й ватага",
      "🗺️ Справи й очікування"
    ]);
    expect(flatButtonTexts(buildDevHelpKeyboard(visibility, "combat"))).toEqual([
      "⬅️",
      "🧰 Розділи",
      "➡️"
    ]);
  });
});

function flatButtonTexts(keyboard: { inline_keyboard: Array<Array<{ text: string }>> }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}
