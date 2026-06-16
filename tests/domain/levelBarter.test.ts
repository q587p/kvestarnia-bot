import { describe, expect, it } from "vitest";
import type { ItemContent } from "../../src/content/schema";
import {
  buildLevelBarterEligibleStacks,
  buildLevelBarterProgression,
  canLevelBarterProgress,
  createLevelBarterToken,
  pickItemsForLevelBarter
} from "../../src/domain/levelBarter";

describe("level barter domain", () => {
  it("auto-picks an exact item match", () => {
    const cheap = item({ id: "item.cheap", goldValue: 100 });
    const almost = item({ id: "item.almost", goldValue: 900 });
    const extra = item({ id: "item.extra", goldValue: 110 });
    const stacks = buildLevelBarterEligibleStacks({
      stacks: [
        { itemId: almost.id, quantity: 1 },
        { itemId: cheap.id, quantity: 1 },
        { itemId: extra.id, quantity: 1 }
      ],
      itemContents: [cheap, almost, extra]
    });

    const selected = pickItemsForLevelBarter(stacks, 1000, 0);

    expect(selected?.selectedTotalValue).toBe(1000);
    expect(selected?.goldSpent).toBe(0);
    expect(selected?.items).toEqual([
      { itemId: almost.id, quantity: 1 },
      { itemId: cheap.id, quantity: 1 }
    ]);
  });

  it("uses gold to fill the missing part before overpaying with items", () => {
    const big = item({ id: "item.big", goldValue: 700 });
    const mid = item({ id: "item.mid", goldValue: 400 });
    const small = item({ id: "item.small", goldValue: 350 });
    const stacks = buildLevelBarterEligibleStacks({
      stacks: [
        { itemId: big.id, quantity: 1 },
        { itemId: mid.id, quantity: 1 },
        { itemId: small.id, quantity: 1 }
      ],
      itemContents: [big, mid, small]
    });

    const selected = pickItemsForLevelBarter(stacks, 1000, 300);

    expect(selected?.itemTotalValue).toBe(750);
    expect(selected?.goldSpent).toBe(250);
    expect(selected?.overpay).toBe(0);
    expect(selected?.items).toEqual([
      { itemId: mid.id, quantity: 1 },
      { itemId: small.id, quantity: 1 }
    ]);
  });

  it("minimizes item overpay when gold cannot fill the gap", () => {
    const big = item({ id: "item.big", goldValue: 700 });
    const mid = item({ id: "item.mid", goldValue: 400 });
    const small = item({ id: "item.small", goldValue: 350 });
    const stacks = buildLevelBarterEligibleStacks({
      stacks: [
        { itemId: big.id, quantity: 1 },
        { itemId: mid.id, quantity: 1 },
        { itemId: small.id, quantity: 1 }
      ],
      itemContents: [big, mid, small]
    });

    const selected = pickItemsForLevelBarter(stacks, 1000, 0);

    expect(selected?.selectedTotalValue).toBe(1050);
    expect(selected?.overpay).toBe(50);
    expect(selected?.items).toEqual([
      { itemId: big.id, quantity: 1 },
      { itemId: small.id, quantity: 1 }
    ]);
  });

  it("allows gold-only exchange when the wallet covers the cost", () => {
    const selected = pickItemsForLevelBarter([], 1000, 1000);

    expect(selected).toMatchObject({
      itemTotalValue: 0,
      goldSpent: 1000,
      selectedTotalValue: 1000,
      overpay: 0,
      items: []
    });
  });

  it("returns null when combined eligible value is below target", () => {
    const cheap = item({ id: "item.cheap", goldValue: 100 });
    const stacks = buildLevelBarterEligibleStacks({
      stacks: [{ itemId: cheap.id, quantity: 2 }],
      itemContents: [cheap]
    });

    expect(pickItemsForLevelBarter(stacks, 1000, 799)).toBeNull();
  });

  it("excludes equipped, protected, priceless, missing, and zero-value items", () => {
    const priced = item({ id: "item.priced", goldValue: 300 });
    const equipped = item({ id: "item.equipped", goldValue: 400 });
    const priceless = item({ id: "item.priceless", priceless: true, goldValue: undefined });
    const protectedItem = item({ id: "item.cellar.foamy-mirage-bottle", goldValue: 500 });
    const zero = item({ id: "item.zero", goldValue: 0 });

    const stacks = buildLevelBarterEligibleStacks({
      stacks: [
        { itemId: priced.id, quantity: 2 },
        { itemId: equipped.id, quantity: 1 },
        { itemId: priceless.id, quantity: 1 },
        { itemId: protectedItem.id, quantity: 1 },
        { itemId: zero.id, quantity: 1 },
        { itemId: "item.missing", quantity: 1 }
      ],
      equippedItemIds: new Set([equipped.id]),
      itemContents: [priced, equipped, priceless, protectedItem, zero]
    });

    expect(stacks.map((stack) => stack.itemId)).toEqual([priced.id]);
  });

  it("preserves XP progress while granting exactly one level", () => {
    const progression = buildLevelBarterProgression({
      storedLevel: 3,
      xp: 30
    });

    expect(progression).toMatchObject({
      levelBefore: 3,
      levelAfter: 4,
      xpBefore: 30,
      xpCarry: 5,
      xpAfter: 50
    });
  });

  it("blocks barter into level 13", () => {
    const progression = buildLevelBarterProgression({
      storedLevel: 12,
      xp: 901
    });

    expect(progression.levelAfter).toBe(13);
    expect(canLevelBarterProgress(progression)).toBe(false);
  });

  it("includes gold spend in the confirmation token", () => {
    const progression = buildLevelBarterProgression({
      storedLevel: 4,
      xp: 50
    });
    const base = {
      items: [{ itemId: "item.one", quantity: 1 }],
      selectedTotalValue: 1000,
      progression
    };

    expect(createLevelBarterToken({ ...base, goldSpent: 0 })).not.toBe(
      createLevelBarterToken({ ...base, goldSpent: 1 })
    );
  });
});

function item(overrides: Partial<ItemContent>): ItemContent {
  return {
    id: "item.test",
    name: "Тестова манатка",
    description: "Для манчкіна.",
    rarity: "common",
    slot: "junk",
    goldValue: 0,
    ...overrides
  };
}
