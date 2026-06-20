import { describe, expect, it } from "vitest";
import { getMunchkinLocationAt } from "../../src/domain/levelBarter/munchkinSchedule";

describe("Munchkin schedule", () => {
  it("keeps Munchkin at the front during Kyiv daytime", () => {
    expect(getMunchkinLocationAt(new Date("2026-06-19T17:59:00.000Z"))).toBe("front");
    expect(getMunchkinLocationAt(new Date("2026-06-20T04:00:00.000Z"))).toBe("front");
  });

  it("moves Munchkin to the Nyz descent during Kyiv night", () => {
    expect(getMunchkinLocationAt(new Date("2026-06-19T18:00:00.000Z"))).toBe("nyz-descent");
    expect(getMunchkinLocationAt(new Date("2026-06-20T03:59:00.000Z"))).toBe("nyz-descent");
  });

  it("uses Kyiv timezone rules across winter offset", () => {
    expect(getMunchkinLocationAt(new Date("2026-01-15T18:59:00.000Z"))).toBe("front");
    expect(getMunchkinLocationAt(new Date("2026-01-15T19:00:00.000Z"))).toBe("nyz-descent");
    expect(getMunchkinLocationAt(new Date("2026-01-16T04:59:00.000Z"))).toBe("nyz-descent");
    expect(getMunchkinLocationAt(new Date("2026-01-16T05:00:00.000Z"))).toBe("front");
  });
});
