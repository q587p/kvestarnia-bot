import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_FACING_ADMIN_ICON_EXCEPTIONS,
  PLAYER_FACING_EXCLUSIVE_ACTION_ICONS
} from "../../src/bot/itemActionIcons";

const repositoryRoot = process.cwd();
const registryFile = "src/bot/itemActionIcons.ts";

describe("player-facing interaction safety scope", () => {
  it("keeps every registered ordinary action icon globally unique and owner-scoped", () => {
    const concepts = Object.keys(PLAYER_FACING_EXCLUSIVE_ACTION_ICONS) as Array<
      keyof typeof PLAYER_FACING_EXCLUSIVE_ACTION_ICONS
    >;
    expect(new Set(concepts.map((concept) => PLAYER_FACING_EXCLUSIVE_ACTION_ICONS[concept].icon)).size)
      .toBe(concepts.length);

    const sourceFiles = walkTypeScriptFiles(join(repositoryRoot, "src"));
    for (const concept of concepts) {
      const owner = PLAYER_FACING_EXCLUSIVE_ACTION_ICONS[concept];
      const allowed = new Set<string>([registryFile, ...owner.allowedBotFiles]);
      const violations = sourceFiles.flatMap((file) => {
        const source = readFileSync(file, "utf8");
        const path = file.slice(repositoryRoot.length + 1).replace(/\\/gu, "/");
        const usesOwnedSymbol = source.includes(owner.symbol);
        const containsRawIcon = source.includes(owner.icon) && path !== registryFile;

        return (usesOwnedSymbol && !allowed.has(path)) || containsRawIcon ? [`${concept}:${path}`] : [];
      });

      expect(violations).toEqual([]);
    }
  });

  it("allows cross-concept repeats only through named admin/dev exceptions", () => {
    for (const exception of PLAYER_FACING_ADMIN_ICON_EXCEPTIONS) {
      expect(exception.file).toMatch(/(?:admin|dev)/iu);
      expect(exception.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("pins the durable icon-ownership and irreversible-confirmation rules", () => {
    const instructions = readFileSync(join(repositoryRoot, "AGENTS.md"), "utf8");
    expect(instructions).toContain("Player-facing icons have one global semantic owner");
    expect(instructions).toContain("Cross-concept reuse is forbidden in ordinary player UI");
    expect(instructions).toContain("difficult to reverse must never mutate on its first button or command intent");
    expect(instructions).toContain("the intent and negative path must be read-only");
  });
});

function walkTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkTypeScriptFiles(path) : entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}
