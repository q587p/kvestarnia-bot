import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { formatCliError } from "../../scripts/poll-activity-events";

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
});
