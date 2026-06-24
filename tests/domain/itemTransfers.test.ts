import { describe, expect, it } from "vitest";
import {
  buildItemGiftEligibleStacks,
  createItemGiftFingerprint,
  selectGiftStackByIndex
} from "../../src/domain/itemTransfers";
import type { ItemContent } from "../../src/content/schema";

const giftable = item({
  id: "item.giftable-spoon",
  name: "Ложка з бантом",
  goldValue: 13
});
const priceless = item({
  id: "item.story-napkin",
  name: "Сюжетна серветка",
  priceless: true
});

describe("item gift eligibility", () => {
  it("keeps one owned ordinary stack eligible", () => {
    const eligible = buildItemGiftEligibleStacks({
      stacks: [{ itemId: giftable.id, quantity: 2 }],
      itemContents: [giftable]
    });

    expect(eligible).toMatchObject([
      {
        itemId: giftable.id,
        quantity: 2,
        unitGoldValue: 13
      }
    ]);
    expect(eligible[0]?.fingerprint).toBe(createItemGiftFingerprint(giftable));
  });

  it("blocks equipped, priceless, unknown, empty and reserved stacks", () => {
    const eligible = buildItemGiftEligibleStacks({
      stacks: [
        { itemId: giftable.id, quantity: 2 },
        { itemId: priceless.id, quantity: 1 },
        { itemId: "item.missing", quantity: 1 },
        { itemId: "item.empty", quantity: 0 }
      ],
      equippedItemIds: new Set([giftable.id]),
      reservedItemIds: new Set([priceless.id]),
      itemContents: [giftable, priceless]
    });

    expect(eligible).toEqual([]);
  });

  it("selects by stable visible index", () => {
    const eligible = buildItemGiftEligibleStacks({
      stacks: [{ itemId: giftable.id, quantity: 1 }],
      itemContents: [giftable]
    });

    expect(selectGiftStackByIndex(eligible, 0)?.itemId).toBe(giftable.id);
    expect(selectGiftStackByIndex(eligible, 1)).toBeNull();
  });
});

function item(input: {
  id: string;
  name: string;
  goldValue?: number;
  priceless?: true;
}): ItemContent {
  return {
    id: input.id,
    name: input.name,
    description: "Тестова манатка.",
    rarity: "common",
    slot: "junk",
    ...(input.priceless ? { priceless: true } : { goldValue: input.goldValue ?? 1 })
  };
}
