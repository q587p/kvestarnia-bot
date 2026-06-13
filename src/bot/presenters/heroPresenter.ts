import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { getLocationName } from "../../services/presenceService";
import { escapeHtml } from "./telegramHtml";
import { presentLevelBonus } from "./levelGrowthPresenter";

export function presentHero(summary: CharacterSummary): string {
  const progressLine =
    summary.nextLevelXp === null
      ? `Рівень <b>${summary.level}</b> · XP ${summary.xp} · поточна стеля альфи`
      : `Рівень <b>${summary.level}</b> · XP ${summary.xp} · до наступного: ${summary.xpToNextLevel} XP`;
  const growthLine = presentLevelBonus(summary.levelBonus);
  return [
    `👤 <b>${escapeHtml(summary.name)}</b>`,
    `<i>${escapeHtml(summary.raceName)} · ${escapeHtml(summary.className)}</i>`,
    "",
    `Титул: <i>${escapeHtml(summary.title)}</i>`,
    "",
    progressLine,
    "",
    `HP ${summary.hpCurrent}/${summary.hpMax} · мана ${summary.manaCurrent}/${summary.manaMax}`,
    `Сили ${summary.stats.strength} · Спритн. ${summary.stats.dexterity} · Розум ${summary.stats.intelligence}`,
    `Харизма ${summary.stats.charisma} · Вдача ${summary.stats.luck}`,
    ...(growthLine ? ["", `Ріст: ${growthLine}`] : []),
    "",
    `Золото: <b>${summary.gold}</b>`,
    "",
    `Зараз герой тут: <b>${escapeHtml(getLocationName(summary.currentLocationId ?? ""))}</b>.`,
    "",
    "<i>Далі: /tavern, /quest або /fight.</i>"
  ].join("\n");
}

export function presentHeroMissing(): string {
  return "Героя ще немає. Напишіть /start, і Квестарня знайде вам куток біля каміна.";
}
