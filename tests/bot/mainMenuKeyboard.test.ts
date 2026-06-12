import { describe, expect, it } from "vitest";
import { buildAdventureKeyboard } from "../../src/bot/keyboards/adventureKeyboard";
import { buildFightKeyboard } from "../../src/bot/keyboards/fightKeyboard";
import {
  buildMainMenuKeyboard,
  mainMenuButtons
} from "../../src/bot/keyboards/mainMenuKeyboard";
import { buildTavernKeyboard } from "../../src/bot/keyboards/tavernKeyboard";

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
  });

  it("keeps adventure inline buttons scoped to quest actions", () => {
    expect(flatInlineButtonTexts(buildAdventureKeyboard())).toEqual([
      "🌯 Тицьнути шаурму",
      "📋 Попросити чек",
      "🏃 Обережно відступити"
    ]);
  });

  it("keeps fight inline buttons scoped to fight actions", () => {
    expect(flatInlineButtonTexts(buildFightKeyboard())).toEqual([
      "🗡️ Вдарити",
      "📋 Збити з пантелику чеком",
      "🏃 Відступити красиво"
    ]);
  });
});

function flatInlineButtonTexts(keyboard: { inline_keyboard: { text: string }[][] }): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.text);
}

function replyKeyboardTexts(keyboard: unknown): string[][] {
  const rows = keyboard as Array<Array<{ text: string }>>;

  return rows.map((row) => row.map((button) => button.text));
}
