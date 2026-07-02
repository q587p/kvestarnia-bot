import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("maintenance package scripts", () => {
  it("runs activity event maintenance through transpile-only ts-node", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts["maintenance:backfill-activity-events"]).toBe(
      "node -r ts-node/register/transpile-only scripts/backfill-activity-events.ts"
    );
    expect(packageJson.scripts["maintenance:poll-activity-events"]).toBe(
      "node -r ts-node/register/transpile-only scripts/poll-activity-events.ts"
    );
  });
});
