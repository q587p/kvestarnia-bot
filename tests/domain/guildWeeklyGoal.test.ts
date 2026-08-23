import { describe, expect, it } from "vitest";
import { getGuildWeeklyPeriod } from "../../src/domain/guildWeeklyGoal";

describe("guild weekly goal period", () => {
  it("rolls over at Kyiv Monday midnight and displays a Holocene ISO week key", () => {
    const before = getGuildWeeklyPeriod(new Date("2026-08-23T20:59:59.999Z"));
    const after = getGuildWeeklyPeriod(new Date("2026-08-23T21:00:00.000Z"));

    expect(before.key).toBe("12026-W34");
    expect(after.key).toBe("12026-W35");
    expect(after.startsAt.toISOString()).toBe("2026-08-23T21:00:00.000Z");
    expect(after.endsAt.toISOString()).toBe("2026-08-30T21:00:00.000Z");
  });

  it("uses the winter Kyiv offset without moving the local boundary", () => {
    const period = getGuildWeeklyPeriod(new Date("2026-12-27T22:00:00.000Z"));
    expect(period.key).toBe("12026-W53");
    expect(period.startsAt.toISOString()).toBe("2026-12-27T22:00:00.000Z");
  });
});
