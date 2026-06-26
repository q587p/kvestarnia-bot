import { describe, expect, it } from "vitest";
import {
  BARD_PERFORMANCE_COOLDOWN_MINUTES,
  BARD_PERFORMANCE_DAILY_HOUSE_CAP_GOLD,
  BARD_PERFORMANCE_TIP_OPTIONS,
  BARD_PERFORMANCE_WINDOW_MINUTES,
  applyBardPerformanceDailyHouseCap,
  buildBardPerformancePlan,
  isBardPerformanceTipAmount
} from "../../src/domain/noncombat/bardPerformance";

describe("bardPerformance domain", () => {
  it("resolves deterministic grades and payouts from frozen check inputs", () => {
    expect(buildBardPerformancePlan({ charisma: 6, luck: 3, level: 3, roll: -2 })).toMatchObject({
      grade: "rough",
      power: 16,
      rawHousePayoutGold: 1,
      roleActionXp: 0
    });
    expect(buildBardPerformancePlan({ charisma: 9, luck: 4, level: 4, roll: 0 })).toMatchObject({
      grade: "pleasant",
      power: 26,
      rawHousePayoutGold: 3
    });
    expect(buildBardPerformancePlan({ charisma: 12, luck: 6, level: 5, roll: 1 })).toMatchObject({
      grade: "memorable",
      power: 36,
      rawHousePayoutGold: 5
    });
    expect(buildBardPerformancePlan({ charisma: 15, luck: 8, level: 7, roll: 2 })).toMatchObject({
      grade: "legendary",
      power: 47,
      rawHousePayoutGold: 13
    });
  });

  it("clips house payout by the Kyiv-day cap", () => {
    expect(BARD_PERFORMANCE_DAILY_HOUSE_CAP_GOLD).toBe(23);
    expect(applyBardPerformanceDailyHouseCap(13, 0)).toBe(13);
    expect(applyBardPerformanceDailyHouseCap(13, 17)).toBe(6);
    expect(applyBardPerformanceDailyHouseCap(13, 23)).toBe(0);
  });

  it("keeps cooldown, response window and tip options stable", () => {
    expect(BARD_PERFORMANCE_COOLDOWN_MINUTES).toBe(93);
    expect(BARD_PERFORMANCE_WINDOW_MINUTES).toBe(13);
    expect(BARD_PERFORMANCE_TIP_OPTIONS).toEqual([1, 3, 5, 13]);
    expect(isBardPerformanceTipAmount(5)).toBe(true);
    expect(isBardPerformanceTipAmount(2)).toBe(false);
  });
});
