import { describe, expect, it } from "vitest";
import {
  HIDDEN_ACHIEVEMENT_LOCKED_DESCRIPTION,
  achievements,
  validateAchievementDefinitions
} from "../../src/content/achievements";

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
    expect(achievements.filter((definition) => definition.status === "enabled").length).toBeGreaterThanOrEqual(41);
    expect(new Set(achievements.map((definition) => definition.id)).size).toBe(achievements.length);
    expect(achievements.map((definition) => definition.sortOrder)).toEqual(
      [...achievements].map((definition) => definition.sortOrder).sort((left, right) => left - right)
    );
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
