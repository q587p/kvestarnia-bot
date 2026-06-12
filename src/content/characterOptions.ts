import { classes } from "./classes";
import { activeRaces, races } from "./races";
import type { ClassContent, Pronoun, RaceContent } from "./schema";

export const pronounOptions = [
  { id: "he", label: "Він" },
  { id: "she", label: "Вона" },
  { id: "they", label: "Вони" }
] as const satisfies ReadonlyArray<{ id: Pronoun; label: string }>;

const GENERIC_RACE_UNAVAILABLE_REASON = "Цей варіянт вислизнув із вашої біографії.";
const GENERIC_CLASS_UNAVAILABLE_REASON =
  "Канцелярія персонажів не погодила таку комбінацію.";

const comboTitles = new Map<string, string>([
  [comboKey("race.human-ish", "class.warrior"), "Пересічний Герой"],
  [comboKey("race.human-ish", "class.bard"), "Самозваний Куплетоносець"],
  [comboKey("race.human-ish", "class.kharakternyk"), "Степовий Пояснювач"],
  [comboKey("race.human-ish", "class.varenyk-mancer"), "Начинковий Оптиміст"],
  [comboKey("race.human-ish", "class.bureaucramancer"), "Молодший Паперорухач"],
  [comboKey("race.dwarf", "class.warrior"), "Молотковий Аргумент"],
  [comboKey("race.dwarf", "class.ranger"), "Гірський Слідознавець"],
  [comboKey("race.dwarf", "class.bureaucramancer"), "Печатник Глибин"],
  [comboKey("race.elf", "class.mage"), "Довговухий Теоретик Вогню"],
  [comboKey("race.elf", "class.bard"), "Лютневий Довгожитель"],
  [comboKey("race.elf", "class.rogue"), "Естетичний Зникальник"],
  [comboKey("race.elf", "class.priest"), "Жрець Довгих Пояснень"],
  [comboKey("race.bisyny", "class.bard"), "Редакторський Жах Куплетів"],
  [comboKey("race.bisyny", "class.rogue"), "Коментатор Тіньового Проходу"],
  [comboKey("race.bisyny", "class.kharakternyk"), "Бісова Оселедцева Теорія"],
  [comboKey("race.bisyny", "class.varenyk-mancer"), "Начинковий Дискутант"],
  [comboKey("race.bisyny", "class.bureaucramancer"), "Бісова Правка Форми"],
  [comboKey("race.drantohor", "class.warrior"), "Остромазький Аргумент"],
  [comboKey("race.drantohor", "class.mage"), "Заблукалий Теоретик Іскор"],
  [comboKey("race.drantohor", "class.rogue"), "Межовий Обхідник"],
  [comboKey("race.drantohor", "class.kharakternyk"), "Межовий Заблуканець"],
  [comboKey("race.drantohor", "class.bureaucramancer"), "Гість Без Печатки"],
  [comboKey("race.drantohor", "class.ranger"), "Слідознавець Чужої Карти"],
  [comboKey("race.domovyk", "class.rogue"), "Завідувач Чужої Полиці"],
  [comboKey("race.domovyk", "class.priest"), "Пічний Благословитель"],
  [comboKey("race.domovyk", "class.bureaucramancer"), "Архівний Дух"],
  [comboKey("race.domovyk", "class.ranger"), "Слідопит Підпіччя"],
  [comboKey("race.dryland-rusalka", "class.mage"), "Чарівниця Сухої Калюжі"],
  [comboKey("race.dryland-rusalka", "class.bard"), "Співачка Без Моря"],
  [comboKey("race.dryland-rusalka", "class.priest"), "Жриця Чайникових Припливів"],
  [comboKey("race.dryland-rusalka", "class.varenyk-mancer"), "Сирена Сметани"],
  [comboKey("race.intellectual-orc", "class.warrior"), "Критик Прикладного Биття"],
  [comboKey("race.intellectual-orc", "class.mage"), "Кандидат Бойових Наук"],
  [comboKey("race.intellectual-orc", "class.priest"), "Етичний Зцілювач Кулаком"],
  [comboKey("race.intellectual-orc", "class.kharakternyk"), "Доцент Прикладного Туману"],
  [
    comboKey("race.intellectual-orc", "class.bureaucramancer"),
    "Завідувач Ударної Канцелярії"
  ],
  [comboKey("race.molfar-soul", "class.mage"), "Збирач Туману"],
  [comboKey("race.molfar-soul", "class.bard"), "Співець Туману з Довідкою"],
  [comboKey("race.molfar-soul", "class.rogue"), "Обереговий Зникальник"],
  [comboKey("race.molfar-soul", "class.priest"), "Пастир Малих Оберегів"],
  [comboKey("race.molfar-soul", "class.kharakternyk"), "Кум Туману"],
  [comboKey("race.molfar-soul", "class.bureaucramancer"), "Писар Оберегових Справ"]
]);

export function isPronoun(value: string | undefined): value is Pronoun {
  return pronounOptions.some((option) => option.id === value);
}

export function getPronounLabel(pronoun: Pronoun): string {
  return pronounOptions.find((option) => option.id === pronoun)?.label ?? pronoun;
}

export function findRace(raceId: string): RaceContent | undefined {
  return races.find((race) => race.id === raceId);
}

export function findClass(classId: string): ClassContent | undefined {
  return classes.find((characterClass) => characterClass.id === classId);
}

export function raceIdToKey(raceId: string): string {
  return raceId.replace(/^race\./, "");
}

export function classIdToKey(classId: string): string {
  return classId.replace(/^class\./, "");
}

export function raceKeyToId(key: string | undefined): string | undefined {
  if (!key) {
    return undefined;
  }

  return activeRaces.find((race) => race.id === `race.${key}`)?.id;
}

export function classKeyToId(key: string | undefined): string | undefined {
  if (!key) {
    return undefined;
  }

  return findClass(`class.${key}`)?.id;
}

export function isRaceAvailableForPronoun(pronoun: Pronoun, raceId: string): boolean {
  const race = findRace(raceId);

  if (!race) {
    return false;
  }

  return (
    race.availableInOnboarding !== false &&
    (!race.allowedPronouns || race.allowedPronouns.includes(pronoun))
  );
}

export function isClassAvailableForChoice(
  pronoun: Pronoun,
  raceId: string,
  classId: string
): boolean {
  const race = findRace(raceId);
  const characterClass = findClass(classId);

  if (!race || !characterClass || !isRaceAvailableForPronoun(pronoun, raceId)) {
    return false;
  }

  if (characterClass.allowedPronouns && !characterClass.allowedPronouns.includes(pronoun)) {
    return false;
  }

  if (race.allowedClasses && !race.allowedClasses.includes(classId)) {
    return false;
  }

  if (race.blockedClasses?.includes(classId)) {
    return false;
  }

  if (characterClass.allowedRaces && !characterClass.allowedRaces.includes(raceId)) {
    return false;
  }

  if (characterClass.blockedRaces?.includes(raceId)) {
    return false;
  }

  return true;
}

export function getRaceUnavailableReason(pronoun: Pronoun, raceId: string): string {
  const race = findRace(raceId);
  return race?.unavailableReasons?.[pronoun] ?? GENERIC_RACE_UNAVAILABLE_REASON;
}

export function getClassUnavailableReason(
  pronoun: Pronoun,
  raceId: string,
  classId: string
): string {
  const characterClass = findClass(classId);

  if (!isRaceAvailableForPronoun(pronoun, raceId)) {
    return getRaceUnavailableReason(pronoun, raceId);
  }

  return characterClass?.unavailableReasons?.[raceId] ?? GENERIC_CLASS_UNAVAILABLE_REASON;
}

export function getComboTitle(raceId: string, classId: string): string {
  return comboTitles.get(comboKey(raceId, classId)) ?? "Герой місцевого значення";
}

function comboKey(raceId: string, classId: string): string {
  return `${raceId}:${classId}`;
}
