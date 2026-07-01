import { describe, expect, it } from "vitest";
import {
  makeLoreCategoryCallbackData,
  makeLoreCategoryRandomCallbackData,
  makeLoreEntryCallbackData,
  makeLoreMenuCallbackData,
  makeLoreRandomCallbackData
} from "../../src/bot/callbacks/loreBoardCallbackData";
import { makeBestiaryListCallbackData } from "../../src/bot/callbacks/bestiaryCallbackData";
import {
  presentLoreCategory,
  presentLoreEmptyRandom,
  presentLoreEntry,
  presentLoreEntryPage,
  presentLoreMenu
} from "../../src/bot/presenters/loreBoardPresenter";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";

describe("lore board presenter", () => {
  it("renders the lore menu with every category and board return", () => {
    const page = presentLoreMenu();

    expect(page.text).toContain("📖 Перекази Квестарні");
    expect(page.text).toContain("На краю Дошки корчми висить тека");
    expect(flatInlineButtonTexts(page.keyboard)).toEqual(expect.arrayContaining([
      "🏚 Про Квестарню",
      "🪧 Місцини корчми",
      "🧝 Раси пригодників",
      "⚔️ Класи пригодників",
      "🧌 Бестіарій",
      "🎒 Манатки",
      "📜 Звичаї й чутки",
      "🎲 Випадковий переказ",
      "⬅️ До Дошки корчми"
    ]));
    expect(flatInlineButtonCallbacks(page.keyboard)).toContain(makeLoreRandomCallbackData());
    expect(flatInlineButtonCallbacks(page.keyboard)).toContain(makePlaceCallbackData("news-corner"));
  });

  it("renders category entries and category-random navigation", () => {
    const page = presentLoreCategory("races");

    expect(page.text).toContain("🧝 Раси пригодників");
    expect(page.text).toContain("Перекази:");
    expect(flatInlineButtonTexts(page.keyboard)).toContain("Людисько");
    expect(flatInlineButtonCallbacks(page.keyboard)).toContain(makeLoreEntryCallbackData("race-human-ish"));
    expect(flatInlineButtonCallbacks(page.keyboard)).toContain(makeLoreCategoryRandomCallbackData("races"));
  });

  it("renders the bestiary category as a link to the full bestiary", () => {
    const page = presentLoreCategory("bestiary");

    expect(page.text).toContain("🧌 Бестіарій");
    expect(page.text).toContain("Окремий записник:");
    expect(flatInlineButtonTexts(page.keyboard)).toContain("📖 Відкрити Бестіарій");
    expect(flatInlineButtonCallbacks(page.keyboard)).toContain(makeBestiaryListCallbackData(0, "lore"));
    expect(flatInlineButtonCallbacks(page.keyboard)).not.toContain(makeLoreCategoryRandomCallbackData("bestiary"));
  });

  it("renders missing categories as a safe fallback", () => {
    const page = presentLoreCategory("missing");

    expect(page.text).toContain("Цю теку переклали");
    expect(flatInlineButtonCallbacks(page.keyboard)).toContain(makeLoreCategoryCallbackData("kvestarnia"));
  });

  it("renders entries with escaped Telegram HTML and category position", () => {
    const page = presentLoreEntry("notice-board-current");

    expect(page.text).toContain("📖 <b>Дошка корчми</b>");
    expect(page.text).toContain("<i>Джерело: прибито кривим цвяхом біля входу.</i>");
    expect(page.text).toContain("— 🏚 Про Квестарню · 2/2");
    expect(page.text).not.toContain("<script>");
    expect(flatInlineButtonCallbacks(page.keyboard)).toEqual(expect.arrayContaining([
      makeLoreCategoryCallbackData("kvestarnia"),
      makeLoreRandomCallbackData(),
      makeLoreMenuCallbackData(),
      makePlaceCallbackData("news-corner")
    ]));
  });

  it("escapes entry title, source and body for Telegram HTML", () => {
    const page = presentLoreEntryPage({
      id: "unsafe-test",
      categoryId: "customs",
      title: "A < B",
      source: "цвях & папір",
      body: "Текст із <script> і &."
    });

    expect(page.text).toContain("A &lt; B");
    expect(page.text).toContain("цвях &amp; папір");
    expect(page.text).toContain("&lt;script&gt;");
    expect(page.text).not.toContain("A < B");
    expect(page.text).not.toContain("<script>");
  });

  it("renders missing entries and empty random selections safely", () => {
    expect(presentLoreEntry("missing-entry").text).toContain("дірка від цвяха");
    expect(presentLoreEmptyRandom().text).toContain("підозріло тихо");
  });
});

function flatInlineButtonTexts(keyboard: unknown): string[] {
  return flatInlineButtons(keyboard).map((button) => String(button.text));
}

function flatInlineButtonCallbacks(keyboard: unknown): string[] {
  return flatInlineButtons(keyboard).map((button) => String(button.callback_data));
}

function flatInlineButtons(keyboard: unknown): Array<{ text: unknown; callback_data: unknown }> {
  const inlineKeyboard = (keyboard as { inline_keyboard?: Array<Array<{ text: unknown; callback_data: unknown }>> })
    .inline_keyboard;

  return inlineKeyboard?.flat() ?? [];
}
