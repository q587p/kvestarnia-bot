import { describe, expect, it } from "vitest";
import { achievements } from "../../src/content/achievements";
import {
  cosmeticTitles,
  resolveActiveCosmeticTitleLabel,
  validateCosmeticTitleDefinitions
} from "../../src/content/cosmeticTitles";

describe("cosmetic title definitions", () => {
  it("keeps the cosmetic title catalog valid", () => {
    expect(validateCosmeticTitleDefinitions()).toEqual([]);
    expect(new Set(cosmeticTitles.map((definition) => definition.id)).size).toBe(cosmeticTitles.length);
    expect(new Set(cosmeticTitles.map((definition) => definition.label)).size).toBe(cosmeticTitles.length);
  });

  it("resolves null and unknown title grants safely", () => {
    expect(resolveActiveCosmeticTitleLabel(null)).toBeNull();
    expect(resolveActiveCosmeticTitleLabel(undefined)).toBeNull();
    expect(resolveActiveCosmeticTitleLabel("cosmetic-title.unknown")).toBeNull();
  });

  it("returns short title labels instead of achievement names", () => {
    expect(resolveActiveCosmeticTitleLabel("cosmetic-title.first-ink")).toBe("Першописець");
    expect(resolveActiveCosmeticTitleLabel("cosmetic-title.level-thirteen-clause")).toBe("Тринадцятий пункт");
    expect(resolveActiveCosmeticTitleLabel("cosmetic-title.first-level-barter")).toBe("Манчкінів клієнт");

    expect(resolveActiveCosmeticTitleLabel("cosmetic-title.first-ink")).not.toBe("Де тут вихід?");
    expect(resolveActiveCosmeticTitleLabel("cosmetic-title.level-thirteen-clause")).not.toBe(
      "Тринадцятий пункт інструкції"
    );
    expect(resolveActiveCosmeticTitleLabel("cosmetic-title.first-level-barter")).not.toBe(
      "Манчкін прийняв рівневу заявку"
    );
  });

  it("resolves every enabled achievement title grant to a non-empty label", () => {
    for (const achievement of achievements.filter((definition) => definition.status === "enabled")) {
      if (!("cosmeticTitleGrantId" in achievement) || !achievement.cosmeticTitleGrantId) {
        continue;
      }

      const titleGrantId = achievement.cosmeticTitleGrantId;
      expect(
        resolveActiveCosmeticTitleLabel(titleGrantId),
        titleGrantId
      ).toEqual(expect.any(String));
    }
  });

  it("does not resolve labels that repeat granting achievement titles", () => {
    for (const achievement of achievements) {
      if (!("cosmeticTitleGrantId" in achievement) || !achievement.cosmeticTitleGrantId) {
        continue;
      }

      expect(resolveActiveCosmeticTitleLabel(achievement.cosmeticTitleGrantId)).not.toBe(achievement.title);
    }
  });
});
