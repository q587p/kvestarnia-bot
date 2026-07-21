import { getCombatSkillDisplay } from "../../services/fightService";
import { escapeHtml } from "./telegramHtml";

export type CombatActionNoticeSource = "skill" | "race" | "gear";

export function presentCombatActionCooldownNotice(source: CombatActionNoticeSource): string {
  switch (source) {
    case "skill":
      return "Класове вміння ще відсапується.";
    case "race":
      return "Расове вміння ще відсапується.";
    case "gear":
      return "Дія спорядження ще відсапується.";
  }
}

export function presentCombatActionManaNotice(source: CombatActionNoticeSource): string {
  switch (source) {
    case "skill":
      return "Не вистачає мани для класового вміння.";
    case "race":
      return "Не вистачає мани для расового вміння.";
    case "gear":
      return "Не вистачає мани для цієї дії спорядження.";
  }
}

export interface CombatSupportEffectView {
  healing?: number;
  guard?: number;
}

export function presentCombatSkillHtml(skillId: string | undefined): string {
  const skill = getCombatSkillDisplay(skillId);

  return `${skill.icon} <i>${escapeHtml(skill.name)}</i>`;
}

export function presentCombatSupportEffectLine(
  effect: CombatSupportEffectView,
  options: {
    boldNumbers?: boolean;
    separator?: string;
    healingPrefix?: string;
    guardPrefix?: string;
    guardWithoutAmountText?: string;
    showGuardAmount?: boolean;
  } = {}
): string {
  const parts = presentCombatSupportEffectParts(effect, options);

  return parts.length > 0 ? `Підтримка: ${parts.join(options.separator ?? "; ")}.` : "";
}

export function presentCombatSupportEffectParts(
  effect: CombatSupportEffectView,
  options: {
    boldNumbers?: boolean;
    healingPrefix?: string;
    guardPrefix?: string;
    guardWithoutAmountText?: string;
    showGuardAmount?: boolean;
  } = {}
): string[] {
  const healing = Math.max(0, Math.floor(effect.healing ?? 0));
  const guard = Math.max(0, Math.floor(effect.guard ?? 0));
  const showGuardAmount = options.showGuardAmount ?? true;
  const parts: string[] = [];

  if (healing > 0) {
    parts.push(`${options.healingPrefix ?? "HP підросли на"} ${formatCombatEffectNumber(healing, options.boldNumbers)}`);
  }

  if (guard > 0) {
    parts.push(showGuardAmount
      ? `${options.guardPrefix ?? "захист тримає"} ${formatCombatEffectNumber(guard, options.boldNumbers)}`
      : options.guardWithoutAmountText ?? "захист став міцнішим");
  }

  return parts;
}

function formatCombatEffectNumber(value: number, bold = false): string {
  return bold ? `<b>${value}</b>` : String(value);
}
