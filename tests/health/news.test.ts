import { describe, expect, it } from "vitest";
import { readNewsEntries, parseNewsEntries, renderNewsMarkdown } from "../../src/health/news";

describe("public news rendering", () => {
  it("parses news entries from level-two headings newest first", () => {
    const entries = parseNewsEntries(`# Новини

## 0.0.2 — 12026-06-14 — Друга новина

Текст другої.

## 0.0.1 — 12026-06-13 — Перша новина

Текст першої.
`);

    expect(entries).toEqual([
      {
        index: 0,
        title: "0.0.2 — 12026-06-14 — Друга новина",
        body: "Текст другої."
      },
      {
        index: 1,
        title: "0.0.1 — 12026-06-13 — Перша новина",
        body: "Текст першої."
      }
    ]);
  });

  it("renders small markdown safely", () => {
    const html = renderNewsMarkdown(`Команда /hero і \`/news\`.

- <script>alert("ні")</script>
- Манатка & корчмар`);

    expect(html).toContain("<code>/hero</code>");
    expect(html).toContain("<code>/news</code>");
    expect(html).toContain("&lt;script&gt;alert(&quot;ні&quot;)&lt;/script&gt;");
    expect(html).toContain("Манатка &amp; корчмар");
    expect(html).not.toContain("<script>");
  });

  it("surfaces missing news files instead of silently returning an empty archive", () => {
    expect(() => readNewsEntries("missing-news-file.md")).toThrow();
  });
});
