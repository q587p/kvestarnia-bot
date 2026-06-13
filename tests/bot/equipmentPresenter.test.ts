import { describe, expect, it } from "vitest";
import { presentEquipment } from "../../src/bot/presenters/equipmentPresenter";
import type { EquipmentResult } from "../../src/services/equipmentService";

describe("equipment presenter", () => {
  it("prompts /start when there is no character", () => {
    expect(presentEquipment({ state: "no-character" })).toContain("/start");
  });

  it("shows persistent slots without claiming stat effects", () => {
    const text = presentEquipment(emptyEquipment());

    expect(text).toContain("🧥 <b>Спорядження</b>");
    expect(text).toContain("🗡️ <b>Зброя</b>: <i>гачок чекає важкий аргумент.</i>");
    expect(text).toContain("🧥 <b>Тулуб</b>");
    expect(text).toContain("💍 <b>Аксесуар</b>");
    expect(text).toContain(
      [
        "🗡️ <b>Зброя</b>: <i>гачок чекає важкий аргумент.</i>",
        "",
        "🧥 <b>Тулуб</b>: Фартух піностійкого пригодника",
        "",
        "💍 <b>Аксесуар</b>: Корковий перстень серйозних справ"
      ].join("\n")
    );
    expect(text).not.toContain("🎩 <b>Голова</b>");
    expect(text).not.toContain("🥾 <b>Ноги</b>");
    expect(text).toContain("Бонуси спорядження ще не рахуються");
    expect(text).toContain(
      "Корчма вже запамʼятовує, що висить на пригоднику.\n\n<i>Бонуси спорядження ще не рахуються.</i>"
    );
    expect(text).toContain("HP, мана, бій і нагороди не змінюються");
    expect(text).not.toContain("+2");
    expect(text).not.toContain("додає");
  });

  it("shows equipped items in their persisted slots", () => {
    const text = presentEquipment(foundEquipment());

    expect(text).toContain("🗡️ <b>Зброя</b>: Пательня переконання");
    expect(text).toContain("🧥 <b>Тулуб</b>: Фартух піностійкого пригодника");
    expect(text).toContain("💍 <b>Аксесуар</b>: Корковий перстень серйозних справ");
    expect(text).not.toContain("Пательня переконання — приклад");
  });

  it("escapes owned item names in slots", () => {
    const text = presentEquipment({
      state: "ready",
      slots: [
        { slot: "weapon", item: {
          itemId: "item.unsafe-test",
          content: {
            id: "item.unsafe-test",
            name: "<b>Пательня</b>",
            description: "Неважливо.",
            rarity: "common",
            slot: "weapon",
            goldValue: 13
          }
        } },
        { slot: "head", item: null },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        {
          slot: "accessory",
          item: null
        }
      ]
    });

    expect(text).toContain("&lt;b&gt;Пательня&lt;/b&gt;");
    expect(text).not.toContain("<b>Пательня</b>");
  });
});

function emptyEquipment(): EquipmentResult {
  return {
    state: "ready",
    slots: [
      { slot: "weapon", item: null },
      { slot: "head", item: null },
      {
        slot: "chest",
        item: {
          itemId: "item.apron-of-foam-resistance",
          content: {
            id: "item.apron-of-foam-resistance",
            name: "Фартух піностійкого пригодника",
            description: "Пережив бочку.",
            rarity: "common",
            slot: "armor",
            goldValue: 14
          }
        }
      },
      { slot: "legs", item: null },
      {
        slot: "accessory",
        item: {
          itemId: "item.cork-ring-of-serious-business",
          content: {
            id: "item.cork-ring-of-serious-business",
            name: "Корковий перстень серйозних справ",
            description: "Миша сказала, що це печатка.",
            rarity: "common",
            slot: "accessory",
            goldValue: 6
          }
        }
      }
    ]
  };
}

function foundEquipment(): EquipmentResult {
  return {
    state: "ready",
    slots: [
      {
        slot: "weapon",
        item: {
          itemId: "item.pan-of-persuasion",
          content: {
            id: "item.pan-of-persuasion",
            name: "Пательня переконання",
            description: "Важкий аргумент.",
            rarity: "common",
            slot: "weapon",
            goldValue: 25
          }
        }
      },
      { slot: "head", item: null },
      {
        slot: "chest",
        item: {
          itemId: "item.apron-of-foam-resistance",
          content: {
            id: "item.apron-of-foam-resistance",
            name: "Фартух піностійкого пригодника",
            description: "Пережив бочку.",
            rarity: "common",
            slot: "armor",
            goldValue: 14
          }
        }
      },
      { slot: "legs", item: null },
      {
        slot: "accessory",
        item: {
          itemId: "item.cork-ring-of-serious-business",
          content: {
            id: "item.cork-ring-of-serious-business",
            name: "Корковий перстень серйозних справ",
            description: "Миша сказала, що це печатка.",
            rarity: "common",
            slot: "accessory",
            goldValue: 6
          }
        }
      }
    ]
  };
}
