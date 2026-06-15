import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const migrateDeployModule = require("../../scripts/prisma-migrate-deploy.cjs") as {
  determineRepairMode: (input: {
    failedMigration: boolean;
    columns: Set<string>;
  }) => { type: string; missingColumns?: string[] } | null;
};
const { determineRepairMode } = migrateDeployModule;

describe("prisma migrate deploy wrapper", () => {
  it("chooses applied when both regen columns already exist", () => {
    expect(
      determineRepairMode({
        failedMigration: true,
        columns: new Set(["hp_regen_at", "mana_regen_at"])
      })
    ).toEqual({ type: "mark-applied" });
  });

  it("chooses a partial repair when only one regen column exists", () => {
    expect(
      determineRepairMode({
        failedMigration: true,
        columns: new Set(["hp_regen_at"])
      })
    ).toEqual({
      type: "complete-partial",
      missingColumns: ["mana_regen_at"]
    });
  });

  it("chooses rolled-back when the failed migration still needs to be re-applied", () => {
    expect(
      determineRepairMode({
        failedMigration: true,
        columns: new Set()
      })
    ).toEqual({ type: "retry-migration" });
  });

  it("skips repair when there is no failed migration record", () => {
    expect(
      determineRepairMode({
        failedMigration: false,
        columns: new Set(["hp_regen_at", "mana_regen_at"])
      })
    ).toBeNull();
  });
});
