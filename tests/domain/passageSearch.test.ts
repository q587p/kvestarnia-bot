import { describe, expect, it } from "vitest";
import {
  DESCENT_SEARCH_DURATION_MS,
  getPassageSearchDangerChance,
  getPassageSearchModifiers,
  isEmptyPassageSearchLoot,
  PASSAGE_SEARCH_DURATION_MS,
  rollPassageSearchDanger,
  rollPassageSearchLoot,
  SEARCH_NODE_COOLDOWN_MS
} from "../../src/domain/passageSearch";

describe("passage search domain", () => {
  it("keeps the MVP timers in one place", () => {
    expect(SEARCH_NODE_COOLDOWN_MS).toBe(13 * 60 * 1000);
    expect(PASSAGE_SEARCH_DURATION_MS).toBe(42 * 1000);
    expect(DESCENT_SEARCH_DURATION_MS).toBe(23 * 1000);
  });

  it("keeps safe searches from rolling danger", () => {
    const danger = rollPassageSearchDanger({
      snapshot: {
        safeAtStart: true,
        dangerTier: 10,
        monsterIdAtStart: "monster.very-local-opinion"
      },
      modifiers: getPassageSearchModifiers({ luck: 0 }),
      rng: { nextFloat: () => 0 }
    });

    expect(danger).toBe(false);
  });

  it("scales danger by tier and lowers it with luck", () => {
    const lowTier = getPassageSearchDangerChance({
      tier: 1,
      modifiers: getPassageSearchModifiers({ luck: 0 })
    });
    const highTier = getPassageSearchDangerChance({
      tier: 10,
      modifiers: getPassageSearchModifiers({ luck: 0 })
    });
    const luckyHighTier = getPassageSearchDangerChance({
      tier: 10,
      modifiers: getPassageSearchModifiers({ luck: 13 })
    });

    expect(highTier).toBeGreaterThan(lowTier);
    expect(luckyHighTier).toBeLessThan(highTier);
    expect(luckyHighTier).toBeGreaterThanOrEqual(0.05);
  });

  it("keeps descent loot tiny and danger-free", () => {
    const loot = rollPassageSearchLoot({
      snapshot: { nodeKind: "location", searchTier: 0 },
      modifiers: getPassageSearchModifiers({ luck: 0 }),
      rng: {
        nextFloat: () => 0,
        nextInt: (_min, max) => max
      },
      bandageItemId: "item.responsible-panic-bandage"
    });

    expect(loot.gold).toBeLessThanOrEqual(2);
    expect(loot.itemGrants).toEqual([{ itemId: "item.responsible-panic-bandage", quantity: 1 }]);
  });

  it("can represent an empty result without grants", () => {
    expect(isEmptyPassageSearchLoot({ gold: 0, itemGrants: [] })).toBe(true);
    expect(isEmptyPassageSearchLoot({ gold: 1, itemGrants: [] })).toBe(false);
  });
});
