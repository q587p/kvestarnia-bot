import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_RECALCULATION_DAILY_ACTION_KEYS,
  getPartyBossItemActionAchievementWhere,
  getAdventureChoiceConsequence,
  isAdventureChoiceFightComplication,
  isAdventureChoiceResolvedForAchievement
} from "../../src/db/repositories/prismaAchievementRepository";
import { DAILY_KORCHMA_ROUND_REWARD_KEY } from "../../src/services/dailyActionKeys";

describe("PrismaAchievementRepository recalculation snapshot", () => {
  it("selects daily Korchma round reward rows for durable achievement milestones", () => {
    expect(ACHIEVEMENT_RECALCULATION_DAILY_ACTION_KEYS).toContain(DAILY_KORCHMA_ROUND_REWARD_KEY);
  });

  it("keeps party-boss medical recalculation scoped to Big Barrel item actions", () => {
    expect(getPartyBossItemActionAchievementWhere("character-1")).toEqual({
      actorCharacterId: "character-1",
      actionKey: "item",
      session: {
        rulesVersion: "big-barrel-brother-v1"
      }
    });
  });

  it("classifies Adventure Choice achievement rows from stored consequence", () => {
    expect(getAdventureChoiceConsequence({ consequence: "local-failure" })).toBe("local-failure");
    expect(isAdventureChoiceResolvedForAchievement({ consequence: "local-failure" })).toBe(false);
    expect(isAdventureChoiceFightComplication({ consequence: "local-failure", grade: "complication" })).toBe(false);

    expect(isAdventureChoiceResolvedForAchievement({ consequence: "fight-handoff" })).toBe(true);
    expect(isAdventureChoiceFightComplication({ consequence: "fight-handoff", grade: "complication" })).toBe(true);

    expect(isAdventureChoiceResolvedForAchievement({ grade: "complication" })).toBe(true);
    expect(isAdventureChoiceFightComplication({ grade: "complication" })).toBe(false);
    expect(isAdventureChoiceResolvedForAchievement(null)).toBe(true);
  });
});
