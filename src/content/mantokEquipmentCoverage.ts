import type { ItemContent } from "./schema";

export const mantokEquipmentCoverageItems = [
  {
    id: "item.mantok.coverage-twohand-rake",
    name: "Граблі прямого протоколу",
    description:
      "Доводять, що іноді аргумент має держак, зубці й окреме місце в журналі травматизму.",
    rarity: "uncommon",
    slot: "weapon",
    equipmentSlot: "weapon",
    tags: ["twohand"],
    equipmentRequirements: {
      classIds: ["class.warrior"]
    },
    goldValue: 93,
    effect: {
      weaponDamage: 3,
      strength: 1
    }
  },
  {
    id: "item.mantok.coverage-politeness-lid",
    name: "Кришка чемного заперечення",
    description:
      "Не зовсім щит, але дуже переконливо каже «ні» всьому, що летить у другу руку.",
    rarity: "common",
    slot: "armor",
    equipmentSlot: "offhand",
    tags: ["offhand"],
    equipmentRequirements: {
      raceIds: ["race.dwarf"]
    },
    goldValue: 42,
    effect: {
      armor: 1,
      luck: 1
    }
  },
  {
    id: "item.mantok.coverage-queue-cap",
    name: "Картуз чергового по гачках",
    description: "Сидить на голові так офіційно, що волосся саме подає заяву.",
    rarity: "common",
    slot: "armor",
    equipmentSlot: "head",
    goldValue: 23,
    effect: {
      armor: 1,
      charisma: 1
    }
  },
  {
    id: "item.mantok.coverage-apron-of-small-audit",
    name: "Фартух малого аудиту",
    description: "Захищає тулуб від соусу, пилу й запитань без номера форми.",
    rarity: "common",
    slot: "armor",
    equipmentSlot: "chest",
    goldValue: 23,
    effect: {
      armor: 1,
      hpMax: 2
    }
  },
  {
    id: "item.mantok.coverage-knee-clerk",
    name: "Поножі колінного писаря",
    description: "Коліна отримали власного писаря й тепер згинаються тільки після резолюції.",
    rarity: "common",
    slot: "armor",
    equipmentSlot: "legs",
    equipmentRequirements: {
      titleLabels: ["Молотковий Аргумент", "Молоткова Аргументація", "Молоткові Аргументи"]
    },
    goldValue: 42,
    effect: {
      armor: 1,
      dexterity: 1
    }
  },
  {
    id: "item.mantok.coverage-button-of-witnessing",
    name: "Ґудзик урочистого свідчення",
    description: "Нічого не застібає, зате завжди підтверджує, що бачив усе першим.",
    rarity: "common",
    slot: "accessory",
    equipmentSlot: "accessory",
    goldValue: 13,
    effect: {
      luck: 1
    }
  },
  {
    id: "item.mantok.coverage-measuring-spoon",
    name: "Мірна ложка польового обліку",
    description: "Відміряє рівно стільки користі, скільки влазить у кишеню без окремого наказу.",
    rarity: "common",
    slot: "accessory",
    equipmentSlot: "tool",
    goldValue: 23,
    effect: {
      intelligence: 1,
      luck: 1
    }
  }
] satisfies ItemContent[];
