import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVITY_EVENT_BACKFILL_BATCH_SIZE,
  formatCliError,
  formatDryRunApplyHint
} from "../../scripts/backfill-activity-events";

describe("backfill activity events script", () => {
  it("prints the npm argument separator for apply after a dry run", () => {
    expect(formatDryRunApplyHint()).toEqual([
      "Dry run only: no rows were written.",
      "To write planned rows through npm, run: npm run maintenance:backfill-activity-events -- --apply",
      "Note the npm argument separator: -- --apply"
    ]);
  });

  it("keeps dry-run scope arguments in the apply command", () => {
    expect(formatDryRunApplyHint(["--days=30"])).toContain(
      "To write planned rows through npm, run: npm run maintenance:backfill-activity-events -- --days=30 --apply"
    );
  });

  it("keeps the explicit batch size in the apply command", () => {
    expect(DEFAULT_ACTIVITY_EVENT_BACKFILL_BATCH_SIZE).toBe(93);
    expect(formatDryRunApplyHint(["--days=30", "--batch-size=13"])).toContain(
      "To write planned rows through npm, run: npm run maintenance:backfill-activity-events -- --days=30 --batch-size=13 --apply"
    );
  });

  it("prints exact migration commands when an expected table is missing", () => {
    const error = new Prisma.PrismaClientKnownRequestError("missing table", {
      code: "P2021",
      clientVersion: "test"
    });

    expect(formatCliError(error)).toContain("npm run db:deploy");
    expect(formatCliError(error)).toContain("npm run db:migrate");
  });
});
