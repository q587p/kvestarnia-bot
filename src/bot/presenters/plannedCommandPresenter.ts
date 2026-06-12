export type PlannedCommand = "inventory" | "guild";

const plannedCommandMessages = {
  inventory: [
    "🎒 Інвентар ще шиє кишені.",
    "Манатки скоро матимуть власну полицю, а поки перевірте героя: /hero"
  ],
  guild: [
    "🛡️ Ґільдії ще сперечаються про статут.",
    "Поки рада ґільдій шукає кворум, можна подивитись героя: /hero"
  ]
} satisfies Record<PlannedCommand, [string, string]>;

export function presentPlannedCommand(command: PlannedCommand): string {
  return [
    ...plannedCommandMessages[command],
    "",
    "Доступно зараз: /start, /hero, /tavern, /adventure, /fight, /help"
  ].join("\n");
}
