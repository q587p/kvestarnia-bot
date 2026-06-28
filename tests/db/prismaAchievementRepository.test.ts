import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_RECALCULATION_DAILY_ACTION_KEYS } from "../../src/db/repositories/prismaAchievementRepository";
import { DAILY_KORCHMA_ROUND_REWARD_KEY } from "../../src/services/dailyActionKeys";

describe("PrismaAchievementRepository recalculation snapshot", () => {
  it("selects daily Korchma round reward rows for durable achievement milestones", () => {
    expect(ACHIEVEMENT_RECALCULATION_DAILY_ACTION_KEYS).toContain(DAILY_KORCHMA_ROUND_REWARD_KEY);
  });
});
