import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
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

  it("keeps Nyz descent casing in prose", () => {
    const news = readFileSync(join(process.cwd(), "news.md"), "utf8");

    expect(news).not.toMatch(/(?:до|на|у|в|біля|з|зі)\s+Спуск[ау]?\s+до\s+Низу/u);
  });

  it("keeps public news aligned with Ukrainian guild spelling and no Mini App promise", () => {
    const news = readFileSync(join(process.cwd(), "news.md"), "utf8");

    expect(news).not.toMatch(/гільді\p{L}*/iu);
    expect(news).not.toMatch(/(?:mini\s*app|міні-?ап\p{L}*)/iu);
  });

  it("keeps the latest release news in the established lead, list and closing shape", () => {
    const news = readFileSync(join(process.cwd(), "news.md"), "utf8");
    const latest = parseNewsEntries(news)[0];
    const body = latest?.body.replace(/\r\n/g, "\n");

    expect(body).toBeDefined();
    const lines = body?.split("\n") ?? [];
    expect(lines[0]).toMatch(/^\S[^\n]*$/u);
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("У грі вже:");

    let cursor = 3;
    while (lines[cursor]?.startsWith("- ")) {
      cursor += 1;
    }

    expect(cursor).toBeGreaterThan(3);
    expect(lines[cursor]).toBe("");
    const tail = lines.slice(cursor + 1);
    expect(tail[0]).toMatch(/^\S[^\n]*$/u);
    expect(tail[0]).not.toMatch(/^Ще не відчинено:/u);
    expect([1, 3]).toContain(tail.length);
    if (tail.length === 3) {
      expect(tail[1]).toBe("");
      expect(tail[2]).toMatch(/^Ще не відчинено: \S[^\n]*$/u);
    }

    const version = latest?.title.match(/^(\d+\.\d+\.\d+)\b/u)?.[1];
    expect(version).toBeDefined();
    expect(body).not.toContain(version);
    expect(body).not.toMatch(
      /(?:\bQA\b|\bCI\b|ручн\p{L}*\s+перевір|Telegram-перевір|цільов\p{L}*\s+(?:Квестарн|середовищ|бот)|збірк\p{L}*|пакет\p{L}*|депло\p{L}*|deploy|розгортан\p{L}*|rollout|feature.?flag|production|продакш\p{L}*|мердж\p{L}*|merge|готов\p{L}*\s+до\s+реліз)/iu
    );
  });

  it("keeps latest release dates aligned across changelog and news", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    ) as { version: string };
    const changelog = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");
    const news = readFileSync(join(process.cwd(), "news.md"), "utf8");

    const changelogHeading = changelog.match(
      /^## \[(?<version>\d+\.\d+\.\d+)\] - (?<date>1\d{4}-\d{2}-\d{2}) - /m
    )?.groups;
    const newsHeading = news.match(
      /^## (?<version>\d+\.\d+\.\d+) — (?<date>1\d{4}-\d{2}-\d{2}) — /m
    )?.groups;

    expect(changelogHeading).toEqual(
      expect.objectContaining({ version: packageJson.version })
    );
    expect(newsHeading).toEqual(expect.objectContaining({ version: packageJson.version }));
    expect(newsHeading?.date).toBe(changelogHeading?.date);
  });

  it("does not date the latest release after the current Kyiv day of the commit", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    ) as { version: string };
    const changelog = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");
    const news = readFileSync(join(process.cwd(), "news.md"), "utf8");

    const changelogHeading = changelog.match(
      /^## \[(?<version>\d+\.\d+\.\d+)\] - (?<date>1\d{4}-\d{2}-\d{2}) - /m
    )?.groups;
    const newsHeading = news.match(
      /^## (?<version>\d+\.\d+\.\d+) — (?<date>1\d{4}-\d{2}-\d{2}) — /m
    )?.groups;
    const headCommitDate = execFileSync("git", ["show", "-s", "--format=%cI", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8"
    }).trim();
    const expectedDate = toKyivHoloceneDate(new Date(headCommitDate));

    expect(changelogHeading).toEqual(expect.objectContaining({ version: packageJson.version }));
    expect(newsHeading).toEqual(expect.objectContaining({ version: packageJson.version }));
    expect(changelogHeading?.date <= expectedDate).toBe(true);
    expect(newsHeading?.date <= expectedDate).toBe(true);
  });
});

function toKyivHoloceneDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year + 10000}-${month}-${day}`;
}
