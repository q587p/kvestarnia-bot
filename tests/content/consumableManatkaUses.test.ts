import { describe, expect, it } from "vitest";
import { items } from "../../src/content";
import {
  consumableManatkaUseDefinitions,
  medicalConsumableItemIds,
  supportedConsumableItemIds
} from "../../src/content/consumableManatkaUses";

describe("0.4.3 consumable manatka catalog", () => {
  it("pins the complete twenty-item allowlist and every nonmedical typed effect", () => {
    expect(medicalConsumableItemIds).toEqual([
      "item.responsible-panic-bandage",
      "item.dense-bandage",
      "item.field-kit"
    ]);
    expect(consumableManatkaUseDefinitions.map(({ itemId, name, useEffect, locations }) => ({
      itemId,
      name,
      useEffect,
      locations
    }))).toEqual([
      { itemId: "item.cellar.fancy-cheese", name: "Кльовий шмат сиру", useEffect: { kind: "evade-response" }, locations: ["solo-combat", "party-combat"] },
      { itemId: "item.cellar.foamy-mirage-bottle", name: "Пляшка Пінного Міражу", useEffect: { kind: "random-resource", amount: 13 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c001", name: "Борщ Упевненості", useEffect: { kind: "heal-hp", amount: 7 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c002", name: "Вареники Парного Бафу", useEffect: { kind: "paired-heal", amount: 8 }, locations: ["party-combat"] },
      { itemId: "item.loot-v1-c003", name: "Компот Після Бою", useEffect: { kind: "heal-hp", amount: 8 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c004", name: "Квас Несподіваної Сміливості", useEffect: { kind: "cleanse-negative", count: 1 }, locations: ["party-combat"] },
      { itemId: "item.loot-v1-c005", name: "Кава «Ще Один Квест»", useEffect: { kind: "reduce-cooldowns", turns: 1 }, locations: ["solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c006", name: "Чай «Заспокойся, Танку»", useEffect: { kind: "guard-response", reductionPercent: 42 }, locations: ["solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c007", name: "Пиріжок з Невідомим Лутом", useEffect: { kind: "random-resource", amount: 13 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c008", name: "Цукерка Критичного Шансу", useEffect: { kind: "critical-damage", amount: 13 }, locations: ["solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c009", name: "Сухарик Антиголоду", useEffect: { kind: "heal-hp", amount: 9 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c010", name: "Банка Огірків Відчаю", useEffect: { kind: "heal-hp-below-percent", amount: 23, thresholdPercent: 50 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c011", name: "Пляшка «Мана Чи Газировка»", useEffect: { kind: "random-resource", amount: 23 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c012", name: "Салат «Олів'є Рейдовий»", useEffect: { kind: "party-heal", amount: 13 }, locations: ["party-combat"] },
      { itemId: "item.loot-v1-c013", name: "Млинці Затьмарення", useEffect: { kind: "evade-response" }, locations: ["solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c014", name: "Насіння Диванного Друїда", useEffect: { kind: "restore-both", hpAmount: 9, manaAmount: 9 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
      { itemId: "item.loot-v1-c015", name: "Еліксир «Не Питай Склад»", useEffect: { kind: "random-resource", amount: 23, bothAmount: 13 }, locations: ["out-of-combat", "solo-combat", "party-combat"] }
    ]);
    expect(supportedConsumableItemIds).toHaveLength(20);
  });

  it("keeps the authored item rows synchronized with the explicit effect catalog", () => {
    for (const definition of consumableManatkaUseDefinitions) {
      expect(items.find((item) => item.id === definition.itemId)).toMatchObject({
        name: definition.name,
        slot: "consumable",
        useEffect: definition.useEffect
      });
    }
  });
});
