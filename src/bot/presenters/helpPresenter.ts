import { getHelpCommandEntries } from "../botCommandCatalog";

interface HelpCommandGroup {
  commands: string[];
  icon: string;
  description: string;
  devOnly?: boolean;
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
    icon: "🌯",
    description: "пригода з шаурмою"
  },
  {
    commands: ["fight"],
    icon: "⚔️",
    description: "сутичка з монстром"
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
    commands: ["dev_reset_me"],
    icon: "🧪",
    description: "скинути персонажа локально",
    devOnly: true
  }
];

export function presentHelp(includeDevReset: boolean): string {
  const availableCommands = new Set(
    getHelpCommandEntries(includeDevReset).map((entry) => entry.command)
  );
  const commandLines = helpCommandGroups
    .filter((group) => !group.devOnly || includeDevReset)
    .filter((group) => group.commands.every((command) => availableCommands.has(command)))
    .map(presentHelpCommandGroup);
  const lines = [
    "📖 Довідка Квестарні",
    "",
    ...commandLines.flatMap((line) => [line, ""])
  ];

  lines.push(
    "Лут, ґільдії й повна бойова бухгалтерія ще готуються.",
    "",
    "Квестарню розробляє @q587p — розробник і корчмар за стійкою."
  );

  return lines.join("\n");
}

function presentHelpCommandGroup(group: HelpCommandGroup): string {
  const commands = group.commands.map((command) => `/${command}`).join(", ");
  return `${group.icon} ${commands} — ${group.description}`;
}
