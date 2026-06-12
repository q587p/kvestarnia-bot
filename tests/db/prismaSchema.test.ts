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

  it("represents persistent character inventory rows", () => {
    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

    expect(schema).toContain("model CharacterItem");
    expect(schema).toContain("items     CharacterItem[]");
    expect(schema).toContain("@map(\"character_id\")");
    expect(schema).toContain("@map(\"item_id\")");
    expect(schema).toContain("@@unique([characterId, itemId])");
    expect(schema).toContain("@@map(\"character_items\")");
  });
});
