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
    description: "герой і прогрес",
    includeInMenu: true
  },
  {
    command: "profile",
    icon: "🪪",
    description: "профіль героя",
    includeInMenu: true
  },
  {
    command: "me",
    icon: "🧭",
    description: "коротко про героя",
    includeInMenu: true
  },
  {
    command: "tavern",
    icon: "🍺",
    description: "до таверни",
    includeInMenu: true
  },
  {
    command: "raid",
    icon: "🛢️",
    description: "рейд на бочку",
    includeInMenu: true
  },
  {
    command: "adventure",
    icon: "🌯",
    description: "пригода з шаурмою",
    includeInMenu: true
  },
  {
    command: "quest",
    icon: "🗺️",
    description: "вирушити в квест",
    includeInMenu: true
  },
  {
    command: "fight",
    icon: "⚔️",
    description: "сутичка з міміком",
    includeInMenu: true
  },
  {
    command: "hunt",
    icon: "🏹",
    description: "полювання на проблему",
    includeInMenu: true
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
    includeInMenu: true
  },
  {
    command: "bag",
    icon: "👜",
    description: "торба героя",
    includeInMenu: true
  },
  {
    command: "guild",
    icon: "🛡️",
    description: "ґільдії",
    includeInMenu: true
  },
  {
    command: "restart",
    icon: "🔄",
    description: "почати з початку",
    includeInMenu: true
  },
  {
    command: "version",
    icon: "🧾",
    description: "версія Квестарні",
    includeInMenu: true
  },
  {
    command: "news",
    icon: "📰",
    description: "новини й архів",
    includeInMenu: true
  },
  {
    command: "help",
    icon: "❔",
    description: "допомога",
    includeInMenu: true
  },
  {
    command: "dev_reset_me",
    icon: "🧪",
    description: "скинути героя локально",
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
    .filter((entry) => entry.includeInMenu || includeDevReset)
    .map((entry) => ({
      command: entry.command,
      description: `${entry.icon} ${entry.description}`
    }));
}
