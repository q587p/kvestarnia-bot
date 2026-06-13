export type PlannedCommand = "guild";

const plannedCommandMessages = {
  guild: [
    "🛡️ Ґільдії ще сперечаються про статут.",
    "Поки рада ґільдій шукає кворум, можна подивитись персонажа: /hero"
  ]
} satisfies Record<PlannedCommand, [string, string]>;

export function presentPlannedCommand(command: PlannedCommand): string {
  return [
    ...plannedCommandMessages[command],
    "",
    "Доступно зараз: /start, /hero, /tavern, /quest, /fight, /help"
  ].join("\n");
}
