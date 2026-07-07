import { describe, expect, it } from "vitest";
import {
  presentItemDetail,
  presentOwnedItemDetail
} from "../../src/bot/presenters/itemDetailPresenter";
import { items } from "../../src/content";
import type { InventoryItemSummary } from "../../src/services/inventoryService";

describe("item detail presenter", () => {
  it("shows owned item details and marks junk as not equippable", () => {
    const text = presentItemDetail({
      state: "found",
      item: itemSummary({
        quantity: 2,
        content: {
          id: "item.wet-hero-ticket",
          name: "Квиток мокрого пригодника",
          description: "Трофей корчемної логістики.",
          rarity: "common",
          slot: "junk",
          priceless: true
        }
      })
    });

    expect(text).toContain("🔎 <b>Квиток мокрого пригодника</b>");
    expect(text).toContain("Рідкість: <b>звичайна</b>");
    expect(text).toContain("Категорія: <b>трофей / смішний доказ</b>");
    expect(text).toContain("Вартість: <i>безцінна</i>");
    expect(text).toContain("Кількість: <b>2</b>");
    expect(text).toContain("<i>Трофей корчемної логістики.</i>");
    expect(text).toContain("не вдягається");
    expect(text).not.toContain("Бойовий ефект");
    expect(text).not.toContain("Ефект:");
  });

  it("shows equippable wording and effects for weapon items", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
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
      })
    );

    expect(text).toContain("Категорія: <b>зброя</b>");
    expect(text).toContain("Вартість: <b>25 золота</b>");
    expect(text).toContain("Ефект: <b>+2 до удару</b>");
    expect(text).toContain("<i>Екіпірування</i>: можна екіпірувати у слот <i>«Основна рука»</i>");
    expect(text).not.toContain("бонуси поки лежать у бухгалтерії");
  });

  it("shows slot-specific wording for armor and accessories", () => {
    const armor = presentOwnedItemDetail(
      itemSummary({
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
      })
    );
    const accessory = presentOwnedItemDetail(
      itemSummary({
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
      })
    );

    expect(armor).toContain("Категорія: <b>обладунок</b>");
    expect(armor).toContain("Ефект: <b>+2 HP · +1 до захисту</b>");
    expect(armor).toContain("Манекен випростав плечі");
    expect(accessory).toContain("Категорія: <b>аксесуар</b>");
    expect(accessory).toContain("Ефект: <b>+1 Вдачі</b>");
    expect(accessory).toContain("Поличка для дрібних дивин обережно блищить");
  });

  it("shows leg gear as items for legs instead of generic armor", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
        content: {
          id: "item.loot-v1-a013",
          name: "Шкарпетки Невразливого Комфорту",
          description: "Береже ноги й право виглядати підозріло.",
          rarity: "common",
          slot: "armor",
          equipmentSlot: "legs",
          goldValue: 27,
          effect: {
            armor: 1,
            hpMax: 2
          }
        }
      })
    );

    expect(text).toContain("Категорія: <b>річ на ноги</b>");
    expect(text).toContain("<i>Екіпірування</i>: можна екіпірувати у слот <i>«Ноги»</i>");
    expect(text).toContain("Манекен виставив ногу");
    expect(text).not.toContain("Категорія: <b>обладунок</b>");
    expect(text).not.toContain("Манекен випростав плечі");
  });

  it("uses clear fallback flavor for consumables instead of future-system wording", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
        content: {
          id: "item.test-soup",
          name: "Суп службової паузи",
          description: "Ще не натискається, але пахне планом.",
          rarity: "common",
          slot: "consumable",
          goldValue: 3
        }
      })
    );

    expect(text).toContain("Екіпірування: <i>не вдягається. Це витратна манатка: її застосовують, а не приміряють.</i>");
    expect(text).toContain("Корчмар зважує манатку в руці");
    expect(text).toContain("перед витратою");
    expect(text).not.toContain("смішним трофеєм");
    expect(text).not.toContain("до якої полиці");
    expect(text).not.toContain("правила майбутнього спорядження");
  });

  it("describes Yeger notches as exchangeable marks instead of trophies", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
        content: {
          id: "item.yeger.first-notch",
          name: "Єгерська риска на дощечці",
          description: "Маленька риска, яка доводить: Єгер бачив вашу роботу.",
          rarity: "uncommon",
          slot: "cosmetic",
          priceless: true
        }
      })
    );

    expect(text).toContain("Єгер міняє такі риски на медичний запас");
    expect(text).toContain("після закритої другої дощечки");
    expect(text).toContain("інвентарна дипломатія");
    expect(text).not.toContain("смішним трофеєм");
    expect(text).not.toContain("до якої полиці");
  });

  it("shows combat use wording for usable consumables when a fight action is available", () => {
    const content: InventoryItemSummary["content"] = {
      id: "item.responsible-panic-bandage",
      name: "Бинт відповідальної паніки",
      description: "Намотаний так, ніби хтось уже вибачився перед майбутнім синцем.",
      rarity: "common",
      slot: "consumable",
      goldValue: 7,
      tags: ["consumable", "one-use", "trade-blocked", "duel-blocked"],
      useEffect: {
        kind: "heal-hp",
        amount: 7
      }
    };
    const text = presentOwnedItemDetail(
      itemSummary({ content }),
      {
        itemUse: { state: "usable", item: content },
        combatUseAvailable: true
      }
    );

    expect(text).toContain("Використання: <b>можна застосувати в бою або поза боєм</b>.");
    expect(text).toContain("У бою манатка витрачає хід і лікує одразу.");
    expect(text).toContain("Це витратна манатка: її застосовують, а не приміряють.");
    expect(text).not.toContain("смішним трофеєм");
    expect(text).not.toContain("до якої полиці");
    expect(text).not.toContain("Використання: <b>можна застосувати поза боєм</b>.");
  });

  it("does not describe responsible panic bandages as outside-combat-only", () => {
    const content: InventoryItemSummary["content"] = {
      id: "item.responsible-panic-bandage",
      name: "Бинт відповідальної паніки",
      description: "Намотаний так, ніби хтось уже вибачився перед майбутнім синцем.",
      rarity: "common",
      slot: "consumable",
      goldValue: 7,
      tags: ["consumable", "one-use", "trade-blocked", "duel-blocked"],
      useEffect: {
        kind: "heal-hp",
        amount: 7
      }
    };
    const text = presentOwnedItemDetail(
      itemSummary({ content }),
      {
        itemUse: { state: "usable", item: content }
      }
    );

    expect(text).toContain("Використання: <b>можна застосувати для лікування</b>.");
    expect(text).toContain("Попередній перегляд покаже поточне лікування перед витратою.");
    expect(text).not.toContain("можна застосувати поза боєм");
  });

  it("shows when an item is already equipped", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
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
      }),
      { equippedSlot: "weapon" }
    );

    expect(text).toContain("вдягнено");
    expect(text).toContain("Екіпірування: <b>вдягнено — основна рука</b>.");
    expect(text).not.toContain("вдягнено — Основна рука");
    expect(text).toContain("Ефект: <b>+2 до удару</b>");
    expect(text).not.toContain("Бонуси ще не рахуються");
  });

  it("shows Mantok set progress and next bonus on set item details", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
        itemId: "item.set.barrel-brother.helm",
        content: {
          id: "item.set.barrel-brother.helm",
          name: "Шолом бочкового дзвону",
          description:
            "Дзвенить часто. Частина комплекту «Бочковий панцир старшого Брата»: 1/4.",
          rarity: "epic",
          slot: "armor",
          equipmentSlot: "head",
          goldValue: 118,
          effect: {
            armor: 2,
            resist: 1
          }
        }
      }),
      {
        equippedSlot: "head",
        equippedItemIds: [
          "item.set.barrel-brother.helm",
          "item.set.barrel-brother.cuirass"
        ]
      }
    );

    expect(text).toContain("Комплект: <b>Бочковий панцир старшого Брата</b>");
    expect(text).toContain("Зараз вдягнено: <b>2/4</b>");
    expect(text).toContain("Активно: Обруч не питає <i>(+2 HP · +1 до захисту)</i>");
    expect(text).toContain("Далі: 3 частини — Бочка тримає форму <i>(+1 до опору)</i>");
  });

  it("uses lowercase equipment slot labels after equipped status dash", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
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
      }),
      { equippedSlot: "chest" }
    );

    expect(text).toContain("Екіпірування: <b>вдягнено — тулуб</b>.");
    expect(text).not.toContain("вдягнено — Тулуб");
  });

  it("shows concrete blocked equipment requirements in item details", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
        itemId: "item.loot-v1-x022-plus-2",
        content: {
          id: "item.loot-v1-x022-plus-2",
          name: "Жетон Боргоманта +2",
          description: "Маленька річ, великий привід сперечатися з балансом.",
          rarity: "rare",
          slot: "accessory",
          goldValue: 613,
          effect: {
            luck: 2,
            charisma: 3
          }
        }
      }),
      {
        equipPreview: {
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
          },
          slot: "accessory",
          currentItem: null
        }
      }
    );

    expect(text).toContain("Екіпірування: <i>зараз не можна екіпірувати.");
    expect(text).toContain("Потрібно: клас: Бюрокромант.");
    expect(text).not.toContain("Екіпірування: <i>можна екіпірувати");
    expect(text).not.toContain("Спорядження вже звільняє місце");
    expect(text).not.toContain("відповідний титул");
  });

  it("shows the current item effect when previewing a same-slot replacement", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
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
      }),
      {
        equipPreview: {
          state: "can-equip",
          slot: "chest",
          requirements: null,
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
          },
          currentItem: {
            itemId: "item.test-current-cloak",
            content: {
              id: "item.test-current-cloak",
              name: "Плащ «Я Тут Випадково» +2",
              description: "Висить так, ніби це алібі.",
              rarity: "uncommon",
              slot: "armor",
              goldValue: 42,
              effect: {
                dexterity: 2,
                armor: 1
              }
            }
          }
        }
      }
    );

    expect(text).toContain(
      "\nЗамінить: <b>Плащ «Я Тут Випадково» +2</b>; зараз дає: +2 Спритности · +1 до захисту."
    );
  });

  it("shows slot-specific equipment denials in item details", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
        itemId: "item.stamp-of-minor-authority",
        content: {
          id: "item.stamp-of-minor-authority",
          name: "Печатка дрібної переваги",
          description: "Б'є не сильно, зате залишає слід «розглянуто».",
          rarity: "uncommon",
          slot: "weapon",
          goldValue: 16
        }
      }),
      {
        equipPreview: {
          state: "slot-not-allowed",
          reason: "offhand-restricted",
          slot: "offhand",
          item: {
            itemId: "item.stamp-of-minor-authority",
            content: {
              id: "item.stamp-of-minor-authority",
              name: "Печатка дрібної переваги",
              description: "Б'є не сильно, зате залишає слід «розглянуто».",
              rarity: "uncommon",
              slot: "weapon",
              goldValue: 16
            }
          }
        }
      }
    );

    expect(text).toContain("Екіпірування: <i>у слот «Друга рука» зараз не можна:");
    expect(text).toContain("дві зброї Корчмар довіряє тільки воїнам");
  });

  it("shows twohand confirmation requirements in item details", () => {
    const text = presentOwnedItemDetail(
      itemSummary({
        itemId: "item.test-twohand-broom",
        content: {
          id: "item.test-twohand-broom",
          name: "Дворучна мітла протоколу",
          description: "Мете так переконливо.",
          rarity: "rare",
          slot: "weapon",
          tags: ["twohand"],
          goldValue: 93
        }
      }),
      {
        equipPreview: {
          state: "twohand-confirm-required",
          slot: "weapon",
          item: {
            itemId: "item.test-twohand-broom",
            content: {
              id: "item.test-twohand-broom",
              name: "Дворучна мітла протоколу",
              description: "Мете так переконливо.",
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
        }
      }
    );

    expect(text).toContain("<i>Екіпірування</i>: можна екіпірувати у слот <i>«Основна рука»</i>");
    expect(text).toContain("Печатка дрібної переваги лишиться в торбі");
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

  it("shows Mantok ability grants on item detail pages", () => {
    const content = items.find((item) => item.id === "item.set.red-line.left-dagger");
    expect(content).toBeDefined();
    if (!content) {
      throw new Error("Expected red-line dagger content.");
    }

    const text = presentOwnedItemDetail(itemSummary({ itemId: content.id, content }));

    expect(text).toContain("Дія спорядження: <b>🩸 Червоний рядок</b>");
    expect(text).toContain("рівень 10+");
    expect(text).toContain("1 мани");
    expect(text).toContain("перезарядка 3 ходи");
  });

  it("distinguishes borrowed gear actions and service perks on item detail pages", () => {
    const staff = items.find((item) => item.id === "item.set.asclepius.staff");
    const cloak = items.find((item) => item.id === "item.set.yeger-shadow.cloak");
    expect(staff).toBeDefined();
    expect(cloak).toBeDefined();
    if (!staff || !cloak) {
      throw new Error("Expected Mantok ability grant items.");
    }

    const staffText = presentOwnedItemDetail(itemSummary({ itemId: staff.id, content: staff }));
    const cloakText = presentOwnedItemDetail(itemSummary({ itemId: cloak.id, content: cloak }));

    expect(staffText).toContain("Дія спорядження: <b>⚕️ Інструкція Асклепія</b>");
    expect(staffText).toContain("Позичена від: Жрець; не рахується рідною дією.");
    expect(cloakText).toContain("Перк спорядження: <b>🧥 Чужа єгерська справа</b>");
    expect(cloakText).toContain("Зараз це службова позначка без бойової кнопки.");
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
      name: "Квиток мокрого пригодника",
      description: "Трофей корчемної логістики.",
      rarity: "common",
      slot: "junk",
      priceless: true
    },
    ...overrides
  };
}
