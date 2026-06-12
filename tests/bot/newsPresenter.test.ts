import { describe, expect, it } from "vitest";
import { presentNewsEntry, presentNewsIndex } from "../../src/bot/presenters/newsPresenter";
import type { NewsEntry } from "../../src/news/newsMarkdown";

const entries: NewsEntry[] = [
  makeEntry(0, "0.0.4 — 12026-06-12 — Перша пригода"),
  makeEntry(1, "0.0.3 — 12026-06-12 — Рейд на бочку")
];

describe("news presenter", () => {
  it("shows the latest news, channel link, and archive hint", () => {
    const page = presentNewsIndex(entries);

    expect(page.text).toContain("Новини Квестарні");
    expect(page.text).toContain("https://t.me/kvestarnia");
    expect(page.text).toContain("0.0.4 — 12026-06-12 — Перша пригода");
    expect(page.text).toContain("Попередні новини");
    expect(page.text).toContain("Архів");
    expect(page.keyboard).toBeDefined();
  });

  it("shows a selected archived entry with a back button", () => {
    const page = presentNewsEntry(entries, 1, 0);

    expect(page.text).toContain("0.0.3 — 12026-06-12 — Рейд на бочку");
    expect(page.text).toContain("https://t.me/kvestarnia");
    expect(page.keyboard).toBeDefined();
  });
});

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
