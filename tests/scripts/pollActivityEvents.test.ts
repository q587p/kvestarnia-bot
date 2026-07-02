import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { formatCliError, getEmptyEventsHint } from "../../scripts/poll-activity-events";

describe("poll activity events script", () => {
  it("prints exact migration commands when ActivityEvent is missing", () => {
    const error = new Prisma.PrismaClientKnownRequestError("missing table", {
      code: "P2021",
      clientVersion: "test"
    });

    expect(formatCliError(error)).toContain("npm run db:deploy");
    expect(formatCliError(error)).toContain("npm run db:migrate");
    expect(formatCliError(error)).toContain("npm run maintenance:poll-activity-events");
  });

  it("explains that existing characters need ActivityEvent backfill when the feed ledger is empty", () => {
    expect(getEmptyEventsHint({ filter: "all", page: 0 })).toEqual([
      "- existing characters/items are not read directly by this script; it only reads ActivityEvent rows",
      "- to preview reconstructable historical rows, run: npm run maintenance:backfill-activity-events",
      "- to write those rows into the current DATABASE_URL, run: npm run maintenance:backfill-activity-events -- --apply"
    ]);
  });
});
