import { getHelpCommandEntries } from "../botCommandCatalog";

export function presentHelp(includeDevReset: boolean): string {
  const lines = [
    "❔ Довідка Квестарні",
    "",
    ...getHelpCommandEntries(includeDevReset).map(
      (entry) => `${entry.icon} /${entry.command} — ${entry.description}`
    )
  ];

  lines.push("", "Повний бій, спорядження й ґільдії ще готуються.");

  return lines.join("\n");
}
