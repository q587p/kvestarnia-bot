import { describe, expect, it } from "vitest";
import {
  HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
  achievements,
  validateAchievementDefinitions
} from "../../src/content/achievements";
import { LEVEL_XP_THRESHOLDS } from "../../src/domain/progression/level";

const forbiddenRewardKeys = [
  "xp",
  "gold",
  "item",
  "items",
  "stat",
  "stats",
  "combat",
  "power",
  "reward"
];

describe("achievement definitions", () => {
  it("keeps ids unique and definitions sorted", () => {
    expect(validateAchievementDefinitions()).toEqual([]);
    expect(new Set(achievements.map((definition) => definition.id)).size).toBe(achievements.length);
    expect(achievements.map((definition) => definition.sortOrder)).toEqual(
      [...achievements].map((definition) => definition.sortOrder).sort((left, right) => left - right)
    );
  });

  it("pins the restored enabled and disabled catalog counts", () => {
    const enabled = achievements.filter((definition) => definition.status === "enabled");
    const disabled = achievements.filter((definition) => definition.status === "disabled");

    expect(enabled).toHaveLength(113);
    expect(disabled).toHaveLength(12);
  });

  it("keeps disabled rows hidden future placeholders", () => {
    const disabled = achievements.filter((definition) => definition.status === "disabled");

    for (const definition of disabled) {
      expect(definition.hidden).toBe(true);
      expect(definition.lockedDescription).toBe(HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION);
      expect(definition.trigger.type).toBe("future");
    }
  });

  it("keeps the level 23 placeholder disabled while the playable cap is 13", () => {
    const playableLevelCap = LEVEL_XP_THRESHOLDS.length;
    const level23 = achievements.find((definition) => definition.id === "achievement.level.23");

    expect(playableLevelCap).toBe(13);
    expect(level23).toMatchObject({
      hidden: true,
      status: "disabled",
      trigger: { type: "future" }
    });
  });

  it("keeps hidden locked descriptions spoiler-safe", () => {
    for (const definition of achievements.filter((achievement) => achievement.hidden)) {
      expect(definition.lockedDescription).toBe(HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION);
      expect(definition.lockedDescription).not.toContain(definition.description);
    }
  });

  it("does not enable unshipped future triggers", () => {
    for (const definition of achievements) {
      if (definition.trigger.type === "future") {
        expect(definition.status).toBe("disabled");
      }
    }
  });

  it("does not carry reward or combat power fields", () => {
    for (const definition of achievements) {
      for (const key of Object.keys(definition)) {
        expect(forbiddenRewardKeys).not.toContain(key);
      }
    }
  });

  it("keeps cosmetic title grant ids stable and unique", () => {
    const grantIds: string[] = [];
    for (const definition of achievements) {
      const grantId = "cosmeticTitleGrantId" in definition ? definition.cosmeticTitleGrantId : null;
      if (typeof grantId === "string") {
        grantIds.push(grantId);
      }
    }

    expect(new Set(grantIds).size).toBe(grantIds.length);
    for (const id of grantIds) {
      expect(id).toMatch(/^cosmetic-title\.[a-z0-9.-]+$/u);
    }
  });
});
