import { describe, expect, it } from "vitest";
import {
  INVENTORY_PAGE_SIZE,
  buildInventoryViewModel,
  getInventoryPageItems,
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

  it("shows a slot empty-state when an empty inventory is opened through a slot filter", () => {
    const text = presentInventory({ state: "empty" }, 0, "head");

    expect(text).toContain("🎩 <b>Манатки-шоломи</b>");
    expect(text).toContain("Вдягнено: <i>нічого</i>");
    expect(text).toContain("У торбі поки немає манаток для цього гачка.");
    expect(text).not.toContain("Манатки ще не завелися.");
  });

  it("shows a compact inventory summary without item descriptions", () => {
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
    expect(text).not.toContain("Квиток мокрого пригодника");
    expect(text).not.toContain("Трофей тавернової логістики.");
    expect(text.split("\n")).toEqual([
      "🎒 <b>Манатки</b>",
      "Пригодник розклав здобич на столі. Стіл попросив надбавку.",
      "",
      "Оціночна вартість столу: <b>6 золота</b>. Стіл уже поводиться як фінансовий радник."
    ]);
  });

  it("keeps single item names out of the inventory message body", () => {
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

    expect(text).not.toContain("Квиток мокрого пригодника");
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

    expect(firstPage).toContain(
      "Оціночна вартість столу: <b>0 золота</b>. Стіл уже поводиться як фінансовий радник.\n\nСторінка <b>1/2</b>"
    );
    expect(firstPage).toContain("Сторінка <b>1/2</b>");
    expect(firstPage).not.toContain("<b>Манатка 1</b>");
    expect(firstPage).not.toContain(`<b>Манатка ${INVENTORY_PAGE_SIZE}</b>`);
    expect(firstPage).not.toContain(`<b>Манатка ${INVENTORY_PAGE_SIZE + 1}</b>`);
    expect(secondPage).toContain("Сторінка <b>2/2</b>");
    expect(secondPage).not.toContain(`<b>Манатка ${INVENTORY_PAGE_SIZE + 1}</b>`);
    expect(secondPage).not.toContain("<b>Манатка 1</b>");
  });

  it("sorts inventory pages by received date and item name when requested", () => {
    const result: InventoryResult = {
      state: "found",
      totalGoldValue: 0,
      items: [
        item("item.test-beta", "Бета", "junk", undefined, new Date("2026-06-12T10:00:00.000Z")),
        item("item.test-alpha", "Альфа", "junk", undefined, new Date("2026-06-13T10:00:00.000Z")),
        item("item.test-gamma", "Гама", "junk", undefined, new Date("2026-06-11T10:00:00.000Z"))
      ]
    };

    expect(getInventoryPageItems(result, 0, null, { sort: "date-desc" }).map((entry) => entry.itemId)).toEqual([
      "item.test-alpha",
      "item.test-beta",
      "item.test-gamma"
    ]);
    expect(getInventoryPageItems(result, 0, null, { sort: "name-asc" }).map((entry) => entry.itemId)).toEqual([
      "item.test-alpha",
      "item.test-beta",
      "item.test-gamma"
    ]);
  });

  it("builds one reusable view model for filter, sort, and pagination", () => {
    const result: InventoryResult = {
      state: "found",
      totalGoldValue: 0,
      items: [
        item("item.test-beta", "Бета", "weapon", undefined, new Date("2026-06-12T10:00:00.000Z")),
        item("item.test-alpha", "Альфа", "weapon", undefined, new Date("2026-06-13T10:00:00.000Z")),
        item("item.test-junk", "Квитанція", "junk", undefined, new Date("2026-06-14T10:00:00.000Z"))
      ]
    };

    const model = buildInventoryViewModel(result, 7, "weapon", { sort: "name-asc" });

    expect(model.rawItems).toHaveLength(3);
    expect(model.filteredCount).toBe(2);
    expect(model.totalPages).toBe(1);
    expect(model.safePage).toBe(0);
    expect(model.filteredItems.map((entry) => entry.itemId)).toEqual([
      "item.test-alpha",
      "item.test-beta"
    ]);
    expect(model.pageItems).toEqual(getInventoryPageItems(result, 7, "weapon", { sort: "name-asc" }));
  });

  it("filters inventory by equipment slot", () => {
    const result: InventoryResult = {
      state: "found",
      totalGoldValue: 0,
      items: [
        item("item.test-weapon", "Тестова пательня", "weapon"),
        item("item.test-armor", "Тестовий фартух", "armor"),
        item("item.test-junk", "Тестова квитанція", "junk")
      ]
    };
    const text = presentInventory(result, 0, "weapon", {
      currentSlotItem: {
        itemId: "item.current-mop",
        content: {
          id: "item.current-mop",
          name: "Швабра Далекого Контакту +3",
          description: "Тримає проблему на шанобливій відстані.",
          rarity: "uncommon",
          slot: "weapon",
          effect: {
            dexterity: 2,
            weaponDamage: 3
          }
        }
      }
    });

    expect(text).toContain("🗡️ <b>Манатки для основної руки</b>");
    expect(text).toContain("Показано лише те, що можна спробувати вдягнути в цей слот.");
    expect(text).toContain("Вдягнено: <b>Швабра Далекого Контакту +3</b>");
    expect(text).toContain("Ефект: <i>+2 Спритности · +3 до удару</i>");
    expect(text).toContain("Знайдено підхожих манаток: <b>1</b>.");
    expect(text).not.toContain("<b>Тестова пательня</b>");
    expect(text).not.toContain("<b>Тестовий фартух</b>");
    expect(text).not.toContain("<b>Тестова квитанція</b>");
  });

  it("uses slot-compatible ids for offhand filters", () => {
    const result: InventoryResult = {
      state: "found",
      totalGoldValue: 0,
      items: [
        item("item.test-weapon", "Тестова пательня", "weapon"),
        item("item.test-offhand", "Тестова друга рука", "weapon", ["offhand"]),
        item("item.test-junk", "Тестова квитанція", "junk")
      ]
    };
    const text = presentInventory(result, 0, "offhand", {
      slotCompatibleItemIds: new Set(["item.test-offhand"])
    });

    expect(text).toContain("✋ <b>Манатки для другої руки</b>");
    expect(text).toContain("Знайдено підхожих манаток: <b>1</b>.");
  });

  it("filters inventory by one-use manatky", () => {
    const result: InventoryResult = {
      state: "found",
      totalGoldValue: 0,
      items: [
        item("item.responsible-panic-bandage", "Бинт відповідальної паніки", "junk", ["consumable", "one-use"]),
        item("item.test-weapon", "Тестова пательня", "weapon"),
        item("item.test-junk", "Тестова квитанція", "junk")
      ]
    };
    const text = presentInventory(result, 0, "one-use");

    expect(text).toContain("1️⃣ <b>Разові манатки</b>");
    expect(text).toContain("Показано манатки, які використовуються один раз");
    expect(text).toContain("Знайдено разових манаток: <b>1</b>.");
    expect(text).not.toContain("<b>Бинт відповідальної паніки</b>");
    expect(text).not.toContain("<b>Тестова пательня</b>");
    expect(text).not.toContain("<b>Тестова квитанція</b>");
  });

  it("explains when a filtered equipment slot has no items", () => {
    const result: InventoryResult = {
      state: "found",
      totalGoldValue: 0,
      items: [item("item.test-junk", "Тестова квитанція", "junk")]
    };
    const text = presentInventory(result, 0, "accessory");

    expect(text).toContain("💍 <b>Манатки-аксесуари</b>");
    expect(text).toContain("У торбі поки немає манаток для цього гачка.");
  });

  it("explains when the one-use filter has no items", () => {
    const result: InventoryResult = {
      state: "found",
      totalGoldValue: 0,
      items: [item("item.test-junk", "Тестова квитанція", "junk")]
    };
    const text = presentInventory(result, 0, "one-use");

    expect(text).toContain("1️⃣ <b>Разові манатки</b>");
    expect(text).toContain("У торбі поки немає разових манаток.");
  });
});

function item(
  itemId: string,
  name: string,
  slot = "junk",
  tags?: InventoryItemSummary["content"]["tags"],
  createdAt?: Date
): InventoryItemSummary {
  return {
    id: `character-${itemId}`,
    itemId,
    quantity: 1,
    ...(createdAt ? { createdAt } : {}),
    content: {
      id: itemId,
      name,
      description: "Лежить і чекає, коли її перегорнуть.",
      rarity: "common",
      slot,
      ...(tags ? { tags } : {}),
      priceless: true
    }
  };
}
