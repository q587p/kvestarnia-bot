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
    id: "item.stamp-of-minor-authority",
    name: "Печатка дрібної переваги",
    description: "Б'є не сильно, зате залишає слід «розглянуто» там, де монстр просив «не треба».",
    rarity: "uncommon",
    slot: "weapon",
    goldValue: 16
  },
  {
    id: "item.apron-of-foam-resistance",
    name: "Фартух піностійкого героя",
    description: "Пережив бочку, підлогу й погляд корчмаря. Тепер вимагає окремого гачка.",
    rarity: "common",
    slot: "armor",
    goldValue: 14
  },
  {
    id: "item.barrel-splinter-of-optimism",
    name: "Скіпка бочкового оптимізму",
    description: "Маленька, гостра й переконана, що це вона перемогла рейд.",
    rarity: "common",
    slot: "junk",
    goldValue: 1
  },
  {
    id: "item.foam-cork-of-accounting",
    name: "Корок пінного переобліку",
    description: "Його дістали з бочки під час ревізії. Корок наполягає, що був аудитором.",
    rarity: "common",
    slot: "junk",
    goldValue: 2
  },
  {
    id: "item.mirage-foam-sample",
    name: "Зразок піни з характером",
    description: "Піна тримає форму, позицію й образу на всіх, хто називає її «просто піною».",
    rarity: "common",
    slot: "junk",
    goldValue: 3
  },
  {
    id: "item.cork-ring-of-serious-business",
    name: "Корковий перстень серйозних справ",
    description: "Миша сказала, що це печатка. Корок не заперечив, бо зайнятий кар'єрою.",
    rarity: "common",
    slot: "accessory",
    goldValue: 6
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
