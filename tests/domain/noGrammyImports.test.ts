import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("domain layer imports", () => {
  it("does not import grammY", () => {
    const domainFiles = listTypeScriptFiles(join(process.cwd(), "src", "domain"));

    for (const file of domainFiles) {
      expect(readFileSync(file, "utf8")).not.toMatch(/from\s+["']grammy["']/);
    }
  });

  it("does not import bot adapter modules", () => {
    const domainFiles = listTypeScriptFiles(join(process.cwd(), "src", "domain"));

    for (const file of domainFiles) {
      expect(readFileSync(file, "utf8")).not.toMatch(/from\s+["'][^"']*(?:\.\.\/)+bot\//);
    }
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }

    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}
