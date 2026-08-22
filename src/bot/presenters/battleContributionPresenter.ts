import { escapeHtml } from "./telegramHtml";

export interface BattleContributionValues {
  damage: number | null;
  healing: number | null;
  guardPrevented: number | null;
  control: number | null;
  damageTaken: number | null;
  actions: number | null;
  specialActions: number | null;
  guardedTurns: number | null;
}

export function presentBattleContributionLegend(): string[] {
  return [
    "⚔️ шкода суперникам · ❤️ лікування · 🛡️ відвернена шкода",
    "🌀 послаблена відповідь · 💥 отримана шкода · ✅ дії",
    "✨ спецатаки · 🧱 захисні ходи"
  ];
}

export function presentBattleContributionLine(
  name: string,
  values: BattleContributionValues
): string {
  return `${escapeHtml(name)}: ⚔️ ${presentValue(values.damage)}, ❤️ ${presentValue(values.healing)}, 🛡️ ${presentValue(values.guardPrevented)}, ` +
    `🌀 ${presentValue(values.control)}, 💥 ${presentValue(values.damageTaken)}, ✅ ${presentValue(values.actions)}, ` +
    `✨ ${presentValue(values.specialActions)}, 🧱 ${presentValue(values.guardedTurns)}`;
}

function presentValue(value: number | null): string {
  return value === null ? "—" : String(Math.max(0, Math.floor(value)));
}
