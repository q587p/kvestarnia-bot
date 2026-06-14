export interface BotCommandCatalogEntry {
  command: string;
  icon: string;
  description: string;
  includeInMenu: boolean;
  devOnly?: boolean;
}

export const botCommandCatalog: readonly BotCommandCatalogEntry[] = [
  {
    command: "start",
    icon: "🚪",
    description: "почати пригоду",
    includeInMenu: true
  },
  {
    command: "hero",
    icon: "👤",
    description: "персонаж і прогрес",
    includeInMenu: true
  },
  {
    command: "profile",
    icon: "🪪",
    description: "профіль персонажа",
    includeInMenu: false
  },
  {
    command: "me",
    icon: "🧭",
    description: "коротко про персонажа",
    includeInMenu: false
  },
  {
    command: "tavern",
    icon: "🍺",
    description: "до корчми",
    includeInMenu: false
  },
  {
    command: "raid",
    icon: "🛢️",
    description: "рейд на бочку",
    includeInMenu: false
  },
  {
    command: "adventure",
    icon: "🌯",
    description: "пригода з шаурмою",
    includeInMenu: false
  },
  {
    command: "quest",
    icon: "🗺️",
    description: "стіл зі справами",
    includeInMenu: true
  },
  {
    command: "fight",
    icon: "⚔️",
    description: "сутичка з монстром",
    includeInMenu: false
  },
  {
    command: "hunt",
    icon: "🏹",
    description: "дошка полювання",
    includeInMenu: false
  },
  {
    command: "bestiary",
    icon: "📚",
    description: "бестіарій",
    includeInMenu: false
  },
  {
    command: "monsters",
    icon: "👹",
    description: "польові нотатки про монстрів",
    includeInMenu: false
  },
  {
    command: "cellar",
    icon: "🧹",
    description: "підвальна справа",
    includeInMenu: false
  },
  {
    command: "inventory",
    icon: "🎒",
    description: "манатки",
    includeInMenu: true
  },
  {
    command: "items",
    icon: "📦",
    description: "перелік манаток",
    includeInMenu: false
  },
  {
    command: "bag",
    icon: "👜",
    description: "торба пригодника",
    includeInMenu: false
  },
  {
    command: "equipment",
    icon: "🧥",
    description: "спорядження",
    includeInMenu: false
  },
  {
    command: "gear",
    icon: "⚙️",
    description: "гачки спорядження",
    includeInMenu: false
  },
  {
    command: "equip",
    icon: "🪝",
    description: "приміряти манатки",
    includeInMenu: false
  },
  {
    command: "online",
    icon: "👥",
    description: "хто поруч",
    includeInMenu: false
  },
  {
    command: "look",
    icon: "👀",
    description: "озирнутися",
    includeInMenu: false
  },
  {
    command: "guild",
    icon: "🛡️",
    description: "ґільдії",
    includeInMenu: false
  },
  {
    command: "restart",
    icon: "🔄",
    description: "почати з початку",
    includeInMenu: false
  },
  {
    command: "version",
    icon: "🧾",
    description: "версія Квестарні",
    includeInMenu: false
  },
  {
    command: "news",
    icon: "📰",
    description: "новини й архів",
    includeInMenu: true
  },
  {
    command: "help",
    icon: "📖",
    description: "допомога",
    includeInMenu: true
  },
  {
    command: "dev_reset_me",
    icon: "🧪",
    description: "скинути персонажа локально",
    includeInMenu: false,
    devOnly: true
  }
];

export function getHelpCommandEntries(includeDevReset: boolean): BotCommandCatalogEntry[] {
  return botCommandCatalog.filter((entry) => !entry.devOnly || includeDevReset);
}

export function getTelegramMenuCommands(includeDevReset: boolean): Array<{
  command: string;
  description: string;
}> {
  return getHelpCommandEntries(includeDevReset)
    .filter((entry) => entry.includeInMenu)
    .map((entry) => ({
      command: entry.command,
      description: `${entry.icon} ${entry.description}`
    }));
}
