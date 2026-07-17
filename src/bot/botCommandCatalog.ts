export interface BotCommandCatalogEntry {
  command: string;
  icon: string;
  description: string;
  includeInMenu: boolean;
  featureOnly?: "tavern-games";
  devOnly?: "reset" | "grant" | "party" | "fighting-corner" | "hp-recovery";
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
    description: "миттєва дружня дуель",
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
    command: "games",
    icon: "♟️",
    description: "ігри за столом",
    includeInMenu: true,
    featureOnly: "tavern-games"
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
    command: "lore",
    icon: "🗂️",
    description: "Перекази Квестарні",
    includeInMenu: false
  },
  {
    command: "chronicles",
    icon: "📣",
    description: "останні події",
    includeInMenu: false
  },
  {
    command: "help",
    icon: "📖",
    description: "допомога",
    includeInMenu: true
  },
  {
    command: "support",
    icon: "🫙",
    description: "добровільна підтримка без бонусів",
    includeInMenu: true
  },
  {
    command: "dev_help",
    icon: "🧰",
    description: "локальна довідка dev-команд",
    includeInMenu: false,
    devOnly: "reset"
  },
  {
    command: "dev_party",
    icon: "🪢",
    description: "зібрати тимчасову ватагу локально",
    includeInMenu: false,
    devOnly: "party"
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
    command: "dev_reset_korchma_round",
    icon: "🗓️",
    description: "скинути Корчмарський обхід локально",
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
    command: "dev_raid_reset",
    icon: "🔁",
    description: "скинути таймер рейду локально",
    includeInMenu: false,
    devOnly: "reset"
  },
  {
    command: "dev_raid_win",
    icon: "🏁",
    description: "підготувати перемогу над Старшим Братом Бочки локально",
    includeInMenu: false,
    devOnly: "reset"
  },
  {
    command: "dev_reset_monster_rest",
    icon: "⌛",
    description: "скинути перерву монстрів локально",
    includeInMenu: false,
    devOnly: "reset"
  },
  {
    command: "dev_two_enemies",
    icon: "🧬",
    description: "почати локальний бій із двома ворогами; число додає рівні другому",
    includeInMenu: false,
    devOnly: "reset"
  },
  {
    command: "dev_hp_recovery_due",
    icon: "❤️‍🩹",
    description: "підготувати сповіщення про відновлення HP локально",
    includeInMenu: false,
    devOnly: "hp-recovery"
  },
  {
    command: "dev_add_level",
    icon: "🪜",
    description: "додати рівні локально",
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
    description: "додати випадкові манатки локально, можна slot=tool або tag=twohand",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_add_item",
    icon: "🧾",
    description: "додати конкретну манатку локально через itemId=...",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_add_bandage",
    icon: "🧻",
    description: "додати бинти локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_add_dense_bandage",
    icon: "🧵",
    description: "додати щільні бинти локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_add_field_kit",
    icon: "🩺",
    description: "додати польові аптечки локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_add_iskrokamin",
    icon: "✨",
    description: "додати Іскрокамінь для Чароковальні локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_finish_attunements",
    icon: "⏩",
    description: "завершити налаштування спорядження локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_add_yeger_line",
    icon: "📏",
    description: "додати єгерську риску локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_yeger_bandage",
    icon: "🧷",
    description: "скинути таймер бинта Єгеря локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_yeger_bandage_day",
    icon: "📆",
    description: "скинути денний ліміт купівлі бинтів Єгеря локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_yeger_trail",
    icon: "👣",
    description: "завершити очікування сліду Єгеря локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_cellar_mouse",
    icon: "🐭",
    description: "скинути cooldown льохової миші локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_priest_blessing",
    icon: "🙏",
    description: "скинути cooldown жрецького благословення локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_quiet_pocket",
    icon: "🗡️",
    description: "скинути cooldown Тихої кишені локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_bureaucramancer_protocol",
    icon: "📄",
    description: "скинути cooldown Протоколу 13-З локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_varenyk_sated",
    icon: "🍽️",
    description: "скинути власний стан і паузу «Ситий» локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_rogue",
    icon: "🧤",
    description: "скинути cooldown і сьогоднішні кишені злодія локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_yeger_first_done",
    icon: "5️⃣",
    description: "довести першу дошку Єгеря до 5/5 локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_yeger_second_done",
    icon: "7️⃣",
    description: "довести другу дошку Єгеря до 17/17 локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_bard_performance",
    icon: "🎶",
    description: "скинути бардівський виступ локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_tavern_games",
    icon: "🎲",
    description: "перевірити, що столи без паузи локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_passage_search",
    icon: "🔎",
    description: "скинути пошук у проходах локально",
    includeInMenu: false,
    devOnly: "grant"
  },
  {
    command: "dev_reset_fighting_corner_quest",
    icon: "📜",
    description: "скинути поточне життя справи Бійцівського кутка локально",
    includeInMenu: false,
    devOnly: "fighting-corner"
  },
  {
    command: "dev_reset_doppelganger",
    icon: "🪞",
    description: "скинути cooldown Допельґанґера локально",
    includeInMenu: false,
    devOnly: "grant"
  }
];

export interface DevCommandVisibility {
  includeDevReset: boolean;
  includeDevGrant?: boolean;
  includePartySessions?: boolean;
  includeTavernGames?: boolean;
  includeFightingCornerQuest?: boolean;
  includeHpRecovery?: boolean;
}

export function getHelpCommandEntries(visibility: boolean | DevCommandVisibility): BotCommandCatalogEntry[] {
  const normalized = normalizeDevCommandVisibility(visibility);

  return botCommandCatalog.filter((entry) => {
    if (!entry.devOnly) {
      return !entry.featureOnly || normalized.includeTavernGames;
    }

    if (entry.devOnly === "reset") {
      return normalized.includeDevReset;
    }

    if (entry.devOnly === "fighting-corner") {
      return normalized.includeFightingCornerQuest;
    }

    if (entry.devOnly === "hp-recovery") {
      return normalized.includeHpRecovery;
    }

    return entry.devOnly === "grant"
      ? normalized.includeDevGrant
      : normalized.includePartySessions;
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
      includeDevGrant: visibility,
      includePartySessions: visibility,
      includeTavernGames: visibility,
      includeFightingCornerQuest: visibility,
      includeHpRecovery: visibility
    };
  }

  return {
    includeDevReset: visibility.includeDevReset,
    includeDevGrant: visibility.includeDevGrant ?? false,
    includePartySessions: visibility.includePartySessions ?? false,
    includeTavernGames: visibility.includeTavernGames ?? false,
    includeFightingCornerQuest: visibility.includeFightingCornerQuest ?? false,
    includeHpRecovery: visibility.includeHpRecovery ?? false
  };
}
