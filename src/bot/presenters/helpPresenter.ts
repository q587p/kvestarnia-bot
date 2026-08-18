import { getHelpCommandEntries, type BotCommandCatalogEntry } from "../botCommandCatalog";
import { HELP_CONTENT_PAGES, type HelpPage } from "../callbacks/helpCallbackData";
import type { DevHelpPage } from "../callbacks/devHelpCallbackData";
import { getDevHelpSections } from "../devHelpSections";

export interface HelpVisibility {
  includeDevReset: boolean;
  includeDevGrant?: boolean;
  includePartySessions?: boolean;
  includeGroupCombat?: boolean;
  includeRaidChat?: boolean;
  includeTavernGames?: boolean;
  includeFightingCornerQuest?: boolean;
  includeHpRecovery?: boolean;
  includeGuild?: boolean;
  includeReferral?: boolean;
  includeReferralDev?: boolean;
}

const HELP_PAGE_COMMANDS: Record<Exclude<HelpPage, "menu">, readonly string[]> = {
  hero: ["start", "hero", "profile", "me", "restart", "remort"],
  adventures: ["adventure", "quest", "fight", "hunt", "bestiary", "monsters", "cellar"],
  items: ["inventory", "items", "bag", "equipment", "gear", "equip"],
  korchma: ["tavern", "raid", "spar", "duel", "online", "games", "look"],
  news: ["guild", "invite", "version", "news", "lore", "chronicles", "help", "support"]
};

const HELP_COMMAND_ALIAS_GROUPS = [
  { commands: ["hero", "profile"], description: "персонаж і прогрес" },
  { commands: ["bestiary", "monsters"], description: "бестіарій із 3 рівня" },
  { commands: ["equipment", "gear"], description: "огляд спорядження" }
] as const;

export function presentHelp(
  visibility: boolean | HelpVisibility,
  page: HelpPage = "menu"
): string {
  const normalized = normalizeHelpVisibility(visibility);
  if (page === "menu") {
    return [
      "📖 Допомога Квестарні",
      "",
      "Що саме загубилося дорогою між дверима й кухлем?",
      "",
      "👤 Персонаж — початок, прогрес і нове життя.",
      "⚔️ Пригоди й бої — справи, монстри та Низ.",
      "🎒 Манатки — торба, спорядження й гачки.",
      "🍺 Корчма й люди — місця, Бочка та дозвілля.",
      "📰 Довідки й вісті — дошка, Перекази й підтримка.",
      "",
      "Оберіть розділ кнопкою нижче. Основна клавіатура теж знає більшість доріг."
    ].join("\n");
  }

  const publicCommands = getHelpCommandEntries(normalized).filter((entry) => !entry.devOnly);
  const commands = commandsForPage(publicCommands, page);
  const pageNumber = HELP_CONTENT_PAGES.indexOf(page) + 1;

  return pageContent(page, pageNumber, commands).join("\n");
}

function commandsForPage(
  commands: BotCommandCatalogEntry[],
  page: Exclude<HelpPage, "menu">
): string[] {
  const allowed = new Set(HELP_PAGE_COMMANDS[page]);
  const available = new Map(
    commands
      .filter((entry) => allowed.has(entry.command))
      .map((entry) => [entry.command, entry] as const)
  );
  const rendered = new Set<string>();
  const rows: string[] = [];

  for (const command of HELP_PAGE_COMMANDS[page]) {
    if (rendered.has(command)) {
      continue;
    }

    const entry = available.get(command);
    if (!entry) {
      continue;
    }

    const aliasGroup = HELP_COMMAND_ALIAS_GROUPS.find((group) =>
      group.commands.some((alias) => alias === command)
    );
    const aliases = aliasGroup?.commands
      .flatMap((alias) => available.get(alias) ? [alias] : [])
      ?? [command];

    aliases.forEach((alias) => rendered.add(alias));
    rows.push(
      `${entry.icon} ${aliases.map((alias) => `/${alias}`).join(", ")} — ${aliasGroup?.description ?? entry.description}`
    );
  }

  return rows;
}

function pageContent(
  page: Exclude<HelpPage, "menu">,
  pageNumber: number,
  commands: string[]
): string[] {
  if (page === "hero") {
    return [
      `👤 Персонаж · ${pageNumber}/5`,
      "",
      "Створення, прогрес і нове життя пригодника.",
      "",
      ...commands
    ];
  }

  if (page === "adventures") {
    return [
      `⚔️ Пригоди й бої · ${pageNumber}/5`,
      "",
      "Справи, Низ, полювання та польові нотатки.",
      "",
      ...commands
    ];
  }

  if (page === "items") {
    return [
      `🎒 Манатки · ${pageNumber}/5`,
      "",
      "Торба, спорядження й усе, що підозріло дзвенить.",
      "",
      ...commands,
      "",
      "Воїн може тримати по зброї в кожній руці. Бо дві руки без роботи — це вже ремесло."
    ];
  }

  if (page === "korchma") {
    return [
      `🍺 Корчма й люди · ${pageNumber}/5`,
      "",
      "Місця, Бочка, дружні суперники й пригодники поруч.",
      "",
      ...commands
    ];
  }

  return [
    `📰 Довідки й вісті · ${pageNumber}/5`,
    "",
    "Дошка корчми, Перекази, версія та добровільна підтримка.",
    "",
    ...commands,
    "",
    "Крамниці й ремесло ще готуються.",
    "Квестарню розробляє @q587p — розробник і корчмар за стійкою."
  ];
}

export function presentDevHelp(
  visibility: boolean | HelpVisibility,
  page: DevHelpPage = "menu"
): string {
  const normalized = normalizeHelpVisibility(visibility);
  const sections = getDevHelpSections(normalized);
  const promotedCommand = sections
    .flatMap((section) => section.commands)
    .find((entry) => entry.command === "dev_add_level");

  if (sections.length === 0) {
    return "Dev-команди тут не ввімкнені. Корчмар сховав викрутку.";
  }

  if (page === "menu") {
    return [
      "🧰 Dev-довідка Квестарні",
      "",
      "Що саме треба підкрутити?",
      ...(promotedCommand
        ? ["", `${promotedCommand.icon} /${promotedCommand.command} — ${promotedCommand.description}`]
        : []),
      "",
      ...sections.map((section) => `${section.title} — ${section.summary}.`),
      "",
      "Оберіть розділ кнопкою нижче. Команди працюють тільки у локальній майстерні."
    ].join("\n");
  }

  const section = sections.find((candidate) => candidate.page === page);
  if (!section) {
    return presentDevHelp(normalized, "menu");
  }

  return [
    `${section.title} · ${sections.indexOf(section) + 1}/${sections.length}`,
    "",
    ...section.commands
      .filter((entry) => entry.command !== promotedCommand?.command)
      .map((entry) => `${entry.icon} /${entry.command} — ${entry.description}`),
    "",
    "Команди працюють тільки у локальній майстерні."
  ].join("\n");
}

function normalizeHelpVisibility(visibility: boolean | HelpVisibility): Required<HelpVisibility> {
  if (typeof visibility === "boolean") {
    return {
      includeDevReset: visibility,
      includeDevGrant: visibility,
      includePartySessions: visibility,
      includeGroupCombat: visibility,
      includeRaidChat: visibility,
      includeTavernGames: visibility,
      includeFightingCornerQuest: visibility,
      includeHpRecovery: visibility,
      includeGuild: visibility,
      includeReferral: visibility,
      includeReferralDev: visibility
    };
  }

  return {
    includeDevReset: visibility.includeDevReset,
    includeDevGrant: visibility.includeDevGrant ?? false,
    includePartySessions: visibility.includePartySessions ?? false,
    includeGroupCombat: visibility.includeGroupCombat ?? false,
    includeRaidChat: visibility.includeRaidChat ?? false,
    includeTavernGames: visibility.includeTavernGames ?? false,
    includeFightingCornerQuest: visibility.includeFightingCornerQuest ?? false,
    includeHpRecovery: visibility.includeHpRecovery ?? false,
    includeGuild: visibility.includeGuild ?? false,
    includeReferral: visibility.includeReferral ?? false,
    includeReferralDev: visibility.includeReferralDev ?? false
  };
}
