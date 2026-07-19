import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireModule = createRequire(__filename);
const localBotRuntime = requireModule("../../scripts/local-bot-runtime.cjs") as {
  managedPathIdentity(this: void, candidatePath: string, platform?: NodeJS.Platform): string;
  pathsReferToSameLocation(
    this: void,
    leftPath: string,
    rightPath: string,
    platform?: NodeJS.Platform
  ): boolean;
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
