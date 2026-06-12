import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join, resolve } from "path";

export interface NewsEntry {
  index: number;
  title: string;
  body: string;
  raw: string;
  version: string;
  contentHash: string;
}

export function parseNewsEntries(markdown: string): NewsEntry[] {
  return markdown
    .split(/\n(?=##\s+)/)
    .map((section) => section.trim())
    .filter((section) => section.startsWith("## "))
    .map((section, index) => {
      const [heading = "", ...bodyLines] = section.split("\n");
      const title = heading.replace(/^##\s+/, "").trim() || "Новини Квестарні";

      return {
        index,
        title,
        body: bodyLines.join("\n").trim(),
        raw: section,
        version: title.match(/\b\d+\.\d+\.\d+\b/)?.[0] ?? title.slice(0, 24),
        contentHash: createHash("sha256").update(section, "utf8").digest("hex")
      };
    });
}

export async function readNewsEntries(filePath = join(process.cwd(), "news.md")): Promise<NewsEntry[]> {
  const raw = await readFile(resolve(filePath), "utf8");
  return parseNewsEntries(raw);
}
