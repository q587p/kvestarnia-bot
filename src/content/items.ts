import type { ItemContent } from "./schema";

export const items = [
  {
    id: "item.pan-of-persuasion",
    name: "Пательня переконання",
    description: "Важкий аргумент для легких суперечок.",
    rarity: "common",
    slot: "weapon"
  },
  {
    id: "item.wet-hero-ticket",
    name: "Квиток мокрого героя",
    description: "Трофей тавернової логістики. Трохи пахне перемогою і підлогою.",
    rarity: "common",
    slot: "junk"
  },
  {
    id: "item.suspicious-shawarma-wrapper",
    name: "Підозрілий лавашний доказ",
    description: "Доказ, що вечеря дивилася першою.",
    rarity: "common",
    slot: "junk"
  },
  {
    id: "item.receipt-of-formal-suspicion",
    name: "Чек формальної підозри",
    description: "Папірець, перед яким навіть мімік поводиться пристойніше.",
    rarity: "common",
    slot: "junk"
  }
] satisfies ItemContent[];
