import { items, monsterLoot, monsters } from "../../content";
import type { MonsterContent } from "../../content/schema";
import { escapeHtml } from "./telegramHtml";

export const BESTIARY_PAGE_SIZE = 5;

const tagLabels: Record<string, string> = {
  annoying: "надокучливе",
  archive: "архівне",
  armor: "обладункове",
  audit: "ревізійне",
  bandit: "розбійне",
  beast: "звірина",
  boss: "велика проблема",
  bread: "хлібне",
  bureaucracy: "бюрократичне",
  cellar: "підвальне",
  comic: "комічне",
  construct: "складене з наміру",
  cursed: "підозріло прокляте",
  diplomacy: "перемовне",
  dragon: "драконяче",
  fire: "димне",
  food: "їстівне лише теоретично",
  ghost: "примарне",
  goblin: "гоблінське",
  gold: "монетне",
  household: "хатнє",
  insect: "дрібно-настирне",
  kitchen: "кухонне",
  knight: "лицарське",
  mimic: "мімічне",
  "mini-boss": "мале, але з гонором",
  "tiny-boss": "дрібне начальство",
  troll: "останньословне",
  undead: "не зовсім живе"
};

export function clampBestiaryPage(page: number): number {
  const maxPage = Math.max(0, Math.ceil(monsters.length / BESTIARY_PAGE_SIZE) - 1);

  if (!Number.isFinite(page)) {
    return 0;
  }

  return Math.min(Math.max(Math.floor(page), 0), maxPage);
}

export function presentBestiaryList(page: number): string {
  const safePage = clampBestiaryPage(page);
  const totalPages = Math.max(1, Math.ceil(monsters.length / BESTIARY_PAGE_SIZE));
  const pageMonsters = monsters.slice(
    safePage * BESTIARY_PAGE_SIZE,
    safePage * BESTIARY_PAGE_SIZE + BESTIARY_PAGE_SIZE
  );
  const lines = [
    "📖 Бестіарій Квестарні",
    "",
    "Польові нотатки без гарантії безпеки. Якщо запис моргає — це не ілюстрація.",
    "",
    ...pageMonsters.map(presentMonsterRow),
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
  const tags = monster.tags.slice(0, 3).map((tag) => tagLabels[tag] ?? tag).join(", ");

  return `• <b>${escapeHtml(monster.name)}</b> · рівень ${monster.level}${tags ? ` · ${escapeHtml(tags)}` : ""}`;
}

function presentFieldNote(monster: MonsterContent): string {
  if (monster.tags.includes("bureaucracy")) {
    return "Польова нотатка: перемагати можна аргументом, але печатка все одно спитає додаток.";
  }

  if (monster.tags.includes("food")) {
    return "Польова нотатка: якщо воно пахне вечерею і має плани, спершу беріть виделку довшу.";
  }

  if (monster.tags.includes("undead")) {
    return "Польова нотатка: нежить не любить дедлайни, бо вже один великий пропустила.";
  }

  return "Польова нотатка: спостерігати з безпечної відстані. Безпечну відстань визначає найповільніший.";
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
