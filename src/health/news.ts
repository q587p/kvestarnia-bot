import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface NewsEntry {
  index: number;
  title: string;
  body: string;
}

export function readNewsEntries(filePath = resolve(process.cwd(), "news.md")): NewsEntry[] {
  try {
    return parseNewsEntries(readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

export function parseNewsEntries(markdown: string): NewsEntry[] {
  const entries: Array<Omit<NewsEntry, "index">> = [];
  let current: Omit<NewsEntry, "index"> | null = null;

  for (const line of normalizeNewlines(markdown).split("\n")) {
    const heading = line.match(/^##\s+(.+)$/);

    if (heading) {
      if (current) {
        entries.push(trimEntry(current));
      }

      current = {
        title: heading[1]?.trim() ?? "",
        body: ""
      };
      continue;
    }

    if (current) {
      current.body += `${line}\n`;
    }
  }

  if (current) {
    entries.push(trimEntry(current));
  }

  return entries.map((entry, index) => ({
    ...entry,
    index
  }));
}

export function renderNewsEntry(entry: NewsEntry, headingLevel: 1 | 2 = 2): string {
  const headingTag = headingLevel === 1 ? "h1" : "h2";

  return `<article class="news-entry">
  <${headingTag}>${escapeHtml(entry.title)}</${headingTag}>
  ${renderNewsMarkdown(entry.body)}
</article>`;
}

export function renderNewsMarkdown(markdown: string): string {
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  function flushParagraph(): void {
    if (paragraph.length === 0) {
      return;
    }

    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList(): void {
    if (list.length === 0) {
      return;
    }

    html.push(`<ul>${list.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
    list = [];
  }

  for (const line of normalizeNewlines(markdown).split("\n")) {
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      list.push(line.slice(2).trim());
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return html.join("\n");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(value: string): string {
  const parts: string[] = [];
  const pattern = /`([^`]+)`|\/[A-Za-z][A-Za-z0-9_-]*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const token = match[0];
    const before = value[match.index - 1];

    if (token.startsWith("/") && before && /[A-Za-z0-9_:/.<]/.test(before)) {
      continue;
    }

    parts.push(escapeHtml(value.slice(lastIndex, match.index)));
    parts.push(`<code>${escapeHtml(match[1] ?? token)}</code>`);
    lastIndex = match.index + token.length;
  }

  parts.push(escapeHtml(value.slice(lastIndex)));
  return parts.join("");
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimEntry(entry: Omit<NewsEntry, "index">): Omit<NewsEntry, "index"> {
  return {
    title: entry.title,
    body: entry.body.trim()
  };
}
