import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireModule = createRequire(__filename);
const localBotRuntime = requireModule("../../scripts/local-bot-runtime.cjs") as {
  getRestartDelay(this: void, restartNumber: number): number;
  managedPathIdentity(this: void, candidatePath: string, platform?: NodeJS.Platform): string;
  pathsReferToSameLocation(
    this: void,
    leftPath: string,
    rightPath: string,
    platform?: NodeJS.Platform
  ): boolean;
  resolveRuntimeStatus(
    this: void,
    metadata: { managerVersion?: number; state?: string; botPid?: number | null } | null,
    processAlive?: (processId: number) => boolean
  ): string;
  shouldSkipSourceEntry(this: void, relativePath: string): boolean;
};

describe("local bot runtime path identity", () => {
  it("treats Windows source-root casing as the same managed runtime", () => {
    expect(localBotRuntime.pathsReferToSameLocation(
      "D:\\587\\kvestarnia-bot",
      "d:\\587\\kvestarnia-bot",
      "win32"
    )).toBe(true);
    expect(localBotRuntime.managedPathIdentity("D:\\587\\kvestarnia-bot", "win32"))
      .toBe(localBotRuntime.managedPathIdentity("d:\\587\\kvestarnia-bot", "win32"));
  });

  it("keeps case-sensitive path identity on non-Windows platforms", () => {
    expect(localBotRuntime.pathsReferToSameLocation("/srv/Kvestarnia", "/srv/kvestarnia", "linux"))
      .toBe(false);
  });
});

describe("local bot runtime supervision", () => {
  it("excludes Codex working trees from the runtime snapshot", () => {
    expect(localBotRuntime.shouldSkipSourceEntry(".cache/typescript/source.tsbuildinfo")).toBe(true);
    expect(localBotRuntime.shouldSkipSourceEntry(".codex_tmp/review/result.json")).toBe(true);
    expect(localBotRuntime.shouldSkipSourceEntry(".codex-remote-attachments/prompt.txt")).toBe(true);
    expect(localBotRuntime.shouldSkipSourceEntry("src/bot.ts")).toBe(false);
  });

  it("reports a missing bot child instead of a false running state", () => {
    const metadata = { managerVersion: 2, state: "running", botPid: 42 };

    expect(localBotRuntime.resolveRuntimeStatus(metadata, () => false))
      .toBe("degraded (bot process is missing)");
    expect(localBotRuntime.resolveRuntimeStatus(metadata, () => true)).toBe("running");
    expect(localBotRuntime.resolveRuntimeStatus(null, () => true)).toBe("not running");
    expect(localBotRuntime.resolveRuntimeStatus(
      { managerVersion: 1, state: "running", botPid: 42 },
      () => true
    )).toBe("legacy supervision (bot liveness is unverified; refresh required)");
  });

  it("uses bounded restart backoff", () => {
    expect([1, 2, 3, 4].map(localBotRuntime.getRestartDelay)).toEqual([1_000, 3_000, 5_000, 5_000]);
  });
});
