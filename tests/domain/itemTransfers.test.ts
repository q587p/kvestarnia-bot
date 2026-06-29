import { describe, expect, it } from "vitest";
import {
  buildItemGiftEligibleStacks,
  calculatePostalDeliveryFee,
  createItemGiftFingerprint,
  packageLineFromEligibleStack,
  validatePostalPackageLines,
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
const tradeBlocked = item({
  id: "item.trade-blocked-bandage",
  name: "Бинт із застереженням",
  goldValue: 7,
  tags: ["trade-blocked"]
});
const soulbound = item({
  id: "item.soulbound-spoon",
  name: "Душевна ложка",
  goldValue: 13,
  tags: ["soulbound"]
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

  it("blocks transfer-blocked tagged items while keeping legacy untagged priced items eligible", () => {
    const eligible = buildItemGiftEligibleStacks({
      stacks: [
        { itemId: giftable.id, quantity: 1 },
        { itemId: tradeBlocked.id, quantity: 1 },
        { itemId: soulbound.id, quantity: 1 }
      ],
      itemContents: [giftable, tradeBlocked, soulbound]
    });

    expect(eligible.map((stack) => stack.itemId)).toEqual([giftable.id]);
  });

  it("includes transfer tags in the gift fingerprint so tag edits stale old selections", () => {
    expect(createItemGiftFingerprint(giftable)).not.toBe(createItemGiftFingerprint({
      ...giftable,
      tags: ["trade-blocked"]
    }));
  });

  it("selects by stable visible index", () => {
    const eligible = buildItemGiftEligibleStacks({
      stacks: [{ itemId: giftable.id, quantity: 1 }],
      itemContents: [giftable]
    });

    expect(selectGiftStackByIndex(eligible, 0)?.itemId).toBe(giftable.id);
    expect(selectGiftStackByIndex(eligible, 1)).toBeNull();
  });

  it("enforces postal package caps and fee formula", () => {
    const eligible = buildItemGiftEligibleStacks({
      stacks: [{ itemId: giftable.id, quantity: 100 }],
      itemContents: [giftable]
    });
    const line = packageLineFromEligibleStack(eligible[0]!, 93);

    expect(line).toMatchObject({ itemId: giftable.id, quantity: 93, observedQuantity: 100 });
    expect(validatePostalPackageLines([line])).toBe(true);
    expect(validatePostalPackageLines([{ ...line, quantity: 0 }])).toBe(false);
    expect(validatePostalPackageLines([{ ...line, quantity: 94 }])).toBe(false);
    expect(validatePostalPackageLines([line, { ...line }])).toBe(false);
    expect(validatePostalPackageLines([
      line,
      { ...line, itemId: "item.2" },
      { ...line, itemId: "item.3" },
      { ...line, itemId: "item.4" },
      { ...line, itemId: "item.5" },
      { ...line, itemId: "item.6" }
    ])).toBe(false);
    expect(calculatePostalDeliveryFee([{ quantity: 93 }])).toBe(6);
    expect(calculatePostalDeliveryFee([
      { quantity: 1 },
      { quantity: 93 },
      { quantity: 42 }
    ])).toBe(8);
  });
});

function item(input: {
  id: string;
  name: string;
  goldValue?: number;
  priceless?: true;
  tags?: ItemContent["tags"];
}): ItemContent {
  return {
    id: input.id,
    name: input.name,
    description: "Тестова манатка.",
    rarity: "common",
    slot: "junk",
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.priceless ? { priceless: true } : { goldValue: input.goldValue ?? 1 })
  };
}
