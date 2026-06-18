export interface BotCommandCatalogEntry {
  command: string;
  icon: string;
  description: string;
  includeInMenu: boolean;
  devOnly?: "reset" | "grant";
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
    icon: "🪧",
    description: "вибір пригоди",
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
    command: "spar",
    icon: "🥊",
    description: "тренування з допельґанґером",
    includeInMenu: false
  },
  {
    command: "duel",
    icon: "🤝",
    description: "дружній корчемний виклик",
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
    description: "бестіарій із 3 рівня",
    includeInMenu: false
  },
  {
    command: "monsters",
    icon: "👹",
    description: "польові нотатки з 3 рівня",
    includeInMenu: false
  },
  {
    command: "cellar",
    icon: "🧹",
    description: "льохова справа",
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
    command: "remort",
    icon: "🕯️",
    description: "нове життя після 13 рівня",
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
    command: "support",
    icon: "🫙",
    description: "добровільна підтримка без бонусів",
    includeInMenu: false
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
    devOnly: "reset"
  },
  {
    command: "dev_adventure_reset",
    icon: "⏱️",
    description: "скинути вибір пригоди локально",
    includeInMenu: false,
    devOnly: "reset"
  },
  {
    command: "dev_raid_stop",
    icon: "⏹️",
    description: "завершити pending рейд локально",
    includeInMenu: false,
    devOnly: "reset"
  },
  {
    command: "dev_add_level",
    icon: "🪜",
    description: "додати рівень локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_add_xp",
    icon: "🔢",
    description: "додати XP локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_add_gold",
    icon: "🪙",
    description: "додати золото локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_heal",
    icon: "🩹",
    description: "вилікувати HP локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_restore_mana",
    icon: "🔮",
    description: "відновити ману локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_add_random_item",
    icon: "🎲",
    description: "додати випадкові манатки локально",
    includeInMenu: false,
    devOnly: "grant"
  }
];

export interface DevCommandVisibility {
  includeDevReset: boolean;
  includeDevGrant?: boolean;
}

export function getHelpCommandEntries(visibility: boolean | DevCommandVisibility): BotCommandCatalogEntry[] {
  const normalized = normalizeDevCommandVisibility(visibility);

  return botCommandCatalog.filter((entry) => {
    if (!entry.devOnly) {
      return true;
    }

    return entry.devOnly === "reset"
      ? normalized.includeDevReset
      : normalized.includeDevGrant;
  });
}

export function getTelegramMenuCommands(visibility: boolean | DevCommandVisibility): Array<{
  command: string;
  description: string;
}> {
  return getHelpCommandEntries(visibility)
    .filter((entry) => entry.includeInMenu)
    .map((entry) => ({
      command: entry.command,
      description: `${entry.icon} ${entry.description}`
    }));
}

function normalizeDevCommandVisibility(
  visibility: boolean | DevCommandVisibility
): Required<DevCommandVisibility> {
  if (typeof visibility === "boolean") {
    return {
      includeDevReset: visibility,
      includeDevGrant: visibility
    };
  }

  return {
    includeDevReset: visibility.includeDevReset,
    includeDevGrant: visibility.includeDevGrant ?? false
  };
}
