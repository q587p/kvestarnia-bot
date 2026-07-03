import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_RECALCULATION_DAILY_ACTION_KEYS,
  getBigBarrelMedicalPartyBossItemUseDates,
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

  it("counts only medical Big Barrel party-boss item actions for bandage achievements", () => {
    const bandageAt = new Date("2026-07-03T10:00:00.000Z");
    const denseAt = new Date("2026-07-03T10:02:00.000Z");
    const fieldKitAt = new Date("2026-07-03T10:04:00.000Z");
    const nonMedicalAt = new Date("2026-07-03T10:06:00.000Z");

    expect(getBigBarrelMedicalPartyBossItemUseDates([
      {
        submittedAt: nonMedicalAt,
        resultJson: {
          kind: "combat-item",
          item: {
            id: "item.future-smoke-bomb",
            name: "Future Smoke Bomb"
          }
        }
      },
      {
        submittedAt: fieldKitAt,
        resultJson: {
          kind: "combat-item",
          item: {
            id: "item.field-kit",
            name: "Польова аптечка"
          }
        }
      },
      {
        submittedAt: bandageAt,
        resultJson: {
          kind: "combat-item",
          item: {
            id: "item.responsible-panic-bandage",
            name: "Бинт відповідальної паніки"
          }
        }
      },
      {
        submittedAt: new Date("2026-07-03T10:08:00.000Z"),
        resultJson: { kind: "combat-item" }
      },
      {
        submittedAt: denseAt,
        resultJson: {
          kind: "combat-item",
          item: {
            id: "item.dense-bandage",
            name: "Щільний бинт"
          }
        }
      }
    ])).toEqual([bandageAt, denseAt, fieldKitAt]);
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
