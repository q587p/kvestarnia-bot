import { existsSync, readdirSync, readFileSync } from "node:fs";
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
        const permittedException = PLAYER_FACING_ADMIN_ICON_EXCEPTIONS.some(
          (exception) => exception.icon === owner.icon && exception.file === path
        );

        return ((usesOwnedSymbol && !allowed.has(path)) || containsRawIcon) && !permittedException
          ? [`${concept}:${path}`]
          : [];
      });

      expect(violations).toEqual([]);
    }
  });

  it("allows cross-concept repeats only through named admin/dev exceptions", () => {
    for (const exception of PLAYER_FACING_ADMIN_ICON_EXCEPTIONS) {
      const owner = Object.values(PLAYER_FACING_EXCLUSIVE_ACTION_ICONS).find(
        (candidate) => candidate.icon === exception.icon
      );
      expect(owner).toBeDefined();
      expect(exception.file).toMatch(/(?:admin|dev)/iu);
      expect(exception.reason.trim().length).toBeGreaterThan(0);
      const absolutePath = join(repositoryRoot, exception.file);
      expect(existsSync(absolutePath)).toBe(true);
      const source = readFileSync(absolutePath, "utf8");
      expect(source.includes(exception.icon) || Boolean(owner && source.includes(owner.symbol))).toBe(true);
    }
  });

  it("actually applies a named admin/dev exception while preserving other violations", () => {
    const violations = collectRegisteredIconViolations(
      { "src/bot/admin/example.ts": "const button = '♻️';", "src/bot/plain.ts": "const button = '♻️';" },
      [{ icon: "♻️", file: "src/bot/admin/example.ts", reason: "Named test exception." }]
    );
    expect(violations).toEqual(["friendly-chest:src/bot/plain.ts"]);
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

function collectRegisteredIconViolations(
  files: Readonly<Record<string, string>>,
  exceptions: ReadonlyArray<{ icon: string; file: string; reason: string }>
): string[] {
  return Object.entries(PLAYER_FACING_EXCLUSIVE_ACTION_ICONS).flatMap(([concept, owner]) =>
    Object.entries(files).flatMap(([path, source]) => {
      const allowed = path === registryFile || owner.allowedBotFiles.some((file) => file === path);
      const permitted = exceptions.some((exception) => exception.icon === owner.icon && exception.file === path);
      const violates = (source.includes(owner.symbol) && !allowed) || (source.includes(owner.icon) && path !== registryFile);
      return violates && !permitted ? [`${concept}:${path}`] : [];
    })
  );
}
