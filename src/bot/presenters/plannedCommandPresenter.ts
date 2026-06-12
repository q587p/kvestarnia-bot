export type PlannedCommand = "quest" | "hunt" | "inventory" | "guild";

const plannedCommandMessages = {
  quest: [
    "🗺️ Квести ще збирають підписи.",
    "Поки квестодавець шукає печатку, можна сходити в таверну: /tavern"
  ],
  hunt: [
    "🗡️ Полювання ще точить ножі.",
    "Для першої безпечної сутички з хаосом уже є малий рейд: /tavern"
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
  return [...plannedCommandMessages[command], "", "Доступно зараз: /start, /hero, /tavern, /help"].join(
    "\n"
  );
}
