import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { createEmptyEquipmentEffectSummary } from "../../domain/progression/effectiveStats";
import { getLocationName } from "../../services/presenceService";
import { escapeHtml } from "./telegramHtml";
import { presentLevelBonus } from "./levelGrowthPresenter";
import { presentHeroEquipmentEffectLines } from "./itemEffectPresenter";

export function presentHero(
  summary: CharacterSummary,
  options: { inventoryGoldValue?: number } = {}
): string {
  const progressLine =
    summary.nextLevelXp === null
      ? `Рівень <b>${summary.level}</b> · XP ${summary.xp} · ви дійшли до краю поточної гри`
      : `Рівень <b>${summary.level}</b> · XP ${summary.xp} · до наступного: ${summary.xpToNextLevel} XP`;
  const growthLine = presentLevelBonus(summary.levelBonus);
  const inventoryGoldValue = options.inventoryGoldValue ?? 0;
  const starterHint =
    summary.level < 3 ? ["", "<i>Далі: /tavern, /quest або /fight.</i>"] : [];
  const equipmentLines = presentHeroEquipmentEffectLines(
    summary.equipmentEffects ?? createEmptyEquipmentEffectSummary()
  );
  const resourceRecoveryLines = presentResourceRecovery(summary);

  return [
    `👤 <b>${escapeHtml(summary.name)}</b>`,
    `<i>${escapeHtml(summary.raceName)} · ${escapeHtml(summary.className)}</i>`,
    "",
    `Титул: <i>${escapeHtml(summary.title)}</i>`,
    ...presentRemortLines(summary),
    "",
    progressLine,
    ...(growthLine ? [`Ріст: ${growthLine}`] : []),
    "",
    `❤️ HP ${summary.hpCurrent}/${summary.hpMax} · 🔮 мана ${summary.manaCurrent}/${summary.manaMax}`,
    ...resourceRecoveryLines,
    ...(resourceRecoveryLines.length > 0 ? [""] : []),
    `Сили ${summary.stats.strength} · Спритн. ${summary.stats.dexterity} · Розум ${summary.stats.intelligence}`,
    `Харизма ${summary.stats.charisma} · Вдача ${summary.stats.luck}`,
    ...(equipmentLines.length > 0 ? ["", ...equipmentLines] : []),
    "",
    `👛 Золото: <b>${summary.gold}</b> <i>${presentWealthAside(summary.gold, inventoryGoldValue)}</i>`,
    "",
    `Зараз пригодник тут: <b>${escapeHtml(getLocationName(summary.currentLocationId ?? ""))}</b>.`,
    ...starterHint
  ].join("\n");
}

function presentRemortLines(summary: CharacterSummary): string[] {
  const count = summary.remortCount ?? 0;
  const memoryRank = summary.remortMemoryRank ?? 0;

  if (count <= 0 && memoryRank <= 0) {
    return [];
  }

  return [
    "",
    `🕯️ Памʼять минулих пригод: <b>${count}</b>`
  ];
}

export function presentHeroMissing(): string {
  return "Пригодника ще немає. Напишіть /start, і Квестарня знайде вам куток біля каміна.";
}

function presentResourceRecovery(summary: CharacterSummary): string[] {
  const recovery = summary.resourceRecovery;

  if (!recovery) {
    return [];
  }

  const parts = [
    recovery.hpSecondsToFull > 0 ? `HP за ~${presentDuration(recovery.hpSecondsToFull)}` : null,
    recovery.manaSecondsToFull > 0 ? `мана за ~${presentDuration(recovery.manaSecondsToFull)}` : null
  ].filter((part): part is string => part !== null);
  const lines = parts.length > 0 ? [`Відновлення: ${parts.join(" · ")}`] : [];

  if (summary.hpCurrent <= 0) {
    lines.push("Стан: HP 0 — спершу відпочиньте, тоді /fight.");
  }

  return lines;
}

function presentDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.ceil(safeSeconds / 60);

  if (minutes <= 1) {
    return "1 хв";
  }

  return `${minutes} хв`;
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
