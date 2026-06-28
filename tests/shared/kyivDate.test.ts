import { describe, expect, it } from "vitest";
import { getKyivDayKey, getKyivDayToken } from "../../src/shared/kyivDate";

describe("Kyiv day helper", () => {
  it.each([
    ["winter", "2026-01-15T21:59:59.000Z", "2026-01-15", "20260115"],
    ["winter rollover", "2026-01-15T22:00:00.000Z", "2026-01-16", "20260116"],
    ["summer", "2026-06-28T20:59:59.000Z", "2026-06-28", "20260628"],
    ["summer rollover", "2026-06-28T21:00:00.000Z", "2026-06-29", "20260629"],
    ["spring DST before rollover", "2026-03-28T21:59:59.000Z", "2026-03-28", "20260328"],
    ["spring DST after rollover", "2026-03-28T22:00:00.000Z", "2026-03-29", "20260329"],
    ["autumn DST before rollover", "2026-10-24T20:59:59.000Z", "2026-10-24", "20261024"],
    ["autumn DST after rollover", "2026-10-24T21:00:00.000Z", "2026-10-25", "20261025"]
  ])("formats %s by Europe/Kyiv local day", (_name, iso, key, token) => {
    const date = new Date(iso);

    expect(getKyivDayKey(date)).toBe(key);
    expect(getKyivDayToken(date)).toBe(token);
  });
});
