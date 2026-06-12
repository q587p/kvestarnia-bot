import { describe, expect, it } from "vitest";
import { parseNewsEntries } from "../../src/news/newsMarkdown";

describe("news markdown parser", () => {
  it("parses versioned news entries from markdown", () => {
    const entries = parseNewsEntries(`# Новини Квестарні

Канал: https://t.me/kvestarnia

## 0.0.4 — 12026-06-12 — Перша пригода

Шаурма підморгнула.

## 0.0.3 — 12026-06-12 — Рейд на бочку

Бочка сказала «буль».
`);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      index: 0,
      version: "0.0.4",
      title: "0.0.4 — 12026-06-12 — Перша пригода"
    });
    expect(entries[1]?.body).toContain("Бочка сказала");
  });
});
