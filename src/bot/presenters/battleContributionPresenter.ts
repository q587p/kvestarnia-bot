import { escapeHtml } from "./telegramHtml";

export interface BattleContributionValues {
  damage: number;
  healing: number;
  guardPrevented: number;
  control: number;
  damageTaken: number;
  actions: number;
  specialActions: number;
  guardedTurns: number;
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
  return `${escapeHtml(name)}: ⚔️ ${values.damage}, ❤️ ${values.healing}, 🛡️ ${values.guardPrevented}, ` +
    `🌀 ${values.control}, 💥 ${values.damageTaken}, ✅ ${values.actions}, ` +
    `✨ ${values.specialActions}, 🧱 ${values.guardedTurns}`;
}
