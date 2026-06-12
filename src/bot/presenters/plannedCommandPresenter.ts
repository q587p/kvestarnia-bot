export type PlannedCommand = "hunt" | "inventory" | "guild";

const plannedCommandMessages = {
  hunt: [
    "🗡️ Полювання ще точить ножі.",
    "Для першої безпечної сутички з хаосом уже є пригода: /adventure"
  ],
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
    "Доступно зараз: /start, /hero, /tavern, /adventure, /help"
  ].join("\n");
}
