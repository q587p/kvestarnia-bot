import { describe, expect, it } from "vitest";
import {
  INVENTORY_PAGE_SIZE,
  presentInventory
} from "../../src/bot/presenters/inventoryPresenter";
import type { InventoryItemSummary, InventoryResult } from "../../src/services/inventoryService";

describe("inventory presenter", () => {
  it("prompts /start when character does not exist", () => {
    expect(presentInventory({ state: "no-character" })).toContain("/start");
  });

  it("shows a short empty inventory prompt", () => {
    const text = presentInventory({ state: "empty" });

    expect(text).toContain("🎒 Манатки");
    expect(text).toContain("/tavern");
    expect(text).toContain("/quest");
    expect(text).not.toContain("/adventure");
    expect(text).toContain("/fight");
    expect(text.length).toBeLessThan(180);
  });

  it("shows item names, quantities, and descriptions", () => {
    const result: InventoryResult = {
      state: "found",
      totalGoldValue: 6,
      items: [
        {
          id: "character-item-1",
          itemId: "item.wet-hero-ticket",
          quantity: 2,
          content: {
            id: "item.wet-hero-ticket",
            name: "Квиток мокрого пригодника",
            description: "Трофей тавернової логістики.",
            rarity: "common",
            slot: "junk",
            goldValue: 3
          }
        }
      ]
    };
    const text = presentInventory(result);

    expect(text).toContain("<b>Манатки</b>");
    expect(text).toContain("Стіл попросив надбавку.\n\nОціночна вартість столу");
    expect(text).toContain("Оціночна вартість столу: <b>6 золота</b>");
    expect(text).toContain("<b>Квиток мокрого пригодника</b> ×2");
    expect(text).toContain("<i>Трофей тавернової логістики.</i>");
    expect(text.split("\n").length).toBeLessThanOrEqual(8);
  });

  it("omits quantity for a single item", () => {
    const text = presentInventory({
      state: "found",
      totalGoldValue: 0,
      items: [
        {
          id: "character-item-1",
          itemId: "item.wet-hero-ticket",
          quantity: 1,
          content: {
            id: "item.wet-hero-ticket",
            name: "Квиток мокрого пригодника",
            description: "Трофей тавернової логістики.",
            rarity: "common",
            slot: "junk",
            priceless: true
          }
        }
      ]
    });

    expect(text).toContain("• <b>Квиток мокрого пригодника</b>");
    expect(text).not.toContain("×1");
  });

  it("paginates long inventory lists", () => {
    const result: InventoryResult = {
      state: "found",
      totalGoldValue: 0,
      items: Array.from({ length: INVENTORY_PAGE_SIZE + 1 }, (_, index) =>
        item(`item.test-${index + 1}`, `Манатка ${index + 1}`)
      )
    };
    const firstPage = presentInventory(result, 0);
    const secondPage = presentInventory(result, 1);

    expect(firstPage).toContain("Сторінка <b>1/2</b>");
    expect(firstPage).toContain("<b>Манатка 1</b>");
    expect(firstPage).toContain(`<b>Манатка ${INVENTORY_PAGE_SIZE}</b>`);
    expect(firstPage).not.toContain(`<b>Манатка ${INVENTORY_PAGE_SIZE + 1}</b>`);
    expect(secondPage).toContain("Сторінка <b>2/2</b>");
    expect(secondPage).toContain(`<b>Манатка ${INVENTORY_PAGE_SIZE + 1}</b>`);
    expect(secondPage).not.toContain("<b>Манатка 1</b>");
  });
});

function item(itemId: string, name: string): InventoryItemSummary {
  return {
    id: `character-${itemId}`,
    itemId,
    quantity: 1,
    content: {
      id: itemId,
      name,
      description: "Лежить і чекає, коли її перегорнуть.",
      rarity: "common",
      slot: "junk",
      priceless: true
    }
  };
}
