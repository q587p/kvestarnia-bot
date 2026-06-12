import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { escapeHtml } from "./telegramHtml";

export function presentHero(summary: CharacterSummary): string {
  return [
    `👤 <b>${escapeHtml(summary.name)}</b>`,
    `<i>${escapeHtml(summary.raceName)} · ${escapeHtml(summary.className)}</i>`,
    "",
    `Звертання: ${escapeHtml(summary.pronounLabel)} · Титул: ${escapeHtml(summary.title)}`,
    `Рівень <b>${summary.level}</b> · XP ${summary.xp} · золото ${summary.gold}`,
    "",
    `HP ${summary.hpCurrent}/${summary.hpMax} · мана ${summary.manaCurrent}/${summary.manaMax}`,
    `Сили ${summary.stats.strength} · Спритн. ${summary.stats.dexterity} · Розум ${summary.stats.intelligence}`,
    `Харизма ${summary.stats.charisma} · Вдача ${summary.stats.luck}`,
    "",
    "<i>Далі: /tavern або /adventure, якщо шаурма дивиться першою.</i>"
  ].join("\n");
}

export function presentHeroMissing(): string {
  return "Героя ще немає. Напишіть /start, і Квестарня знайде вам куток біля каміна.";
}
