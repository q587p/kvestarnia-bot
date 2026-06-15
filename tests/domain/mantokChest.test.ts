import { describe, expect, it } from "vitest";
import type { ItemContent } from "../../src/content/schema";
import {
  buildMantokChestEligibleStacks,
  calculateMantokChestItemScore,
  protectedMantokChestItemIds,
  selectCheapestMantokChestUnits,
  selectMantokChestOutputItem
} from "../../src/domain/mantokChest";
import { FakeRandomSource } from "../../src/shared/random";
import {
  APOLOGY_P3009_STAMP_ITEM_ID,
  APOLOGY_REDEPLOY_CORK_ITEM_ID,
  APOLOGY_ROLLBACK_RECEIPT_ITEM_ID
} from "../../src/content/giftCampaigns";

describe("Mantok Chest domain", () => {
  it("scores items from gold value and rarity rank", () => {
    expect(calculateMantokChestItemScore(item({ goldValue: 10, rarity: "common" }))).toBe(35);
    expect(calculateMantokChestItemScore(item({ goldValue: 10, rarity: "rare" }))).toBe(85);
  });

  it("excludes priceless, protected, equipped, missing, and empty stacks", () => {
    const protectedItem = item({
      id: "item.badge-of-thirteen-small-problems",
      goldValue: 13,
      slot: "cosmetic"
    });
    const priced = item({ id: "item.priced", goldValue: 3 });
    const equipped = item({ id: "item.equipped", goldValue: 5 });
    const priceless = item({ id: "item.priceless", priceless: true, goldValue: undefined });

    protectedMantokChestItemIds.add(protectedItem.id);

    const eligible = buildMantokChestEligibleStacks({
      stacks: [
        { itemId: protectedItem.id, quantity: 1 },
        { itemId: priced.id, quantity: 2 },
        { itemId: equipped.id, quantity: 2 },
        { itemId: priceless.id, quantity: 2 },
        { itemId: "item.missing", quantity: 2 },
        { itemId: priced.id, quantity: 0 }
      ],
      equippedItemIds: new Set([equipped.id]),
      itemContents: [protectedItem, priced, equipped, priceless]
    });

    expect(eligible).toEqual([
      {
        itemId: priced.id,
        quantity: 2,
        content: priced,
        score: 28
      }
    ]);
  });

  it("protects technical apology keepsakes from auto-pick", () => {
    expect([...protectedMantokChestItemIds]).toEqual(
      expect.arrayContaining([
        APOLOGY_ROLLBACK_RECEIPT_ITEM_ID,
        APOLOGY_REDEPLOY_CORK_ITEM_ID,
        APOLOGY_P3009_STAMP_ITEM_ID
      ])
    );
  });

  it("auto-picks exactly five lowest-score units and can pick multiple units from one stack", () => {
    const cheap = item({ id: "item.cheap", goldValue: 1 });
    const mid = item({ id: "item.mid", goldValue: 4 });
    const expensive = item({ id: "item.expensive", goldValue: 100 });
    const eligible = buildMantokChestEligibleStacks({
      stacks: [
        { itemId: expensive.id, quantity: 10 },
        { itemId: cheap.id, quantity: 4 },
        { itemId: mid.id, quantity: 2 }
      ],
      itemContents: [cheap, mid, expensive]
    });

    const selected = selectCheapestMantokChestUnits(eligible);

    expect(selected?.items).toEqual([
      { itemId: cheap.id, quantity: 4 },
      { itemId: mid.id, quantity: 1 }
    ]);
    expect(selected?.units).toHaveLength(5);
    expect(selected?.minimumOutputScore).toBe(Math.floor((26 * 4 + 29) / 5) + 1);
  });

  it("requires output score to be strictly greater than the input average", () => {
    const input = item({ id: "item.input", goldValue: 25 });
    const same = item({ id: "item.same", goldValue: 25 });
    const better = item({ id: "item.better", goldValue: 26 });

    expect(
      selectMantokChestOutputItem({
        items: [input, same, better],
        averageInputScore: calculateMantokChestItemScore(input),
        inputItemIds: new Set([input.id]),
        rng: new FakeRandomSource([0])
      })?.id
    ).toBe(better.id);
  });

  it("prefers non-input output candidates and returns null when none exists", () => {
    const input = item({ id: "item.input", goldValue: 10 });
    const betterInput = item({ id: "item.input-better", goldValue: 20 });
    const betterOther = item({ id: "item.other-better", goldValue: 30 });

    expect(
      selectMantokChestOutputItem({
        items: [input, betterInput, betterOther],
        averageInputScore: 40,
        inputItemIds: new Set([betterInput.id]),
        rng: new FakeRandomSource([0])
      })?.id
    ).toBe(betterOther.id);

    expect(
      selectMantokChestOutputItem({
        items: [input],
        averageInputScore: 500,
        inputItemIds: new Set(),
        rng: new FakeRandomSource([0])
      })
    ).toBeNull();
  });
});

function item(overrides: Partial<ItemContent>): ItemContent {
  return {
    id: "item.test",
    name: "Тестова манатка",
    description: "Для Скрині.",
    rarity: "common",
    slot: "junk",
    goldValue: 0,
    ...overrides
  };
}
