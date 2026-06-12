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

type ComboTitle = Readonly<Record<Pronoun, string>>;

const fallbackTitles = {
  he: "Герой місцевого значення",
  she: "Героїня місцевого значення",
  they: "Герої місцевого значення"
} as const satisfies ComboTitle;

const comboTitles = new Map<string, ComboTitle>([
  [
    comboKey("race.human-ish", "class.warrior"),
    title("Пересічний Герой", "Пересічна Героїня", "Пересічні Герої")
  ],
  [
    comboKey("race.human-ish", "class.bard"),
    title("Самозваний Куплетоносець", "Самозвана Куплетоносиця", "Самозвані Куплетоносці")
  ],
  [
    comboKey("race.human-ish", "class.kharakternyk"),
    title("Степовий Пояснювач", "Степова Пояснювачка", "Степові Пояснювачі")
  ],
  [
    comboKey("race.human-ish", "class.varenyk-mancer"),
    title("Начинковий Оптиміст", "Начинкова Оптимістка", "Начинкові Оптимісти")
  ],
  [
    comboKey("race.human-ish", "class.bureaucramancer"),
    title("Молодший Паперорухач", "Молодша Паперорухачка", "Молодші Паперорухачі")
  ],
  [
    comboKey("race.dwarf", "class.warrior"),
    title("Молотковий Аргумент", "Молоткова Аргументація", "Молоткові Аргументи")
  ],
  [
    comboKey("race.dwarf", "class.ranger"),
    title("Гірський Слідознавець", "Гірська Слідознавиця", "Гірські Слідознавці")
  ],
  [comboKey("race.dwarf", "class.bureaucramancer"), title("Печатник Глибин", "Печатниця Глибин", "Печатники Глибин")],
  [
    comboKey("race.elf", "class.mage"),
    title("Довговухий Теоретик Вогню", "Довговуха Теоретикиня Вогню", "Довговухі Теоретики Вогню")
  ],
  [
    comboKey("race.elf", "class.bard"),
    title("Лютневий Довгожитель", "Лютнева Довгожителька", "Лютневі Довгожителі")
  ],
  [
    comboKey("race.elf", "class.rogue"),
    title("Естетичний Зникальник", "Естетична Зникальниця", "Естетичні Зникальники")
  ],
  [
    comboKey("race.elf", "class.priest"),
    title("Жрець Довгих Пояснень", "Жриця Довгих Пояснень", "Жерці Довгих Пояснень")
  ],
  [
    comboKey("race.bisyny", "class.bard"),
    title("Редакторський Жах Куплетів", "Редакторська Кара Куплетів", "Редакторські Жахи Куплетів")
  ],
  [
    comboKey("race.bisyny", "class.rogue"),
    title("Коментатор Тіньового Проходу", "Коментаторка Тіньового Проходу", "Коментатори Тіньового Проходу")
  ],
  [
    comboKey("race.bisyny", "class.kharakternyk"),
    title("Бісова Оселедцева Теорія", "Бісова Оселедцева Теорія", "Бісові Оселедцеві Теорії")
  ],
  [
    comboKey("race.bisyny", "class.varenyk-mancer"),
    title("Начинковий Дискутант", "Начинкова Дискутантка", "Начинкові Дискутанти")
  ],
  [
    comboKey("race.bisyny", "class.bureaucramancer"),
    title("Бісова Правка Форми", "Бісова Правка Форми", "Бісові Правки Форми")
  ],
  [
    comboKey("race.drantohor", "class.warrior"),
    title("Остромазький Аргумент", "Остромазька Аргументація", "Остромазькі Аргументи")
  ],
  [
    comboKey("race.drantohor", "class.mage"),
    title("Заблукалий Теоретик Іскор", "Заблукала Теоретикиня Іскор", "Заблукалі Теоретики Іскор")
  ],
  [
    comboKey("race.drantohor", "class.rogue"),
    title("Межовий Обхідник", "Межова Обхідниця", "Межові Обхідники")
  ],
  [
    comboKey("race.drantohor", "class.kharakternyk"),
    title("Межовий Заблуканець", "Межова Заблукана", "Межові Заблуканці")
  ],
  [
    comboKey("race.drantohor", "class.bureaucramancer"),
    title("Гість Без Печатки", "Гостя Без Печатки", "Гості Без Печатки")
  ],
  [
    comboKey("race.drantohor", "class.ranger"),
    title("Слідознавець Чужої Карти", "Слідознавиця Чужої Карти", "Слідознавці Чужої Карти")
  ],
  [
    comboKey("race.domovyk", "class.rogue"),
    title("Завідувач Чужої Полиці", "Завідувачка Чужої Полиці", "Завідувачі Чужої Полиці")
  ],
  [
    comboKey("race.domovyk", "class.priest"),
    title("Пічний Благословитель", "Пічна Благословителька", "Пічні Благословителі")
  ],
  [
    comboKey("race.domovyk", "class.bureaucramancer"),
    title("Архівний Дух", "Архівна Душа", "Архівні Духи")
  ],
  [
    comboKey("race.domovyk", "class.ranger"),
    title("Слідопит Підпіччя", "Слідопитка Підпіччя", "Слідопити Підпіччя")
  ],
  [
    comboKey("race.dryland-rusalka", "class.mage"),
    title("Чарівник Сухої Калюжі", "Чарівниця Сухої Калюжі", "Чарівники Сухої Калюжі")
  ],
  [
    comboKey("race.dryland-rusalka", "class.bard"),
    title("Співець Без Моря", "Співачка Без Моря", "Співці Без Моря")
  ],
  [
    comboKey("race.dryland-rusalka", "class.priest"),
    title("Жрець Чайникових Припливів", "Жриця Чайникових Припливів", "Жерці Чайникових Припливів")
  ],
  [
    comboKey("race.dryland-rusalka", "class.varenyk-mancer"),
    title("Сирен Сметани", "Сирена Сметани", "Сирени Сметани")
  ],
  [
    comboKey("race.intellectual-orc", "class.warrior"),
    title("Критик Прикладного Биття", "Критикиня Прикладного Биття", "Критики Прикладного Биття")
  ],
  [
    comboKey("race.intellectual-orc", "class.mage"),
    title("Кандидат Бойових Наук", "Кандидатка Бойових Наук", "Кандидати Бойових Наук")
  ],
  [
    comboKey("race.intellectual-orc", "class.priest"),
    title("Етичний Зцілювач Кулаком", "Етична Зцілювачка Кулаком", "Етичні Зцілювачі Кулаком")
  ],
  [
    comboKey("race.intellectual-orc", "class.kharakternyk"),
    title("Доцент Прикладного Туману", "Доцентка Прикладного Туману", "Доценти Прикладного Туману")
  ],
  [
    comboKey("race.intellectual-orc", "class.bureaucramancer"),
    title("Завідувач Ударної Канцелярії", "Завідувачка Ударної Канцелярії", "Завідувачі Ударної Канцелярії")
  ],
  [
    comboKey("race.molfar-soul", "class.mage"),
    title("Збирач Туману", "Збирачка Туману", "Збирачі Туману")
  ],
  [
    comboKey("race.molfar-soul", "class.bard"),
    title("Співець Туману з Довідкою", "Співачка Туману з Довідкою", "Співці Туману з Довідкою")
  ],
  [
    comboKey("race.molfar-soul", "class.rogue"),
    title("Обереговий Зникальник", "Оберегова Зникальниця", "Оберегові Зникальники")
  ],
  [
    comboKey("race.molfar-soul", "class.priest"),
    title("Пастир Малих Оберегів", "Пастирка Малих Оберегів", "Пастирі Малих Оберегів")
  ],
  [comboKey("race.molfar-soul", "class.kharakternyk"), title("Кум Туману", "Кума Туману", "Куми Туману")],
  [
    comboKey("race.molfar-soul", "class.bureaucramancer"),
    title("Писар Оберегових Справ", "Писарка Оберегових Справ", "Писарі Оберегових Справ")
  ]
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

export function getComboTitle(raceId: string, classId: string, pronoun: Pronoun = "he"): string {
  return comboTitles.get(comboKey(raceId, classId))?.[pronoun] ?? fallbackTitles[pronoun];
}

function comboKey(raceId: string, classId: string): string {
  return `${raceId}:${classId}`;
}

function title(he: string, she: string, they: string): ComboTitle {
  return { he, she, they };
}
