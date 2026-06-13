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
    description: "герой і прогрес"
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
    commands: ["fight", "hunt"],
    icon: "⚔️",
    description: "сутичка з монстром"
  },
  {
    commands: ["cellar"],
    icon: "🧹",
    description: "підвальна справа"
  },
  {
    commands: ["inventory", "items", "bag"],
    icon: "🎒",
    description: "манатки й торба"
  },
  {
    commands: ["equipment", "gear", "equip"],
    icon: "🧥",
    description: "спорядження без бонусів"
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
    commands: ["restart"],
    icon: "🔄",
    description: "почати з початку"
  },
  {
    commands: ["news", "version"],
    icon: "📰",
    description: "новини й версія"
  },
  {
    commands: ["help"],
    icon: "📖",
    description: "допомога"
  },
  {
    commands: ["dev_reset_me"],
    icon: "🧪",
    description: "скинути героя локально",
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

  lines.push("Повний бій, бонуси спорядження й ґільдії ще готуються.");

  return lines.join("\n");
}

function presentHelpCommandGroup(group: HelpCommandGroup): string {
  const commands = group.commands.map((command) => `/${command}`).join(", ");
  return `${group.icon} ${commands} — ${group.description}`;
}
