import type { ItemContent } from "./schema";
import { lootExpansionV1ItemContents } from "./lootExpansionV1";
import { mantokAbilityGrantItemContents } from "./mantokAbilityGrants";
import { mantokEquipmentCoverageItems } from "./mantokEquipmentCoverage";
import { mantokSetItemContents } from "./mantokSetItems";
import { monsterLootItemAdditions } from "./monsterLootItems";
import { monsterTrophyItemAdditions } from "./monsterTrophyCoverage";
import { buildItemUpgradeVariantContents } from "../domain/itemUpgrades";

const authoredItemContents = [
  {
    id: "item.pan-of-persuasion",
    name: "Пательня переконання",
    description: "Важкий аргумент для легких суперечок.",
    rarity: "common",
    slot: "weapon",
    equipmentSlot: "weapon",
    goldValue: 25,
    effect: {
      weaponDamage: 2
    }
  },
  {
    id: "item.pot-helmet-of-early-access",
    name: "Шолом із каструлі раннього доступу",
    description: "Дзвенить як обладунок і натякає, що бонуси ще в дорозі.",
    rarity: "common",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 18,
    effect: {
      armor: 1
    }
  },
  {
    id: "item.stamp-of-minor-authority",
    name: "Печатка дрібної переваги",
    description: "Б'є не сильно, зате залишає слід «розглянуто» там, де монстр просив «не треба».",
    rarity: "uncommon",
    slot: "weapon",
    equipmentSlot: "weapon",
    goldValue: 16,
    effect: {
      weaponDamage: 1,
      intelligence: 1
    }
  },
  {
    id: "item.apron-of-foam-resistance",
    name: "Фартух піностійкого пригодника",
    description: "Пережив бочку, підлогу й погляд корчмаря. Тепер вимагає окремого гачка.",
    rarity: "common",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 14,
    effect: {
      armor: 1,
      hpMax: 2
    }
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
    equipmentSlot: "accessory",
    goldValue: 6,
    effect: {
      dexterity: 1
    }
  },
  {
    id: "item.persten-pyvovladdia",
    name: "Перстень Пивовладдя",
    description: "Не робить невидимим. Просто додає +1 до Вдачі й нагадує, що великі пригоди іноді починаються з малого кухля.",
    rarity: "common",
    slot: "accessory",
    equipmentSlot: "accessory",
    equipmentRequirements: {
      minLevel: 2
    },
    goldValue: 4,
    effect: {
      luck: 1
    }
  },
  {
    id: "item.wet-hero-ticket",
    name: "Квиток мокрого пригодника",
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
    name: "Щетина льохового порядку",
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
  },
  {
    id: "item.badge-of-thirteen-small-problems",
    name: "Жетон тринадцяти дрібних проблем",
    description: "На вигляд серйозний. На дотик — доказ, що корчмар вміє рахувати до тринадцяти й далі не хоче.",
    rarity: "common",
    slot: "cosmetic",
    goldValue: 13
  },
  {
    id: "item.apophenia-receipt-of-twenty-three",
    name: "Квитанція двадцяти трьох підозрілих збігів",
    description: "Корчмар каже, що це просто облік. Квитанція підморгує кожною другою-третьою цифрою.",
    rarity: "uncommon",
    slot: "cosmetic",
    goldValue: 23
  },
  {
    id: "item.towel-of-forty-two-answers",
    name: "Рушничок сорока двох відповідей",
    description: "Офіційно серветка. Неофіційно — відповідь, яку Корчмар радить не губити під час проблем.",
    rarity: "rare",
    slot: "cosmetic",
    goldValue: 42
  },
  {
    id: "item.poster-of-ninety-three-problem-wills",
    name: "Плакат волі до девʼяноста трьох проблем",
    description: "Мотивує любити процедуру рівно настільки, щоб вона нарешті відчепилася.",
    rarity: "rare",
    slot: "cosmetic",
    goldValue: 93
  },
  {
    id: "item.cellar.cheese-seal",
    name: "Сирна пломба Корчмаря",
    description: "Восково-сирна печатка, яка переконує мишу, що це вже не її відділ.",
    rarity: "uncommon",
    slot: "junk",
    priceless: true
  },
  {
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
  },
  {
    id: "item.dense-bandage",
    name: "Щільний бинт",
    description: "Вісім бинтів, які домовилися триматися разом навіть під поглядом єгеря.",
    rarity: "uncommon",
    slot: "consumable",
    goldValue: 56,
    tags: ["consumable", "one-use", "trade-blocked", "duel-blocked"],
    useEffect: {
      kind: "heal-hp",
      amount: 42
    }
  },
  {
    id: "item.field-kit",
    name: "Польова аптечка",
    description: "Корчмар назвав це «польовим» лише тому, що стіл уже був зайнятий. Підтягує HP до майже пристойного стану.",
    rarity: "uncommon",
    slot: "consumable",
    goldValue: 91,
    tags: ["consumable", "one-use", "trade-blocked", "duel-blocked"],
    useEffect: {
      kind: "heal-hp-to-min-percent",
      percent: 93
    }
  },
  {
    id: "item.cellar.fancy-cheese",
    name: "Кльовий шмат сиру",
    description: "Дипломатичний аргумент із запахом, який важко оскаржити без ложки.",
    rarity: "uncommon",
    slot: "consumable",
    goldValue: 420
  },
  {
    id: "item.cellar.foamy-mirage-bottle",
    name: "Пляшка Пінного Міражу",
    description: "Не стільки стоїть на полиці, скільки тримає полицю в тонусі.",
    rarity: "rare",
    slot: "consumable",
    priceless: true
  },
  {
    id: "item.apology.rollback-receipt",
    name: "Квитанція відкоченої міграції",
    description:
      "Папірець, який доводить: корчмар теж уміє сказати «ой» офіційним тоном.",
    rarity: "common",
    slot: "junk",
    goldValue: 99
  },
  {
    id: "item.apology.redeploy-cork",
    name: "Корок повторного деплою",
    description: "Ним заткнули діру в реальності. Тепер корок вимагає рядок у changelog.",
    rarity: "common",
    slot: "junk",
    goldValue: 101
  },
  {
    id: "item.apology.p3009-stamp",
    name: "Печатка P3009 «Уже лагодимо»",
    description: "Ставиться на технічні збої, міграційні нерви й корчмареві пояснювальні.",
    rarity: "uncommon",
    slot: "cosmetic",
    goldValue: 113
  },
  {
    id: "item.iskrokamin",
    name: "Іскрокамінь",
    description: "Малий камінець, який світиться так, ніби вже підписав техніку безпеки замість вас.",
    rarity: "uncommon",
    slot: "resource",
    priceless: true,
    tags: ["tradeable"]
  },
  {
    id: "item.yeger.first-notch",
    name: "Єгерська риска на дощечці",
    description: "Маленька риска, яка доводить: Єгер бачив вашу роботу й не повністю заперечує її існування.",
    rarity: "uncommon",
    slot: "cosmetic",
    priceless: true
  },
] satisfies ItemContent[];

const upgradeBaseItemContents = [
  ...authoredItemContents,
  ...mantokEquipmentCoverageItems,
  ...mantokSetItemContents,
  ...mantokAbilityGrantItemContents,
  ...monsterLootItemAdditions,
  ...monsterTrophyItemAdditions
] satisfies ItemContent[];

export const items = [
  ...upgradeBaseItemContents,
  ...buildItemUpgradeVariantContents(upgradeBaseItemContents),
  ...lootExpansionV1ItemContents
] satisfies ItemContent[];
