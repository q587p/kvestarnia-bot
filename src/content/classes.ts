import type { ClassContent } from "./schema";

export const classes = [
  {
    id: "class.warrior",
    name: "Воїн",
    description: "Простий план: стояти рівно й переконливо махати залізом.",
    primaryStat: "strength"
  },
  {
    id: "class.mage",
    name: "Маг",
    description: "Каже складні слова, після яких у кімнаті стає гарячіше.",
    primaryStat: "intelligence"
  },
  {
    id: "class.bard",
    name: "Бард",
    description: "Перемагає харизмою, куплетами й небезпечною впевненістю.",
    primaryStat: "charisma"
  },
  {
    id: "class.rogue",
    name: "Злодій",
    description: "Зникає швидше, ніж рахунок після походу в таверну.",
    primaryStat: "dexterity"
  },
  {
    id: "class.priest",
    name: "Жрець",
    description: "Лікує союзників і суворо дивиться на нежить.",
    primaryStat: "charisma"
  },
  {
    id: "class.varenyk-mancer",
    name: "Вареник-мант",
    description: "Керує тістом, долею й легким відчуттям ситості.",
    primaryStat: "intelligence"
  },
  {
    id: "class.bureaucramancer",
    name: "Бюрокромант",
    description: "Знерухомлює ворогів формами, печатками й дуже серйозним виглядом.",
    primaryStat: "intelligence"
  },
  {
    id: "class.ranger",
    name: "Єгер",
    description: "Знає стежки, пастки й де ховається ваша остання стріла.",
    primaryStat: "dexterity"
  }
] satisfies ClassContent[];
