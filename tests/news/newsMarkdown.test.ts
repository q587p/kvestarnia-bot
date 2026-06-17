import { describe, expect, it } from "vitest";
import { parseNewsEntries } from "../../src/news/newsMarkdown";

describe("news markdown parser", () => {
  it("parses versioned news entries from markdown", () => {
    const entries = parseNewsEntries(`# Новини Квестарні

Канал: https://t.me/kvestarnia

## 0.0.4 — 12026-06-12 — Перша пригода

Шаурма підморгнула.

## 0.1.7 — 12026-06-17 — Перший папірець знайшовся

Корчмар дістав старий журнал.

## 0.0.3 — 12026-06-12 — Рейд на бочку

Бочка сказала «буль».
`);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      index: 0,
      version: "0.0.4",
      title: "0.0.4 — 12026-06-12 — Перша пригода"
    });
    expect(entries[1]).toMatchObject({
      index: 1,
      version: "0.1.7",
      title: "0.1.7 — 12026-06-17 — Перший папірець знайшовся"
    });
    expect(entries[2]?.body).toContain("Бочка сказала");
  });
});
