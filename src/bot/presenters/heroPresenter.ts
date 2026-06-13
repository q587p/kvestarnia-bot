import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { getLocationName } from "../../services/presenceService";
import { escapeHtml } from "./telegramHtml";
import { presentLevelBonus } from "./levelGrowthPresenter";

export function presentHero(
  summary: CharacterSummary,
  options: { inventoryGoldValue?: number } = {}
): string {
  const progressLine =
    summary.nextLevelXp === null
      ? `Рівень <b>${summary.level}</b> · XP ${summary.xp} · поточна стеля альфи`
      : `Рівень <b>${summary.level}</b> · XP ${summary.xp} · до наступного: ${summary.xpToNextLevel} XP`;
  const growthLine = presentLevelBonus(summary.levelBonus);
  const inventoryGoldValue = options.inventoryGoldValue ?? 0;
  return [
    `👤 <b>${escapeHtml(summary.name)}</b>`,
    `<i>${escapeHtml(summary.raceName)} · ${escapeHtml(summary.className)}</i>`,
    "",
    `Титул: <i>${escapeHtml(summary.title)}</i>`,
    "",
    progressLine,
    ...(growthLine ? [`Ріст: ${growthLine}`] : []),
    "",
    `❤️ HP ${summary.hpCurrent}/${summary.hpMax} · 🔮 мана ${summary.manaCurrent}/${summary.manaMax}`,
    `Сили ${summary.stats.strength} · Спритн. ${summary.stats.dexterity} · Розум ${summary.stats.intelligence}`,
    `Харизма ${summary.stats.charisma} · Вдача ${summary.stats.luck}`,
    "",
    `🪙 Золото: <b>${summary.gold}</b> <i>${presentWealthAside(summary.gold, inventoryGoldValue)}</i>`,
    "",
    `Зараз пригодник тут: <b>${escapeHtml(getLocationName(summary.currentLocationId ?? ""))}</b>.`,
    "",
    "<i>Далі: /tavern, /quest або /fight.</i>"
  ].join("\n");
}

export function presentHeroMissing(): string {
  return "Пригодника ще немає. Напишіть /start, і Квестарня знайде вам куток біля каміна.";
}

function presentWealthAside(gold: number, inventoryGoldValue: number): string {
  if (gold <= 0 && inventoryGoldValue <= 0) {
    return "(і в манатках ще 0; корчмар поставив риску в графі «надії»)";
  }

  if (gold <= 0) {
    return `(золота 0, зате в манатках ще ${inventoryGoldValue}; корчмар примружився на майбутню бухгалтерію)`;
  }

  if (inventoryGoldValue <= 0) {
    return "(а в манатках ще 0; торба чесна, аж нудно)";
  }

  return `(а в манатках ще ${inventoryGoldValue}; корчмар уже примружився)`;
}
