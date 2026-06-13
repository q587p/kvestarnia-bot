import { describe, expect, it } from "vitest";
import {
  buildAdventureKeyboard,
  buildAdventureResultKeyboard
} from "../../src/bot/keyboards/adventureKeyboard";
import {
  buildCellarKeyboard,
  buildCellarResultKeyboard
} from "../../src/bot/keyboards/cellarKeyboard";
import { buildFightKeyboard, buildFightResultKeyboard } from "../../src/bot/keyboards/fightKeyboard";
import {
  buildMainMenuKeyboard,
  mainMenuButtons
} from "../../src/bot/keyboards/mainMenuKeyboard";
import {
  buildKorchmaFrontKeyboard,
  buildKorchmaHallKeyboard,
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
    expect(replyKeyboardTexts(keyboard.keyboard).flat()).not.toContain("👀 Озирнутися");
    expect(keyboard.resize_keyboard).toBe(true);
    expect(keyboard.is_persistent).toBe(true);
  });

  it("builds korchma place navigation", () => {
    expect(flatInlineButtonTexts(buildKorchmaFrontKeyboard())).toEqual(["🚪 Зайти в корчму"]);
    expect(flatInlineButtonTexts(buildKorchmaHallKeyboard())).toEqual([
      "📋 Стіл зі справами",
      "🛢️ Бочка",
      "📰 Дошка вістей",
      "🐭 Підвал",
      "🚪 Надвір"
    ]);
  });

  it("keeps tavern inline buttons scoped to tavern actions", () => {
    expect(flatInlineButtonTexts(buildTavernKeyboard())).toEqual([
      "🍺 У рейд на бочку",
      "👥 Учасники"
    ]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("completed"))).toEqual(["👥 Учасники"]);
    expect(flatInlineButtonTexts(buildTavernResultKeyboard("already-completed"))).toEqual([
      "👥 Учасники"
    ]);
  });

  it("keeps adventure inline buttons scoped to quest actions and participants", () => {
    const actionButtons = [
      "🌯 Тицьнути шаурму",
      "📋 Попросити чек",
      "🏃 Обережно відступити",
      "👥 Учасники"
    ];

    expect(flatInlineButtonTexts(buildAdventureKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("completed"))).toEqual([
      "👥 Учасники"
    ]);
    expect(flatInlineButtonTexts(buildAdventureResultKeyboard("already-completed"))).toEqual([
      "👥 Учасники"
    ]);
  });

  it("keeps cellar inline buttons scoped to repeatable errand actions", () => {
    const actionButtons = [
      "🧀 Поставити сирну пастку",
      "🧹 Підмести хоробро",
      "🤝 Домовитись із мишею",
      "👥 Учасники"
    ];

    expect(flatInlineButtonTexts(buildCellarKeyboard())).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("ready"))).toEqual(actionButtons);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("completed"))).toEqual([
      "👥 Учасники"
    ]);
    expect(flatInlineButtonTexts(buildCellarResultKeyboard("on-cooldown"))).toEqual([
      "👥 Учасники"
    ]);
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
