import { describe, expect, it } from "vitest";
import { presentNewsEntry, presentNewsIndex } from "../../src/bot/presenters/newsPresenter";
import type { NewsEntry } from "../../src/news/newsMarkdown";

const entries: NewsEntry[] = [
  makeEntry(0, "0.0.4 — 12026-06-12 — Перша пригода"),
  makeEntry(1, "0.0.3 — 12026-06-12 — Рейд на бочку"),
  makeEntry(2, "0.0.2 — 12026-06-12 — A < B")
];

describe("news presenter", () => {
  it("shows the latest news, channel link, and archive hint", () => {
    const page = presentNewsIndex(entries);

    expect(page.text).toContain("Новини Квестарні");
    expect(page.text).toContain("https://t.me/kvestarnia");
    expect(page.text).toContain("<b>0.0.4 — 12026-06-12 — Перша пригода</b>");
    expect(page.text).toContain("Попередні новини");
    expect(page.text).toContain("- <b>0.0.3 — 12026-06-12 — Рейд на бочку</b>");
    expect(page.text).toContain("Архів");
    expect(page.keyboard).toBeDefined();
    expect(flatInlineButtonTexts(page.keyboard)).toContain("⬅️ Назад");
    expect(flatInlineButtonCallbacks(page.keyboard)).toContain("v1:place:news-corner");
  });

  it("shows a selected archived entry with a back button", () => {
    const page = presentNewsEntry(entries, 1, 0);

    expect(page.text).toContain("<b>0.0.3 — 12026-06-12 — Рейд на бочку</b>");
    expect(page.text).toContain("https://t.me/kvestarnia");
    expect(page.keyboard).toBeDefined();
    expect(flatInlineButtonTexts(page.keyboard)).toContain("⬅️ Назад");
    expect(flatInlineButtonCallbacks(page.keyboard)).toContain("v1:place:news-corner");
  });

  it("returns raid-opened news back to the raid", () => {
    const index = presentNewsIndex(entries, 0, "raid");
    const entry = presentNewsEntry(entries, 1, 0, "raid");

    expect(flatInlineButtonTexts(index.keyboard)).toContain("⬅️ До рейду");
    expect(flatInlineButtonCallbacks(index.keyboard)).toContain("v1:tavern:raid");
    expect(flatInlineButtonCallbacks(index.keyboard)).toContain("v1:news:rentry:0:0");
    expect(flatInlineButtonTexts(entry.keyboard)).toContain("⬅️ До рейду");
    expect(flatInlineButtonCallbacks(entry.keyboard)).toContain("v1:tavern:raid");
    expect(flatInlineButtonCallbacks(entry.keyboard)).toContain("v1:news:rlist:0");
  });

  it("escapes selected news titles for Telegram HTML", () => {
    const page = presentNewsEntry(entries, 2, 0);

    expect(page.text).toContain("<b>0.0.2 — 12026-06-12 — A &lt; B</b>");
    expect(page.text).not.toContain("A < B");
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

function makeEntry(index: number, title: string): NewsEntry {
  return {
    index,
    title,
    body: `Тіло новини ${index}.`,
    raw: `## ${title}\n\nТіло новини ${index}.`,
    version: title.split(" ")[0] ?? title,
    contentHash: `hash-${index}`
  };
}
