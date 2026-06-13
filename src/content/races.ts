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
    },
    allowedPronouns: ["he", "she", "they"]
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
    },
    allowedPronouns: ["he", "she", "they"]
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
    },
    allowedPronouns: ["he", "she", "they"]
  },
  {
    id: "race.bisyny",
    name: "Бісини",
    description:
      "Кажуть, назву колись занесло з однієї великої брами. Відтоді словники в таверні тримають під замком.",
    statBonus: {
      dexterity: 1,
      intelligence: 1,
      charisma: 1
    },
    allowedPronouns: ["he", "she", "they"]
  },
  {
    id: "race.drantohor",
    name: "Дрантогор",
    description:
      "Заблукав із Королівства Остромаг і робить вигляд, що це був план. Межа підписала пропуск заднім числом.",
    statBonus: {
      strength: 1,
      luck: 2
    },
    allowedPronouns: ["they"],
    unavailableReasons: {
      he: "Дрантогори приходять тільки стежками Межі. Пряма біографія їх не наздоганяє.",
      she: "Дрантогори приходять тільки стежками Межі. Пряма біографія їх не наздоганяє."
    }
  },
  {
    id: "race.kharakternyk",
    name: "Козак-характерник",
    description:
      "Deprecated fallback для старих персонажів. Нові характерники тепер обираються як клас.",
    statBonus: {
      strength: 1,
      dexterity: 0,
      intelligence: 0,
      charisma: 0,
      luck: 2
    },
    allowedPronouns: ["he", "they"],
    availableInOnboarding: false,
    unavailableReasons: {
      she: "Канцелярія персонажів каже: характерниця буде окремим пригодницьким папером."
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
    },
    allowedPronouns: ["he", "they"],
    unavailableReasons: {
      she: "Домовичка ще перевіряє, чи ця хата достатньо затишна для альфи."
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
    },
    allowedPronouns: ["she", "they"],
    unavailableReasons: {
      he: "Сухопутна русалка подивилась на анкету й сказала: «Ні, хвіст уявний, але принципи реальні»."
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
    },
    allowedPronouns: ["he", "she", "they"]
  },
  {
    id: "race.molfar-soul",
    name: "Мольфарська душа",
    description: "Носить у кишені оберіг, у голові туман, а в кишені ще один оберіг.",
    statBonus: {
      strength: 0,
      dexterity: 0,
      intelligence: 1,
      charisma: 0,
      luck: 2
    },
    allowedPronouns: ["he", "she", "they"]
  }
] satisfies RaceContent[];

export const activeRaces = races.filter((race) => race.availableInOnboarding !== false);
