import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_CATALOG } from "../../src/domain/achievements/achievementCatalog";

describe("achievement catalog", () => {
  it("keeps ids unique and stable", () => {
    const ids = ACHIEVEMENT_CATALOG.map((achievement) => achievement.id);
    const uniqueIds = new Set(ids);

    expect(ids).toHaveLength(ACHIEVEMENT_CATALOG.length);
    expect(uniqueIds.size).toBe(ACHIEVEMENT_CATALOG.length);
    expect(ids.every((id) => /^achievement\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))).toBe(true);
  });

  it("keeps player-facing fields non-empty and rewardless", () => {
    for (const achievement of ACHIEVEMENT_CATALOG) {
      expect(achievement.title.trim()).not.toBe("");
      expect(achievement.description.trim()).not.toBe("");
      expect(achievement.reward).toEqual({ type: "none" });
      expect(achievement.phase).toBe("phase1");
      expect(["onboarding", "progression", "combat", "inventory", "korchma", "exploration", "social"]).toContain(
        achievement.category
      );
      expect(["visible", "hidden"]).toContain(achievement.visibility);
    }
  });

  it("includes at least one hidden achievement for future UI", () => {
    expect(ACHIEVEMENT_CATALOG.some((achievement) => achievement.visibility === "hidden")).toBe(true);
  });
});
