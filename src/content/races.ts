import type { RaceContent } from "./schema";

export const races = [
  {
    id: "race.human-ish",
    name: "Людисько",
    description: "Трохи до всього, бо якось воно буде.",
    statBonus: {
      strength: 1,
      dexterity: 1,
      intelligence: 1,
      charisma: 1,
      luck: 1
    }
  },
  {
    id: "race.dwarf",
    name: "Гном",
    description: "Стійкий до ударів, боргів і високих полиць.",
    statBonus: {
      strength: 2,
      dexterity: 0,
      intelligence: 0,
      charisma: 0,
      luck: 1
    }
  },
  {
    id: "race.elf",
    name: "Ельф",
    description: "Влучний, драматичний і трохи ображений на стан ваших чобіт.",
    statBonus: {
      strength: 0,
      dexterity: 2,
      intelligence: 1,
      charisma: 0,
      luck: 0
    }
  },
  {
    id: "race.kharakternyk",
    name: "Козак-характерник",
    description: "Містика, вдача й погляд, після якого ворог згадує справи вдома.",
    statBonus: {
      strength: 1,
      dexterity: 0,
      intelligence: 0,
      charisma: 0,
      luck: 2
    }
  },
  {
    id: "race.domovyk",
    name: "Домовик",
    description: "Знаходить дрібний лут там, де інші знаходять лише пил.",
    statBonus: {
      strength: 0,
      dexterity: 1,
      intelligence: 0,
      charisma: 1,
      luck: 1
    }
  },
  {
    id: "race.dryland-rusalka",
    name: "Русалка сухопутна",
    description: "Магічна, харизматична й підозріло уважна до чайників.",
    statBonus: {
      strength: 0,
      dexterity: 0,
      intelligence: 2,
      charisma: 1,
      luck: 0
    }
  },
  {
    id: "race.intellectual-orc",
    name: "Орк-інтелігент",
    description: "Сила з дипломом і аргументами, які краще не ловити обличчям.",
    statBonus: {
      strength: 2,
      dexterity: 0,
      intelligence: 1,
      charisma: 0,
      luck: 0
    }
  },
  {
    id: "race.scholar-cat",
    name: "Кіт учений",
    description: "Мудрий, везучий і слухає команди тільки коли це збігається з планом.",
    statBonus: {
      strength: 0,
      dexterity: 0,
      intelligence: 1,
      charisma: 0,
      luck: 2
    }
  }
] satisfies RaceContent[];
