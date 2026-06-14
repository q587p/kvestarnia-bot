import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_CATALOG } from "../../src/domain/achievements/achievementCatalog";
import { evaluateAchievementUnlocks } from "../../src/domain/achievements/achievementEvaluator";

describe("evaluateAchievementUnlocks", () => {
  it("unlocks representative achievements across categories in catalog order", () => {
    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "character.created" }
      }).map((achievement) => achievement.id)
    ).toEqual(["achievement.first-steps"]);

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "level.reached", level: 2 }
      }).map((achievement) => achievement.id)
    ).toEqual(["achievement.first-level-up"]);

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "combat.finished", status: "won", turns: 3, manaSpent: 2 }
      }).map((achievement) => achievement.id)
    ).toEqual(["achievement.first-fight", "achievement.first-win", "achievement.first-mana-spent"]);

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "inventory.item-granted", itemId: "item.pan-of-persuasion", totalStacks: 5 }
      }).map((achievement) => achievement.id)
    ).toEqual(["achievement.first-item", "achievement.bag-with-opinions"]);

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "hunt.completed", monsterId: "monster.mimic-shawarma" }
      }).map((achievement) => achievement.id)
    ).toEqual(["achievement.first-hunt-contract"]);

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "tavern.barrel.completed" }
      }).map((achievement) => achievement.id)
    ).toEqual(["achievement.barrel-survivor"]);

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "tavern.round-bought", tier: "fine" }
      }).map((achievement) => achievement.id)
    ).toEqual(["achievement.first-round-bought", "achievement.first-generous-round"]);

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "bestiary.opened" }
      }).map((achievement) => achievement.id)
    ).toEqual(["achievement.read-the-bestiary"]);
  });

  it("does not return already unlocked achievements again and does not mutate inputs", () => {
    const alreadyUnlockedArray = ["achievement.first-fight"];
    const alreadyUnlockedArraySnapshot = [...alreadyUnlockedArray];
    const alreadyUnlockedSet = new Set(["achievement.first-fight"]);
    const alreadyUnlockedSetSnapshot = [...alreadyUnlockedSet];

    const unlocks = evaluateAchievementUnlocks({
      alreadyUnlockedIds: alreadyUnlockedArray,
      event: { type: "combat.finished", status: "won", turns: 3, manaSpent: 2 }
    });

    expect(unlocks.map((achievement) => achievement.id)).toEqual([
      "achievement.first-win",
      "achievement.first-mana-spent"
    ]);
    expect(alreadyUnlockedArray).toEqual(alreadyUnlockedArraySnapshot);

    const setUnlocks = evaluateAchievementUnlocks({
      alreadyUnlockedIds: alreadyUnlockedSet,
      event: { type: "combat.finished", status: "won", turns: 3, manaSpent: 2 }
    });

    expect(setUnlocks.map((achievement) => achievement.id)).toEqual([
      "achievement.first-win",
      "achievement.first-mana-spent"
    ]);
    expect([...alreadyUnlockedSet]).toEqual(alreadyUnlockedSetSnapshot);
  });

  it("honors thresholds for level and inventory stack counts", () => {
    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "level.reached", level: 9 }
      }).map((achievement) => achievement.id)
    ).not.toContain("achievement.level-ten-slice");

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "level.reached", level: 10 }
      }).map((achievement) => achievement.id)
    ).toContain("achievement.level-ten-slice");

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "inventory.item-granted", itemId: "item.pan-of-persuasion", totalStacks: 4 }
      }).map((achievement) => achievement.id)
    ).not.toContain("achievement.bag-with-opinions");

    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "inventory.item-granted", itemId: "item.pan-of-persuasion", totalStacks: 5 }
      }).map((achievement) => achievement.id)
    ).toContain("achievement.bag-with-opinions");
  });

  it("uses the default catalog when none is provided", () => {
    expect(
      evaluateAchievementUnlocks({
        alreadyUnlockedIds: [],
        event: { type: "character.created" }
      })
    ).toEqual([ACHIEVEMENT_CATALOG[0]]);
  });
});
