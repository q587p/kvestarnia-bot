import { describe, expect, it } from "vitest";
import { presentEquipmentPreview } from "../../src/bot/presenters/equipmentPresenter";
import type { InventoryResult } from "../../src/services/inventoryService";

describe("equipment presenter", () => {
  it("prompts /start when there is no character", () => {
    expect(presentEquipmentPreview({ state: "no-character" })).toContain("/start");
  });

  it("shows preview slots without claiming stat effects", () => {
    const text = presentEquipmentPreview({ state: "empty" });

    expect(text).toContain("🧥 <b>Спорядження</b>");
    expect(text).toContain("🗡️ <b>Зброя</b>: <i>Пательня переконання — приклад, ще не у торбі.</i>");
    expect(text).toContain("🎩 <b>Голова</b>");
    expect(text).toContain("🧥 <b>Тулуб</b>");
    expect(text).toContain("🥾 <b>Ноги</b>");
    expect(text).toContain("💍 <b>Аксесуар</b>");
    expect(text).toContain("HP, мана, бій і нагороди не змінюються");
    expect(text).not.toContain("+2");
    expect(text).not.toContain("додає");
  });

  it("shows owned equippable item in its preview slot", () => {
    const text = presentEquipmentPreview(foundInventory());

    expect(text).toContain("🗡️ <b>Зброя</b>: Пательня переконання");
    expect(text).not.toContain("Пательня переконання — приклад");
  });

  it("escapes owned item names in slots", () => {
    const text = presentEquipmentPreview({
      state: "found",
      items: [
        {
          id: "character-item-1",
          itemId: "item.unsafe-test",
          quantity: 1,
          content: {
            id: "item.unsafe-test",
            name: "<b>Пательня</b>",
            description: "Неважливо.",
            rarity: "common",
            slot: "weapon",
            goldValue: 13
          }
        }
      ]
    });

    expect(text).toContain("&lt;b&gt;Пательня&lt;/b&gt;");
    expect(text).not.toContain("<b>Пательня</b>");
  });
});

function foundInventory(): InventoryResult {
  return {
    state: "found",
    items: [
      {
        id: "character-item-1",
        itemId: "item.pan-of-persuasion",
        quantity: 1,
        content: {
          id: "item.pan-of-persuasion",
          name: "Пательня переконання",
          description: "Важкий аргумент.",
          rarity: "common",
          slot: "weapon",
          goldValue: 25
        }
      }
    ]
  };
}
