import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Prisma schema", () => {
  it("represents DailyAction uniqueness for once-per-day rewards", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

    expect(schema).toContain("model DailyAction");
    expect(schema).toContain("@@unique([characterId, key, localDate])");
    expect(schema).toContain("@map(\"local_date\")");
    expect(schema).toContain("@map(\"reward_xp\")");
    expect(schema).toContain("@map(\"reward_gold\")");
  });
});
