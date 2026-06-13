import { describe, expect, it } from "vitest";
import {
  presentItemDetail,
  presentOwnedItemDetail
} from "../../src/bot/presenters/itemDetailPresenter";
import type { InventoryItemSummary } from "../../src/services/inventoryService";

describe("item detail presenter", () => {
  it("shows owned item details and marks junk as not equippable", () => {
    const text = presentItemDetail({
      state: "found",
      item: itemSummary({
        quantity: 2,
        content: {
          id: "item.wet-hero-ticket",
          name: "Квиток мокрого героя",
          description: "Трофей корчемної логістики.",
          rarity: "common",
          slot: "junk",
          priceless: true
        }
      })
    });

    expect(text).toContain("🔎 <b>Квиток мокрого героя</b>");
    expect(text).toContain("Рідкість: <b>звичайна</b>");
    expect(text).toContain("Категорія: <b>трофей / смішний доказ</b>");
    expect(text).toContain("Вартість: <i>безцінна</i>");
    expect(text).toContain("Кількість: <b>2</b>");
    expect(text).toContain("<i>Трофей корчемної логістики.</i>");
    expect(text).toContain("не вдягається");
  });

  it("shows preview-equippable wording for weapon items", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
        content: {
          id: "item.pan-of-persuasion",
          name: "Пательня переконання",
          description: "Важкий аргумент.",
          rarity: "common",
          slot: "weapon",
          goldValue: 25
        }
      })
    );

    expect(text).toContain("Категорія: <b>зброя</b>");
    expect(text).toContain("Вартість: <b>25 золота</b>");
    expect(text).toContain("можна буде приміряти");
    expect(text).toContain("бонуси поки лежать у бухгалтерії");
  });

  it("escapes unsafe item names and descriptions", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
        content: {
          id: "item.unsafe-test",
          name: "<b>Пательня & форма</b>",
          description: "Опис із <script> і & знаком.",
          rarity: "rare",
          slot: "weapon",
          goldValue: 13
        }
      })
    );

    expect(text).toContain("&lt;b&gt;Пательня &amp; форма&lt;/b&gt;");
    expect(text).toContain("Опис із &lt;script&gt; і &amp; знаком.");
    expect(text).not.toContain("<script>");
    expect(text).not.toContain("<b>Пательня & форма</b>");
  });

  it("does not reveal details for missing characters or unowned items", () => {
    expect(presentItemDetail({ state: "no-character" })).toContain("/start");
    expect(presentItemDetail({ state: "not-owned" })).toContain("не знайшлося");
  });
});

function itemSummary(overrides: Partial<InventoryItemSummary> = {}): InventoryItemSummary {
  return {
    id: "character-item-1",
    itemId: "item.wet-hero-ticket",
    quantity: 1,
    content: {
      id: "item.wet-hero-ticket",
      name: "Квиток мокрого героя",
      description: "Трофей корчемної логістики.",
      rarity: "common",
      slot: "junk",
      priceless: true
    },
    ...overrides
  };
}
