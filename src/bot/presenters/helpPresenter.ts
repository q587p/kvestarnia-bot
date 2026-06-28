import { getHelpCommandEntries } from "../botCommandCatalog";

interface HelpCommandGroup {
  commands: string[];
  icon: string;
  description: string;
  devOnly?: "reset" | "grant";
}

export interface HelpVisibility {
  includeDevReset: boolean;
  includeDevGrant?: boolean;
}

const helpCommandGroups: readonly HelpCommandGroup[] = [
  {
    commands: ["start"],
    icon: "🚪",
    description: "почати пригоду"
  },
  {
    commands: ["hero", "profile", "me"],
    icon: "👤",
    description: "персонаж і прогрес"
  },
  {
    commands: ["tavern", "raid"],
    icon: "🍺",
    description: "корчма й рейд на бочку"
  },
  {
    commands: ["quest"],
    icon: "🗺️",
    description: "стіл зі справами"
  },
  {
    commands: ["adventure"],
    icon: "🪧",
    description: "вибір пригоди"
  },
  {
    commands: ["fight", "spar", "duel"],
    icon: "⚔️",
    description: "сутичка, тренування й виклик"
  },
  {
    commands: ["hunt"],
    icon: "🏹",
    description: "дошка полювання"
  },
  {
    commands: ["bestiary", "monsters"],
    icon: "📚",
    description: "бестіарій із 3 рівня"
  },
  {
    commands: ["cellar"],
    icon: "🧹",
    description: "льохова справа"
  },
  {
    commands: ["inventory", "items", "bag"],
    icon: "🎒",
    description: "манатки й торба"
  },
  {
    commands: ["equipment", "gear", "equip"],
    icon: "🧥",
    description: "спорядження й бонуси"
  },
  {
    commands: ["online"],
    icon: "👥",
    description: "хто поруч"
  },
  {
    commands: ["look"],
    icon: "👀",
    description: "озирнутися"
  },
  {
    commands: ["guild"],
    icon: "🛡️",
    description: "ґільдії"
  },
  {
    commands: ["restart", "remort"],
    icon: "🔄",
    description: "нове коло героя"
  },
  {
    commands: ["news", "version"],
    icon: "📰",
    description: "новини й версія"
  },
  {
    commands: ["support"],
    icon: "🫙",
    description: "добровільна підтримка без бонусів"
  },
  {
    commands: ["help"],
    icon: "📖",
    description: "допомога"
  },
  {
    commands: [
      "dev_help",
      "dev_reset_me",
      "dev_adventure_reset",
      "dev_reset_korchma_round",
      "dev_raid_stop",
      "dev_reset_monster_rest",
      "dev_two_enemies"
    ],
    icon: "🧪",
    description: "локальні скидання для тестів",
    devOnly: "reset"
  },
  {
    commands: ["dev_add_level"],
    icon: "🪜",
    description: "додати рівні локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_add_xp"],
    icon: "🔢",
    description: "додати XP локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_add_gold"],
    icon: "🪙",
    description: "додати золото локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_heal"],
    icon: "🩹",
    description: "вилікувати HP локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_restore_mana"],
    icon: "🔮",
    description: "відновити ману локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_add_random_item"],
    icon: "🎲",
    description: "додати випадкові манатки локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_add_bandage"],
    icon: "🧻",
    description: "додати бинти локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_reset_yeger_bandage", "dev_reset_yeger_bandage_day", "dev_reset_yeger_trail"],
    icon: "🧷",
    description: "скинути таймери й ліміти Єгеря локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_reset_bard_performance"],
    icon: "🎶",
    description: "скинути бардівський виступ локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_reset_passage_search"],
    icon: "🔎",
    description: "скинути пошук у проходах локально",
    devOnly: "grant"
  },
  {
    commands: ["dev_reset_doppelganger"],
    icon: "🥊",
    description: "скинути cooldown Допельґанґера локально",
    devOnly: "grant"
  }
];

export function presentHelp(visibility: boolean | HelpVisibility): string {
  const normalized = normalizeHelpVisibility(visibility);
  const availableCommands = new Set(
    getHelpCommandEntries(normalized).map((entry) => entry.command)
  );
  const commandLines = helpCommandGroups
    .filter((group) => isHelpGroupVisible(group, normalized))
    .filter((group) => group.commands.every((command) => availableCommands.has(command)))
    .map(presentHelpCommandGroup);
  const lines = [
    "📖 Довідка Квестарні",
    "",
    ...commandLines.flatMap((line) => [line, ""])
  ];

  lines.push(
    "Крамниці, ремесло й ґільдії ще готуються.",
    "",
    "Квестарню розробляє @q587p — розробник і корчмар за стійкою."
  );

  return lines.join("\n");
}

export function presentDevHelp(visibility: boolean | HelpVisibility): string {
  const normalized = normalizeHelpVisibility(visibility);
  const devCommands = getHelpCommandEntries(normalized)
    .filter((entry) => entry.devOnly)
    .map((entry) => `${entry.icon} /${entry.command} — ${entry.description}`);

  if (devCommands.length === 0) {
    return "Dev-команди тут не ввімкнені. Корчмар сховав викрутку.";
  }

  return [
    "🧰 Dev-довідка Квестарні",
    "",
    ...devCommands,
    "",
    "Команди працюють тільки у локальній майстерні."
  ].join("\n");
}

function presentHelpCommandGroup(group: HelpCommandGroup): string {
  const commands = group.commands.map((command) => `/${command}`).join(", ");
  return `${group.icon} ${commands} — ${group.description}`;
}

function isHelpGroupVisible(
  group: HelpCommandGroup,
  visibility: Required<HelpVisibility>
): boolean {
  if (!group.devOnly) {
    return true;
  }

  return group.devOnly === "reset"
    ? visibility.includeDevReset
    : visibility.includeDevGrant;
}

function normalizeHelpVisibility(visibility: boolean | HelpVisibility): Required<HelpVisibility> {
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
