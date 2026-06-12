import { describe, expect, it } from "vitest";
import {
  buildAdventureKeyboard,
  buildAdventureResultKeyboard
} from "../../src/bot/keyboards/adventureKeyboard";
import { buildFightKeyboard, buildFightResultKeyboard } from "../../src/bot/keyboards/fightKeyboard";
import {
  buildMainMenuKeyboard,
  mainMenuButtons
} from "../../src/bot/keyboards/mainMenuKeyboard";
import {
  buildTavernKeyboard,
  buildTavernResultKeyboard
} from "../../src/bot/keyboards/tavernKeyboard";

describe("main menu and scene keyboards", () => {
  it("builds the universal menu as a persistent reply keyboard", () => {
    const keyboard = buildMainMenuKeyboard();

    expect(replyKeyboardTexts(keyboard.keyboard)).toEqual([
      [mainMenuButtons.hero, mainMenuButtons.tavern],
      [mainMenuButtons.quest, mainMenuButtons.inventory],
      [mainMenuButtons.guild, mainMenuButtons.help]
    ]);
    expect(keyboard.resize_keyboard).toBe(true);
    expect(keyboard.is_persistent).toBe(true);
  });

  it("keeps tavern inline buttons scoped to tavern actions", () => {
    expect(flatInlineButtonTexts(buildTavernKeyboard())).toEqual(["🍺 У рейд на бочку"]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("completed"))).toEqual([
      "🍺 У рейд на бочку"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("already-completed"))).toEqual([]);
  });

  it("keeps adventure inline buttons scoped to quest actions", () => {
    const actionButtons = [
      "🌯 Тицьнути шаурму",
      "📋 Попросити чек",
      "🏃 Обережно відступити"
    ];

    expect(flatInlineButtonTexts(buildAdventureKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("completed"))).toEqual(
      actionButtons
    );
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("already-completed"))).toEqual([]);
  });

  it("keeps fight inline buttons scoped to fight actions", () => {
    const actionButtons = [
      "🗡️ Вдарити",
      "📋 Збити з пантелику чеком",
      "🏃 Відступити красиво"
    ];

    expect(flatInlineButtonTexts(buildFightKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("completed"))).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildFightResultKeyboard("already-completed"))).toEqual([]);
  });
});

function flatInlineButtonTexts(keyboard: { inline_keyboard: { text: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

function replyKeyboardTexts(keyboard: unknown): string[][] {
  const rows = keyboard as Array<Array<{ text: string }>>;

  return rows.map((row) => row.map((button) => button.text));
}
