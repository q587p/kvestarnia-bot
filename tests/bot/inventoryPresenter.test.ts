import { describe, expect, it } from "vitest";
import { presentInventory } from "../../src/bot/presenters/inventoryPresenter";
import type { InventoryResult } from "../../src/services/inventoryService";

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
      items: [
        {
          id: "character-item-1",
          itemId: "item.wet-hero-ticket",
          quantity: 2,
          content: {
            id: "item.wet-hero-ticket",
            name: "Квиток мокрого героя",
            description: "Трофей тавернової логістики.",
            rarity: "common",
            slot: "junk"
          }
        }
      ]
    };
    const text = presentInventory(result);

    expect(text).toContain("<b>Манатки</b>");
    expect(text).toContain("<b>Квиток мокрого героя</b> ×2");
    expect(text).toContain("<i>Трофей тавернової логістики.</i>");
    expect(text.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("omits quantity for a single item", () => {
    const text = presentInventory({
      state: "found",
      items: [
        {
          id: "character-item-1",
          itemId: "item.wet-hero-ticket",
          quantity: 1,
          content: {
            id: "item.wet-hero-ticket",
            name: "Квиток мокрого героя",
            description: "Трофей тавернової логістики.",
            rarity: "common",
            slot: "junk"
          }
        }
      ]
    });

    expect(text).toContain("• <b>Квиток мокрого героя</b>");
    expect(text).not.toContain("×1");
  });
});
