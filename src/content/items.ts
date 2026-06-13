import type { ItemContent } from "./schema";

export const items = [
  {
    id: "item.pan-of-persuasion",
    name: "Пательня переконання",
    description: "Важкий аргумент для легких суперечок.",
    rarity: "common",
    slot: "weapon",
    goldValue: 25
  },
  {
    id: "item.pot-helmet-of-early-access",
    name: "Шолом із каструлі раннього доступу",
    description: "Дзвенить як обладунок і натякає, що бонуси ще в дорозі.",
    rarity: "common",
    slot: "armor",
    goldValue: 18
  },
  {
    id: "item.wet-hero-ticket",
    name: "Квиток мокрого героя",
    description: "Трофей тавернової логістики. Трохи пахне перемогою і підлогою.",
    rarity: "common",
    slot: "junk",
    priceless: true
  },
  {
    id: "item.cheese-of-procedural-doubt",
    name: "Сир процедурного сумніву",
    description: "Сир маленький, але ставить великі питання до вашої пастки.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.bristle-of-basement-order",
    name: "Щетина підвального порядку",
    description: "Доказ, що підмітання теж може мати лут, якщо дуже наполягати.",
    rarity: "common",
    slot: "junk",
    goldValue: 1
  },
  {
    id: "item.napkin-of-mouse-diplomacy",
    name: "Серветка мишачої дипломатії",
    description: "Підписана лапкою. Юридична сила залежить від кількости сиру поруч.",
    rarity: "common",
    slot: "junk",
    priceless: true
  },
  {
    id: "item.suspicious-shawarma-wrapper",
    name: "Підозрілий лавашний доказ",
    description: "Доказ, що вечеря дивилася першою.",
    rarity: "common",
    slot: "junk",
    goldValue: 1
  },
  {
    id: "item.receipt-of-formal-suspicion",
    name: "Чек формальної підозри",
    description: "Папірець, перед яким навіть мімік поводиться пристойніше.",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  }
] satisfies ItemContent[];
