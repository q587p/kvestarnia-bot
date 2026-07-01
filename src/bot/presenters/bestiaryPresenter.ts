import {
  bestiarySpecialRecords,
  getBestiarySpecialRecord,
  items,
  monsterFlavorLines,
  monsterLoot,
  monsters,
  type BestiarySpecialRecord
} from "../../content";
import type { MonsterContent } from "../../content/schema";
import { BESTIARY_MIN_LEVEL } from "../../domain/progression/activityGates";
import { escapeHtml } from "./telegramHtml";

export const BESTIARY_PAGE_SIZE = 5;

export const BESTIARY_TAG_LABELS: Record<string, string> = {
  air: "повітряне",
  annoying: "надокучливе",
  argument: "суперечкове",
  archive: "архівне",
  armor: "обладункове",
  audit: "ревізійне",
  autumn: "осіннє",
  bandit: "розбійне",
  beast: "звірина",
  bird: "пташине",
  blame: "винуватне",
  boss: "велика проблема",
  bread: "хлібне",
  bridge: "мостове",
  bureaucracy: "бюрократичне",
  cellar: "льохове",
  comic: "комічне",
  committee: "комітетське",
  construct: "складене з наміру",
  controller: "контрольне",
  cursed: "підозріло прокляте",
  dance: "танцювальне",
  day: "денне",
  delivery: "доставне",
  demon: "дідьківське",
  diplomacy: "перемовне",
  dragon: "драконяче",
  duplicate: "другопримірникове",
  elite: "елітно-небезпечне",
  fermentation: "бродильне",
  fire: "димне",
  floating: "плавуче без води",
  folklore: "фольклорне",
  food: "їстівне лише теоретично",
  forest: "лісове",
  garden: "городнє",
  gatekeeper: "вахтерське",
  gaze: "поглядове",
  ghost: "примарне",
  giant: "велетенське",
  goblin: "гоблінське",
  gold: "монетне",
  greedy: "зажерливе",
  heat: "спекотне",
  household: "хатнє",
  humanoid: "людиноподібне",
  ice: "крижане",
  insect: "дрібно-настирне",
  jellyfish: "медузяче",
  key: "ключове",
  kitchen: "кухонне",
  knight: "лицарське",
  knife: "ножове",
  korchma: "корчмарське",
  law: "законницьке",
  leadership: "командирське",
  magic: "чаклунське",
  map: "мапове",
  merchant: "крамарське",
  metal: "металеве",
  mind: "самокритичне",
  mimic: "мімічне",
  "mini-boss": "мале, але з гонором",
  mirror: "дзеркальне",
  mobility: "мобільне",
  naming: "іменувальне",
  night: "нічне",
  numbers: "циферкове",
  paper: "паперове",
  paperwork: "звітне",
  plant: "рослинне",
  queue: "чергове",
  reptile: "плазунське",
  road: "дорожнє",
  royal: "королівське",
  rules: "правилове",
  rumor: "чуткове",
  shop: "торговельне",
  siege: "облогове",
  sky: "небесне",
  slime: "слизове",
  social: "соціяльне",
  soft: "мʼяко-загрозливе",
  sound: "свистяче",
  starter: "навчальне",
  stone: "камʼяне",
  sustain: "живуче",
  swarm: "зграєве",
  tax: "податкове",
  teapot: "чайникове",
  temperature: "температурне",
  time: "дедлайнове",
  treasure: "скарбове",
  trickster: "хитрувате",
  "tiny-boss": "дрібне начальство",
  troll: "останньословне",
  tutorial: "пояснювальне",
  undead: "не зовсім живе",
  underground: "підземне",
  unquiet: "неупокоєне",
  warehouse: "складське",
  water: "водно-сухе",
  web: "павутинне",
  wind: "протяжне"
};

export function clampBestiaryPage(page: number): number {
  const maxPage = Math.max(0, Math.ceil(getBestiaryRecordCount() / BESTIARY_PAGE_SIZE) - 1);

  if (!Number.isFinite(page)) {
    return 0;
  }

  return Math.min(Math.max(Math.floor(page), 0), maxPage);
}

export function presentBestiaryList(page: number): string {
  const safePage = clampBestiaryPage(page);
  const totalPages = Math.max(1, Math.ceil(getBestiaryRecordCount() / BESTIARY_PAGE_SIZE));
  const pageRecords = getBestiaryListRecords().slice(
    safePage * BESTIARY_PAGE_SIZE,
    safePage * BESTIARY_PAGE_SIZE + BESTIARY_PAGE_SIZE
  );
  const lines = [
    "📖 Бестіарій Квестарні",
    "",
    "Польові нотатки без гарантії безпеки. Якщо запис моргає — це не ілюстрація.",
    "",
    ...pageRecords.map(presentBestiaryRow),
    "",
    `Сторінка ${safePage + 1}/${totalPages}`
  ];

  return lines.join("\n");
}

export function presentBestiaryMonster(monsterId: string): string {
  const monster = monsters.find((candidate) => candidate.id === monsterId);

  if (!monster) {
    return [
      "📖 Запис не знайдено.",
      "",
      "Корчмар клянеться, що він був тут хвилину тому. Запис, не корчмар."
    ].join("\n");
  }

  return presentBestiaryMonsterRecord(monster, getKnownTrophyNames(monster));
}

export function presentBestiarySpecial(specialId: string): string {
  const special = getBestiarySpecialRecord(specialId);

  if (!special) {
    return [
      "📖 Запис не знайдено.",
      "",
      "Корчмар клянеться, що він був тут хвилину тому. Запис, не корчмар."
    ].join("\n");
  }

  return presentBestiarySpecialRecord(special);
}

export function presentBestiaryMonsterRecord(
  monster: MonsterContent,
  trophyNames: string[]
): string {
  const lines = [
    `📖 <b>${escapeHtml(monster.name)}</b>`,
    `Рівень: ${monster.level}`,
    "",
    `<i>${escapeHtml(monster.description)}</i>`,
    "",
    presentFieldNote(monster),
    ...presentKnownTrophies(trophyNames)
  ];

  return lines.join("\n");
}

function presentMonsterRow(monster: MonsterContent): string {
  const tags = monster.tags.slice(0, 3).map(formatBestiaryTagLabel).join(", ");

  return `• <b>${escapeHtml(monster.name)}</b> · рівень ${monster.level}${tags ? ` · ${escapeHtml(tags)}` : ""}`;
}

export function presentBestiarySpecialRecord(special: BestiarySpecialRecord): string {
  const tags = special.tags.slice(0, 3).map(formatBestiaryTagLabel).join(", ");

  return [
    `📖 <b>${escapeHtml(special.name)}</b>`,
    "Рівень: особливий запис",
    "",
    `<i>${escapeHtml(special.description)}</i>`,
    "",
    `Польова нотатка: ${escapeHtml(special.fieldNote)}`,
    "",
    `Позначки: ${escapeHtml(tags || "дивно-класифіковане")}`
  ].join("\n");
}

function presentBestiaryRow(record: BestiaryListRecord): string {
  if (record.type === "monster") {
    return presentMonsterRow(record.monster);
  }

  const tags = record.special.tags.slice(0, 3).map(formatBestiaryTagLabel).join(", ");

  return `• <b>${escapeHtml(record.special.name)}</b> · особливий запис${tags ? ` · ${escapeHtml(tags)}` : ""}`;
}

export function presentBestiaryNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Бестіарій не показує зуби порожнім анкетам.";
}

export function presentBestiaryLevelLocked(requiredLevel: number = BESTIARY_MIN_LEVEL): string {
  return [
    "📖 Бестіарій поки під серветкою.",
    "",
    `Корчмар притримує нотатки до ${requiredLevel} рівня: там є спойлери, зуби й одна дуже підозріла вечеря.`,
    "",
    "Почніть зі Столу зі справами: /quest"
  ].join("\n");
}

function formatBestiaryTagLabel(tag: string): string {
  return BESTIARY_TAG_LABELS[tag] ?? "дивно-класифіковане";
}

function presentFieldNote(monster: MonsterContent): string {
  const note = monsterFlavorLines.find(
    (line) => line.monsterId === monster.id && line.placement === "monster.loot-note"
  );

  if (note) {
    return `Польова нотатка: ${escapeHtml(note.text)}`;
  }

  return "Польова нотатка: запис загубився між полем і нотаткою. Обидва заперечують провину.";
}

function getKnownTrophyNames(monster: MonsterContent): string[] {
  const lootIds = monsterLoot[monster.id as keyof typeof monsterLoot] ?? [];
  return lootIds
    .map((itemId) => items.find((item) => item.id === itemId)?.name)
    .filter((name): name is string => Boolean(name));
}

function presentKnownTrophies(trophyNames: string[]): string[] {
  if (trophyNames.length === 0) {
    return [
      "",
      "Відомі трофеї: поки тільки підозри й легкий сором у журналіста."
    ];
  }

  return [
    "",
    "Можливі трофеї за нотатками, не обіцянка:",
    ...trophyNames.map((name) => `— <i>${escapeHtml(name)}</i>`)
  ];
}

type BestiaryListRecord =
  | { type: "monster"; monster: MonsterContent }
  | { type: "special"; special: BestiarySpecialRecord };

export function getBestiaryRecordCount(): number {
  return monsters.length + bestiarySpecialRecords.length;
}

export function getBestiaryListRecords(): BestiaryListRecord[] {
  return [
    ...monsters.map((monster) => ({ type: "monster" as const, monster })),
    ...bestiarySpecialRecords.map((special) => ({ type: "special" as const, special }))
  ];
}
