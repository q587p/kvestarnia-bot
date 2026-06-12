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
    includeInMenu: false
  },
  {
    command: "me",
    icon: "🧭",
    description: "коротко про героя",
    includeInMenu: false
  },
  {
    command: "tavern",
    icon: "🍺",
    description: "до таверни",
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
    description: "вирушити в квест",
    includeInMenu: true
  },
  {
    command: "fight",
    icon: "⚔️",
    description: "сутичка з міміком",
    includeInMenu: false
  },
  {
    command: "hunt",
    icon: "🏹",
    description: "полювання на проблему",
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
    description: "торба героя",
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
    .filter((entry) => entry.includeInMenu)
    .map((entry) => ({
      command: entry.command,
      description: `${entry.icon} ${entry.description}`
    }));
}
