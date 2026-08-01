import type { ItemUseEffectContent } from "./schema";

export interface ConsumableManatkaUseDefinition {
  itemId: string;
  baseId?: `c${string}`;
  name: string;
  icon: string;
  description: string;
  useEffect: ItemUseEffectContent;
  locations: readonly ("out-of-combat" | "solo-combat" | "party-combat")[];
}

export const consumableManatkaUseDefinitions = [
  { itemId: "item.cellar.fancy-cheese", name: "Кльовий шмат сиру", icon: "🧀", description: "У бою відволікає супротивника запахом: його найближча відповідь не влучає.", useEffect: { kind: "evade-response" }, locations: ["solo-combat", "party-combat"] },
  { itemId: "item.cellar.foamy-mirage-bottle", name: "Пляшка Пінного Міражу", icon: "🍾", description: "Навмання повертає 13 HP або 13 мани. Результат визначається один раз.", useEffect: { kind: "random-resource", amount: 13 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
  { baseId: "c001", itemId: "item.loot-v1-c001", name: "Борщ Упевненості", icon: "🍲", description: "Повертає рівно 7 HP, але не вище поточного максимуму.", useEffect: { kind: "heal-hp", amount: 7 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
  { baseId: "c002", itemId: "item.loot-v1-c002", name: "Вареники Парного Бафу", icon: "🥟", description: "У гуртовому бою повертають по 8 HP власникові та одному найбільш побитому союзникові.", useEffect: { kind: "paired-heal", amount: 8 }, locations: ["party-combat"] },
  { baseId: "c003", itemId: "item.loot-v1-c003", name: "Компот Після Бою", icon: "🧃", description: "Повертає рівно 8 HP, але не вище поточного максимуму.", useEffect: { kind: "heal-hp", amount: 8 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
  { baseId: "c004", itemId: "item.loot-v1-c004", name: "Квас Несподіваної Сміливості", icon: "🍺", description: "У гуртовому бою знімає один знімний негативний ефект із власника.", useEffect: { kind: "cleanse-negative", count: 1 }, locations: ["party-combat"] },
  { baseId: "c005", itemId: "item.loot-v1-c005", name: "Кава «Ще Один Квест»", icon: "☕", description: "У бою скорочує чинні власні відкати прийомів на один хід.", useEffect: { kind: "reduce-cooldowns", turns: 1 }, locations: ["solo-combat", "party-combat"] },
  { baseId: "c006", itemId: "item.loot-v1-c006", name: "Чай «Заспокойся, Танку»", icon: "🍵", description: "У бою зменшує найближчу відповідь ворога на 42%. Діє лише цього ходу.", useEffect: { kind: "guard-response", reductionPercent: 42 }, locations: ["solo-combat", "party-combat"] },
  { baseId: "c007", itemId: "item.loot-v1-c007", name: "Пиріжок з Невідомим Лутом", icon: "🥧", description: "Навмання повертає 13 HP або 13 мани. Начинка визначається один раз.", useEffect: { kind: "random-resource", amount: 13 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
  { baseId: "c008", itemId: "item.loot-v1-c008", name: "Цукерка Критичного Шансу", icon: "🍬", description: "У бою завдає поточній цілі 13 критичної шкоди й витрачає хід.", useEffect: { kind: "critical-damage", amount: 13 }, locations: ["solo-combat", "party-combat"] },
  { baseId: "c009", itemId: "item.loot-v1-c009", name: "Сухарик Антиголоду", icon: "🥨", description: "Повертає рівно 9 HP, але не вище поточного максимуму.", useEffect: { kind: "heal-hp", amount: 9 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
  { baseId: "c010", itemId: "item.loot-v1-c010", name: "Банка Огірків Відчаю", icon: "🥒", description: "Повертає 23 HP лише коли лишилося не більш як половина максимального HP.", useEffect: { kind: "heal-hp-below-percent", amount: 23, thresholdPercent: 50 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
  { baseId: "c011", itemId: "item.loot-v1-c011", name: "Пляшка «Мана Чи Газировка»", icon: "🫧", description: "Навмання повертає 23 HP або 23 мани. Результат визначається один раз.", useEffect: { kind: "random-resource", amount: 23 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
  { baseId: "c012", itemId: "item.loot-v1-c012", name: "Салат «Олів'є Рейдовий»", icon: "🥗", description: "У гуртовому бою повертає 13 HP кожному живому учасникові ватаги або рейду.", useEffect: { kind: "party-heal", amount: 13 }, locations: ["party-combat"] },
  { baseId: "c013", itemId: "item.loot-v1-c013", name: "Млинці Затьмарення", icon: "🥞", description: "У бою гарантують ухилення від найближчої відповіді ворога цього ходу.", useEffect: { kind: "evade-response" }, locations: ["solo-combat", "party-combat"] },
  { baseId: "c014", itemId: "item.loot-v1-c014", name: "Насіння Диванного Друїда", icon: "🌱", description: "Повертає власникові по 9 HP і мани, кожен ресурс — до свого максимуму.", useEffect: { kind: "restore-both", hpAmount: 9, manaAmount: 9 }, locations: ["out-of-combat", "solo-combat", "party-combat"] },
  { baseId: "c015", itemId: "item.loot-v1-c015", name: "Еліксир «Не Питай Склад»", icon: "⚗️", description: "Навмання повертає 23 HP, 23 мани або по 13 обох ресурсів. Результат визначається один раз.", useEffect: { kind: "random-resource", amount: 23, bothAmount: 13 }, locations: ["out-of-combat", "solo-combat", "party-combat"] }
] as const satisfies readonly ConsumableManatkaUseDefinition[];

export const generatedConsumableUseDefinitions = consumableManatkaUseDefinitions.filter(
  (entry): entry is typeof entry & { baseId: `c${string}` } => "baseId" in entry
);

const byBaseId = new Map<string, ConsumableManatkaUseDefinition>(generatedConsumableUseDefinitions.map((entry) => [entry.baseId, entry]));
const byItemId = new Map<string, ConsumableManatkaUseDefinition>(consumableManatkaUseDefinitions.map((entry) => [entry.itemId, entry]));

export function findGeneratedConsumableUseByBaseId(baseId: string): ConsumableManatkaUseDefinition | undefined {
  return byBaseId.get(baseId);
}

export function findGeneratedConsumableUseByItemId(itemId: string): ConsumableManatkaUseDefinition | undefined {
  return byItemId.get(itemId);
}

export function findConsumableManatkaUse(itemId: string): ConsumableManatkaUseDefinition | undefined {
  return byItemId.get(itemId);
}

export const generatedConsumableUseItemIds = generatedConsumableUseDefinitions.map((entry) => entry.itemId);

export const medicalConsumableItemIds = [
  "item.responsible-panic-bandage",
  "item.dense-bandage",
  "item.field-kit"
] as const;

export const supportedConsumableItemIds = [
  ...medicalConsumableItemIds,
  ...consumableManatkaUseDefinitions.map((entry) => entry.itemId)
] as const;

export function isMedicalConsumableItemId(itemId: string): boolean {
  return (medicalConsumableItemIds as readonly string[]).includes(itemId);
}

export function validateConsumableManatkaUseCoverage(
  itemContents: readonly { id: string; slot: string }[]
): string[] {
  const authoredConsumables = itemContents
    .filter((item) => item.slot === "consumable")
    .map((item) => item.id);
  const supported = new Set<string>(supportedConsumableItemIds);
  const authored = new Set<string>(authoredConsumables);

  return [
    ...authoredConsumables
      .filter((itemId) => !supported.has(itemId))
      .map((itemId) => `Consumable ${itemId} has no explicit 0.4.3 use mapping.`),
    ...supportedConsumableItemIds
      .filter((itemId) => !authored.has(itemId))
      .map((itemId) => `Mapped consumable ${itemId} is missing from the item catalog.`)
  ];
}
