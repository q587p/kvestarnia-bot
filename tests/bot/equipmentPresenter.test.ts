import { describe, expect, it } from "vitest";
import {
  presentEquipItemResult,
  presentEquipment
} from "../../src/bot/presenters/equipmentPresenter";
import { mantokSetItemContents } from "../../src/content/mantokSetItems";
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
    expect(text).toContain("🗡️ <b>Основна рука</b>: <i>долоня чекає, що саме їй довірять.</i>");
    expect(text).toContain("✋ <b>Друга рука</b>");
    expect(text).toContain("🎩 <b>Голова</b>");
    expect(text).toContain("🧥 <b>Тулуб</b>");
    expect(text).toContain("🥾 <b>Ноги</b>");
    expect(text).toContain("💍 <b>Аксесуар</b>");
    expect(text).toContain("🧰 <b>Інструмент</b>");
    expect(text).toContain(
      [
        "🎩 <b>Голова</b>: <i>полиця для шолома дивиться зверху.</i>",
        "",
        "🧥 <b>Тулуб</b>: Фартух піностійкого пригодника",
        "Ефект: <i>+2 HP · +1 до захисту</i>",
        "",
        "🥾 <b>Ноги</b>: <i>поножі ще не знайшли своїх колін.</i>",
        "",
        "💍 <b>Аксесуар</b>: Корковий перстень серйозних справ",
        "Ефект: <i>+1 Вдачі</i>",
        "",
        "🧰 <b>Інструмент</b>: <i>кишеня для корисного ще не підписана.</i>",
        "",
        "🗡️ <b>Основна рука</b>: <i>долоня чекає, що саме їй довірять.</i>",
        "",
        "✋ <b>Друга рука</b>: <i>вільна рука поки репетирує корисність.</i>"
      ].join("\n")
    );
    expect(text).toContain("Манатки нарешті штовхають циферки");
    expect(text).toContain(
      "Корчма вже запамʼятовує, що висить на пригоднику.\n\n<i>Манатки нарешті штовхають циферки."
    );
    expect(text).not.toContain("HP, мана, бій і нагороди не змінюються");
  });

  it("shows equipped items in their persisted slots", () => {
    const text = presentEquipment(foundEquipment());

    expect(text).toContain("🗡️ <b>Основна рука</b>: Пательня переконання");
    expect(text).toContain("Ефект: <i>+2 до удару</i>");
    expect(text).toContain("🧥 <b>Тулуб</b>: Фартух піностійкого пригодника");
    expect(text).toContain("💍 <b>Аксесуар</b>: Корковий перстень серйозних справ");
    expect(text).not.toContain("Пательня переконання — приклад");
  });

  it("summarizes active and next Mantok set bonuses", () => {
    const text = presentEquipment({
      state: "ready",
      slots: [
        {
          slot: "head",
          item: {
            itemId: "item.set.barrel-brother.helm",
            content: {
              id: "item.set.barrel-brother.helm",
              name: "Шолом бочкового дзвону",
              description: "Частина комплекту «Бочковий панцир старшого Брата»: 1/4.",
              rarity: "epic",
              slot: "armor",
              equipmentSlot: "head",
              goldValue: 118,
              effect: { armor: 2, resist: 1 }
            }
          }
        },
        {
          slot: "chest",
          item: {
            itemId: "item.set.barrel-brother.cuirass",
            content: {
              id: "item.set.barrel-brother.cuirass",
              name: "Нагрудник старшого обруча",
              description: "Частина комплекту «Бочковий панцир старшого Брата»: 2/4.",
              rarity: "epic",
              slot: "armor",
              equipmentSlot: "chest",
              goldValue: 134,
              effect: { armor: 3, hpMax: 5 }
            }
          }
        },
        { slot: "weapon", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null },
        { slot: "tool", item: null },
        { slot: "offhand", item: null }
      ]
    });

    expect(text).toContain("🧩 <b>Комплекти</b>");
    expect(text).toContain("<b>Бочковий панцир старшого Брата</b>: 2/4");
    expect(text).toContain("Активно: Обруч не питає <i>(+2 HP · +1 до захисту)</i>");
    expect(text).toContain("Далі: 3 частини — Бочка тримає форму <i>(+1 до опору)</i>");
  });

  it("shows the offhand as occupied by a twohand main-hand item", () => {
    const text = presentEquipment({
      state: "ready",
      slots: [
        {
          slot: "weapon",
          item: {
            itemId: "item.test-twohand-broom",
            content: {
              id: "item.test-twohand-broom",
              name: "Дворучна мітла протоколу",
              description: "Мете так переконливо, що друга рука теж мусить підписатися.",
              rarity: "rare",
              slot: "weapon",
              tags: ["twohand"],
              goldValue: 93
            }
          }
        },
        {
          slot: "offhand",
          occupiedByTwohand: true,
          item: {
            itemId: "item.test-twohand-broom",
            content: {
              id: "item.test-twohand-broom",
              name: "Дворучна мітла протоколу",
              description: "Мете так переконливо, що друга рука теж мусить підписатися.",
              rarity: "rare",
              slot: "weapon",
              tags: ["twohand"],
              goldValue: 93
            }
          }
        },
        { slot: "head", item: null },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null },
        { slot: "tool", item: null }
      ]
    });

    expect(text).toContain("✋ <b>Друга рука</b>: Дворучна мітла протоколу <i>(дворучна)</i>");
  });

  it("does not count twohand visual offhand occupancy as an extra set piece", () => {
    const hood = getMantokSetTestItem("item.set.yeger-shadow.hood");
    const longbow = getMantokSetTestItem("item.set.yeger-shadow.longbow");
    const text = presentEquipment({
      state: "ready",
      slots: [
        {
          slot: "weapon",
          item: {
            itemId: longbow.id,
            content: longbow
          }
        },
        {
          slot: "offhand",
          occupiedByTwohand: true,
          item: {
            itemId: longbow.id,
            content: longbow
          }
        },
        {
          slot: "head",
          item: {
            itemId: hood.id,
            content: hood
          }
        },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null },
        { slot: "tool", item: null }
      ]
    });

    expect(text).toContain("✋ <b>Друга рука</b>: Лук останньої зарубки <i>(дворучна)</i>");
    expect(text).toContain("<b>Єгерська тіньова стежка</b>: 2/4");
    expect(text).toContain("Активно: Стежка бачить раніше");
    expect(text).toContain("Далі: 3 частини — Не-Єгерський допуск");
    expect(text).not.toContain("<b>Єгерська тіньова стежка</b>: 3/4");
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
        { slot: "offhand", item: null },
        { slot: "head", item: null },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        {
          slot: "accessory",
          item: null
        },
        { slot: "tool", item: null }
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

  it("names canonical class requirements in denial callback text", () => {
    const text = presentEquipItemResult({
      state: "requirements-not-met",
      reasons: ["class"],
      requirements: {
        minLevel: 6,
        classes: ["Бюрокромант"],
        races: [],
        titles: []
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
    expect(text).toContain("Потрібно: клас: Бюрокромант.");
    expect(text).not.toContain("відповідний титул");
  });

  it("explains slot-denied equip callback results", () => {
    const text = presentEquipItemResult({
      state: "slot-not-allowed",
      slot: "offhand",
      reason: "twohand-conflict",
      item: {
        itemId: "item.stamp-of-minor-authority",
        content: {
          id: "item.stamp-of-minor-authority",
          name: "Печатка дрібної переваги",
          description: "Б'є не сильно.",
          rarity: "uncommon",
          slot: "weapon",
          goldValue: 16
        }
      }
    });

    expect(text).toContain("Не екіпірується в слот «Друга рука»: Печатка дрібної переваги.");
    expect(text).toContain("Ця манатка просить обидві руки.");
  });

  it("prompts before replacing a conflicting hand for twohand equipment", () => {
    const text = presentEquipItemResult({
      state: "twohand-confirm-required",
      slot: "weapon",
      item: {
        itemId: "item.test-twohand-broom",
        content: {
          id: "item.test-twohand-broom",
          name: "Дворучна мітла протоколу",
          description: "Мете так переконливо, що друга рука теж мусить підписатися.",
          rarity: "rare",
          slot: "weapon",
          tags: ["twohand"],
          goldValue: 93
        }
      },
      currentItem: null,
      clearedHandItem: {
        itemId: "item.stamp-of-minor-authority",
        content: {
          id: "item.stamp-of-minor-authority",
          name: "Печатка дрібної переваги",
          description: "Б'є не сильно.",
          rarity: "uncommon",
          slot: "weapon",
          goldValue: 16
        }
      }
    });

    expect(text).toContain("Дворучна примірка: Дворучна мітла протоколу займе обидві руки.");
    expect(text).toContain("Звільниться: Печатка дрібної переваги.");
    expect(text).toContain("Підтвердити?");
  });
});

function emptyEquipment(): EquipmentResult {
  return {
    state: "ready",
    slots: [
      { slot: "weapon", item: null },
      { slot: "offhand", item: null },
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
      },
      { slot: "tool", item: null }
    ]
  };
}

function getMantokSetTestItem(itemId: string) {
  const item = mantokSetItemContents.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new Error(`Missing test item: ${itemId}`);
  }

  return item;
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
      { slot: "offhand", item: null },
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
      },
      { slot: "tool", item: null }
    ]
  };
}
