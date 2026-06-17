import { describe, expect, it } from "vitest";
import {
  presentEquipItemResult,
  presentEquipment
} from "../../src/bot/presenters/equipmentPresenter";
import type {
  EquipmentResult,
  EquipItemResult
} from "../../src/services/equipmentService";

describe("equipment presenter", () => {
  it("prompts /start when there is no character", () => {
    expect(presentEquipment({ state: "no-character" })).toContain("/start");
  });

  it("shows persistent slots and equipped stat effects", () => {
    const text = presentEquipment(emptyEquipment());

    expect(text).toContain("🧥 <b>Спорядження</b>");
    expect(text).toContain("🗡️ <b>Зброя</b>: <i>стійка чекає важкий аргумент.</i>");
    expect(text).toContain("🧥 <b>Тулуб</b>");
    expect(text).toContain("💍 <b>Аксесуар</b>");
    expect(text).toContain(
      [
        "🗡️ <b>Зброя</b>: <i>стійка чекає важкий аргумент.</i>",
        "",
        "🧥 <b>Тулуб</b>: Фартух піностійкого пригодника",
        "Ефект: <i>+2 HP · +1 до захисту</i>",
        "",
        "💍 <b>Аксесуар</b>: Корковий перстень серйозних справ",
        "Ефект: <i>+1 Вдачі</i>"
      ].join("\n")
    );
    expect(text).not.toContain("🎩 <b>Голова</b>");
    expect(text).not.toContain("🥾 <b>Ноги</b>");
    expect(text).toContain("Манатки нарешті штовхають циферки");
    expect(text).toContain(
      "Корчма вже запамʼятовує, що висить на пригоднику.\n\n<i>Манатки нарешті штовхають циферки."
    );
    expect(text).not.toContain("HP, мана, бій і нагороди не змінюються");
  });

  it("shows equipped items in their persisted slots", () => {
    const text = presentEquipment(foundEquipment());

    expect(text).toContain("🗡️ <b>Зброя</b>: Пательня переконання");
    expect(text).toContain("Ефект: <i>+2 до удару</i>");
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

  it("keeps requirement denial callback text plain and specific", () => {
    const text = presentEquipItemResult({
      state: "requirements-not-met",
      reasons: ["min-level", "class", "race"],
      requirements: {
        minLevel: 10,
        classes: ["Бюрокрамант"],
        races: ["Людиноподібний"],
        titles: []
      },
      item: {
        itemId: "item.loot-v1-cloak-here-by-accident-plus-3",
        content: {
          id: "item.loot-v1-cloak-here-by-accident-plus-3",
          name: '<b>Плащ «Я Тут Випадково» +3</b>',
          description: "Плащ чесно прикидається випадком.",
          rarity: "common",
          slot: "armor",
          goldValue: 10
        }
      }
    } satisfies EquipItemResult);

    expect(text).toContain("Ще не екіпірується: Плащ «Я Тут Випадково» +3.");
    expect(text).toContain("Потрібно: рівень 10+, клас: Бюрокрамант, походження: Людиноподібний.");
    expect(text).toContain("Це правило манатки, не помилка героя.");
    expect(text).not.toContain("<b>");
    expect(text).not.toContain("</b>");
    expect(text).not.toContain("&lt;");
    expect(text).not.toContain("іншу анкету");
  });

  it("names title requirements in denial callback text", () => {
    const text = presentEquipItemResult({
      state: "requirements-not-met",
      reasons: ["title"],
      requirements: {
        minLevel: 6,
        classes: [],
        races: [],
        titles: ["Боргомант"]
      },
      item: {
        itemId: "item.loot-v1-x022-plus-2",
        content: {
          id: "item.loot-v1-x022-plus-2",
          name: "Жетон Боргоманта +2",
          description: "Маленька річ, великий привід сперечатися з балансом.",
          rarity: "rare",
          slot: "accessory",
          goldValue: 613
        }
      }
    } satisfies EquipItemResult);

    expect(text).toContain("Ще не екіпірується: Жетон Боргоманта +2.");
    expect(text).toContain("Потрібно: титул: Боргомант.");
    expect(text).not.toContain("відповідний титул");
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
            goldValue: 14,
            effect: {
              armor: 1,
              hpMax: 2
            }
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
            goldValue: 6,
            effect: {
              luck: 1
            }
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
            goldValue: 25,
            effect: {
              weaponDamage: 2
            }
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
            goldValue: 14,
            effect: {
              armor: 1,
              hpMax: 2
            }
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
            goldValue: 6,
            effect: {
              luck: 1
            }
          }
        }
      }
    ]
  };
}
