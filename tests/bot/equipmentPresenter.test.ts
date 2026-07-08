import { describe, expect, it } from "vitest";
import {
  presentEquipItemResult,
  presentEquipment
} from "../../src/bot/presenters/equipmentPresenter";
import { items } from "../../src/content";
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

  it("shows upgraded concrete item ids in equipped slots", () => {
    const pan = items.find((item) => item.id === "item.pan-of-persuasion.plus-2");
    expect(pan).toBeDefined();
    if (!pan) {
      throw new Error("Expected upgraded pan content.");
    }

    const text = presentEquipment({
      state: "ready",
      slots: [
        { slot: "weapon", item: { itemId: pan.id, content: pan } },
        { slot: "head", item: null },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null },
        { slot: "tool", item: null },
        { slot: "offhand", item: null }
      ]
    });

    expect(text).toContain("🗡️ <b>Основна рука</b>: Пательня переконання +2");
    expect(text).toContain("Ефект: <i>+4 до удару</i>");
  });

  it("shows tuning equipment with struck-through effects and without active grants", () => {
    const pan = items.find((item) => item.id === "item.pan-of-persuasion.plus-1");
    const staff = items.find((item) => item.id === "item.set.asclepius.staff");
    expect(pan).toBeDefined();
    expect(staff).toBeDefined();
    if (!pan || !staff) {
      throw new Error("Expected tuning test content.");
    }

    const text = presentEquipment({
      state: "ready",
      slots: [
        {
          slot: "weapon",
          item: { itemId: pan.id, content: pan },
          attunement: {
            state: "tuning",
            strength: "weak",
            startedAt: new Date("2026-07-08T08:00:00.000Z"),
            readyAt: new Date("2026-07-08T08:13:00.000Z")
          }
        },
        {
          slot: "tool",
          item: { itemId: staff.id, content: staff },
          attunement: {
            state: "tuning",
            strength: "strong",
            startedAt: new Date("2026-07-08T08:00:00.000Z"),
            readyAt: new Date("2026-07-08T08:42:00.000Z")
          }
        },
        { slot: "head", item: null },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null },
        { slot: "offhand", item: null }
      ]
    });

    expect(text).toContain("Пательня переконання +1");
    expect(text).toContain("Ефект: <s>+3 до удару</s>\n<i>Йде налаштування.</i>");
    expect(text).toContain("Посох Асклепія з інструкцією");
    expect(text).not.toContain("Дія: <b>⚕️ Інструкція Асклепія</b>");
    expect(text).not.toContain("✨ <b>Дія спорядження</b>");
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

  it("shows Mantok granted gear actions in equipped slots", () => {
    const dagger = items.find((item) => item.id === "item.set.red-line.left-dagger");
    expect(dagger).toBeDefined();
    if (!dagger) {
      throw new Error("Expected red-line dagger content.");
    }

    const text = presentEquipment({
      state: "ready",
      slots: [
        { slot: "weapon", item: { itemId: dagger.id, content: dagger } },
        { slot: "head", item: null },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null },
        { slot: "tool", item: null },
        { slot: "offhand", item: null }
      ]
    });

    expect(text).toContain("Дія: <b>🩸 Червоний рядок</b>");
    expect(text).toContain("✨ <b>Дія спорядження</b>");
    expect(text).toContain("<b>🩸 Червоний рядок</b> <i>(1 мани, перезарядка 3)</i>");
    expect(text).toContain("1 мани");
    expect(text).toContain("перезарядка 3");
  });

  it("escapes equipped grant item names while keeping gear action copy readable", () => {
    const dagger = items.find((item) => item.id === "item.set.red-line.left-dagger");
    expect(dagger).toBeDefined();
    if (!dagger) {
      throw new Error("Expected red-line dagger content.");
    }

    const text = presentEquipment({
      state: "ready",
      slots: [
        {
          slot: "weapon",
          item: {
            itemId: dagger.id,
            content: {
              ...dagger,
              name: "<b>Кинджал червоного рядка</b>"
            }
          }
        },
        { slot: "head", item: null },
        { slot: "chest", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null },
        { slot: "tool", item: null },
        { slot: "offhand", item: null }
      ]
    });

    expect(text).toContain("&lt;b&gt;Кинджал червоного рядка&lt;/b&gt;");
    expect(text).not.toContain("<b>Кинджал червоного рядка</b>");
    expect(text).toContain("Дія: <b>🩸 Червоний рядок</b>");
  });

  it("distinguishes borrowed gear actions and docs-only service perks in equipment", () => {
    const staff = items.find((item) => item.id === "item.set.asclepius.staff");
    const cloak = items.find((item) => item.id === "item.set.yeger-shadow.cloak");
    expect(staff).toBeDefined();
    expect(cloak).toBeDefined();
    if (!staff || !cloak) {
      throw new Error("Expected Mantok ability grant items.");
    }

    const text = presentEquipment({
      state: "ready",
      slots: [
        { slot: "weapon", item: { itemId: staff.id, content: staff } },
        { slot: "chest", item: { itemId: cloak.id, content: cloak } },
        { slot: "head", item: null },
        { slot: "legs", item: null },
        { slot: "accessory", item: null },
        { slot: "tool", item: null },
        { slot: "offhand", item: null }
      ]
    });

    expect(text).toContain("Дія: <b>⚕️ Інструкція Асклепія</b>");
    expect(text).toContain("позичена, не рідна");
    expect(text).toContain("Перк: <b>🧥 Чужа єгерська справа</b> (без бойової кнопки)");
    expect(text).toContain("✨ <b>Дія спорядження</b>");
    expect(text).toContain("<b>⚕️ Інструкція Асклепія</b> <i>(5 мани, перезарядка 4; позичена, не рідна)</i>");
    expect(text).not.toContain("<b>🧥 Чужа єгерська справа</b> <i>(");
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

  it("formats requirement denial callback text with safe item emphasis", () => {
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

    expect(text).toContain("Ще не екіпірується: <b>Плащ «Я Тут Випадково» +3</b>.");
    expect(text).toContain(
      "<b>Плащ «Я Тут Випадково» +3</b>.\n\nПотрібно: рівень 10+, клас: Бюрокрамант, походження: Людиноподібний."
    );
    expect(text).toContain(
      "Потрібно: рівень 10+, клас: Бюрокрамант, походження: Людиноподібний.\n\nЦе правило манатки, не помилка героя."
    );
    expect(text).not.toContain("<b><b>");
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

    expect(text).toContain("Ще не екіпірується: <b>Жетон Боргоманта +2</b>.");
    expect(text).toContain("Потрібно: клас: Бюрокромант.");
    expect(text).not.toContain("відповідний титул");
  });

  it("formats successful equipment callbacks as readable lines", () => {
    const text = presentEquipItemResult({
      state: "equipped",
      slot: "weapon",
      item: {
        itemId: "item.ability.last-page-rapier",
        content: {
          id: "item.ability.last-page-rapier",
          name: "Рапіра останньої сторінки",
          description: "Ставить фінальну крапку.",
          rarity: "epic",
          slot: "weapon",
          goldValue: 158,
          effect: {
            charisma: 1,
            luck: 1,
            weaponDamage: 4
          }
        }
      },
      replacedItem: {
        itemId: "item.set.red-line.left-dagger",
        content: {
          id: "item.set.red-line.left-dagger",
          name: "Кинджал червоного рядка",
          description: "Ріже правки.",
          rarity: "epic",
          slot: "weapon",
          goldValue: 120
        }
      },
      slots: [],
      achievementUnlocks: []
    });

    expect(text).toBe([
      "Екіпіровано: <b>Рапіра останньої сторінки</b>.",
      "Ефект: +1 Харизми · +1 Вдачі · +4 до удару.",
      "",
      "Попередня манатка зі слота <i>Основна рука</i> лишилася в торбі:",
      "<b>Кинджал червоного рядка</b>."
    ].join("\n"));
  });

  it("formats successful equipment callbacks with slot spacing when nothing is replaced", () => {
    const text = presentEquipItemResult({
      state: "equipped",
      slot: "weapon",
      item: {
        itemId: "item.yeger.last-notch-bow",
        content: {
          id: "item.yeger.last-notch-bow",
          name: "Лук останньої зарубки",
          description: "Пам'ятає, де була остання помилка.",
          rarity: "epic",
          slot: "weapon",
          goldValue: 158,
          effect: {
            dexterity: 2,
            weaponDamage: 5
          }
        }
      },
      replacedItem: null,
      slots: [],
      achievementUnlocks: []
    });

    expect(text).toBe([
      "Екіпіровано: <b>Лук останньої зарубки</b>.",
      "Ефект: +2 Спритности · +5 до удару.",
      "",
      "Слот: <i>Основна рука</i>."
    ].join("\n"));
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

    expect(text).toContain("Не екіпірується в слот <i>Друга рука</i>: <b>Печатка дрібної переваги</b>.");
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

    expect(text).toContain("Дворучна примірка: <b>Дворучна мітла протоколу</b> займе обидві руки.");
    expect(text).toContain("Звільниться: <b>Печатка дрібної переваги</b>.");
    expect(text).toContain("Звільниться: <b>Печатка дрібної переваги</b>.\n\nПідтвердити?");
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
