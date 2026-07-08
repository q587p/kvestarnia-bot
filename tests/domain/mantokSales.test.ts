import { describe, expect, it } from "vitest";
import {
  buildMantokSaleBasket,
  buildMantokSaleEligibleStacks,
  calculateMantokSalePayout,
  selectAllMantokSaleEligibleUnits
} from "../../src/domain/mantokSales";
import type { ItemContent } from "../../src/content/schema";

describe("Mantok sales", () => {
  const itemContents: ItemContent[] = [
    {
      id: "item.sell.cheap",
      name: "Дешева манатка",
      description: "Дешева, але чесна.",
      rarity: "common",
      slot: "junk",
      goldValue: 1
    },
    {
      id: "item.sell.good",
      name: "Добра манатка",
      description: "Корчмар киває.",
      rarity: "common",
      slot: "junk",
      goldValue: 100
    },
    {
      id: "item.sell.equipped",
      name: "На герої",
      description: "Не чіпати.",
      rarity: "common",
      slot: "armor",
      goldValue: 50
    },
    {
      id: "item.cellar.cheese-seal",
      name: "Сюжетна печатка",
      description: "Пам'ятна.",
      rarity: "common",
      slot: "junk",
      goldValue: 50
    },
    {
      id: "item.sell.priceless",
      name: "Безцінне",
      description: "Не продається.",
      rarity: "common",
      slot: "junk",
      priceless: true
    },
    {
      id: "item.iskrokamin",
      name: "Іскрокамінь",
      description: "Ресурс для Чароковальні, не для шинкового цінника.",
      rarity: "uncommon",
      slot: "resource",
      priceless: true,
      tags: ["tradeable"]
    }
  ];

  it("filters sale eligibility conservatively", () => {
    const eligible = buildMantokSaleEligibleStacks({
      stacks: [
        { itemId: "item.sell.cheap", quantity: 3 },
        { itemId: "item.sell.good", quantity: 1 },
        { itemId: "item.sell.equipped", quantity: 1 },
        { itemId: "item.cellar.cheese-seal", quantity: 1 },
        { itemId: "item.sell.priceless", quantity: 1 },
        { itemId: "item.iskrokamin", quantity: 13 },
        { itemId: "item.unknown", quantity: 1 }
      ],
      equippedItemIds: new Set(["item.sell.equipped"]),
      itemContents
    });

    expect(eligible.map((item) => item.itemId)).toEqual(["item.sell.cheap", "item.sell.good"]);
  });

  it("calculates one basket-level 42 percent payout rounded up", () => {
    const eligible = buildMantokSaleEligibleStacks({
      stacks: [
        { itemId: "item.sell.cheap", quantity: 3 },
        { itemId: "item.sell.good", quantity: 1 }
      ],
      itemContents
    });
    const basket = buildMantokSaleBasket(selectAllMantokSaleEligibleUnits(eligible), eligible);

    expect(basket).toMatchObject({
      nominalValue: 103,
      payoutGold: 44
    });
    expect(calculateMantokSalePayout(7)).toBe(3);
    expect(calculateMantokSalePayout(1)).toBe(1);
    expect(calculateMantokSalePayout(0)).toBe(0);
  });

  it("bounds selected quantities to currently eligible stacks", () => {
    const eligible = buildMantokSaleEligibleStacks({
      stacks: [{ itemId: "item.sell.good", quantity: 1 }],
      itemContents
    });

    expect(buildMantokSaleBasket([{ itemId: "item.sell.good", quantity: 9 }], eligible)?.items).toEqual([
      { itemId: "item.sell.good", quantity: 1 }
    ]);
  });
});
