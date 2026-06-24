import type { CharacterSummary } from "../../domain/characters/characterSummary";
import {
  buildLevelGrowthBonus,
  createEmptyEquipmentEffectSummary
} from "../../domain/progression/effectiveStats";
import type { HeroActiveDrink } from "../../services/heroService";
import { getLocationName } from "../../services/presenceService";
import { escapeHtml } from "./telegramHtml";
import { presentLevelBonus } from "./levelGrowthPresenter";
import { presentHeroEquipmentEffectLines } from "./itemEffectPresenter";

export function presentHero(
  summary: CharacterSummary,
  options: { activeDrink?: HeroActiveDrink | null; inventoryGoldValue?: number } = {}
): string {
  const progressLine =
    summary.nextLevelXp === null
      ? `Рівень <b>${summary.level}</b> · XP ${summary.xp} · ви дійшли до краю поточної гри`
      : `Рівень <b>${summary.level}</b> · XP ${summary.xp} · до наступного: ${summary.xpToNextLevel} XP`;
  const nextLevelGrowthLine =
    summary.nextLevelXp === null
      ? null
      : presentLevelBonus(
          buildLevelGrowthBonus(
            summary.level,
            summary.level + 1,
            summary.classId,
            summary.raceId,
            summary.path
          )
        );
  const inventoryGoldValue = options.inventoryGoldValue;
  const goldLine =
    inventoryGoldValue === undefined
      ? `👛 Золото: <b>${summary.gold}</b>`
      : `👛 Золото: <b>${summary.gold}</b> <i>${presentWealthAside(summary.gold, inventoryGoldValue)}</i>`;
  const starterHint =
    summary.level < 3 ? ["", "<i>Далі: /tavern, /quest або /fight.</i>"] : [];
  const equipmentLines = presentHeroEquipmentEffectLines(
    summary.equipmentEffects ?? createEmptyEquipmentEffectSummary()
  );
  const resourceRecoveryLines = presentResourceRecovery(summary);
  const activeDrinkLine = presentActiveDrink(options.activeDrink ?? null);

  return [
    `👤 <b>${escapeHtml(summary.name)}</b>`,
    `<i>${escapeHtml(summary.raceName)} · ${escapeHtml(summary.className)}</i>`,
    "",
    `Титул: <i>${escapeHtml(summary.title)}</i>`,
    ...presentRemortLines(summary),
    "",
    progressLine,
    ...(nextLevelGrowthLine ? [`Зміна: ${nextLevelGrowthLine}`] : []),
    "",
    `❤️ HP ${summary.hpCurrent}/${summary.hpMax} · 🔮 мана ${summary.manaCurrent}/${summary.manaMax}`,
    ...resourceRecoveryLines,
    ...(activeDrinkLine ? ["", activeDrinkLine] : []),
    ...(resourceRecoveryLines.length > 0 || activeDrinkLine ? [""] : []),
    `Сили ${summary.stats.strength} · Спритн. ${summary.stats.dexterity} · Розум ${summary.stats.intelligence}`,
    `Харизма ${summary.stats.charisma} · Вдача ${summary.stats.luck}`,
    ...(equipmentLines.length > 0 ? ["", ...equipmentLines] : []),
    "",
    goldLine,
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

function presentActiveDrink(drink: HeroActiveDrink | null): string | null {
  if (!drink) {
    return null;
  }

  const effects = presentActiveDrinkEffects(drink);
  const effectText = effects.length > 0 ? ` — ${effects.join(", ")}` : "";

  return `${drink.emoji} Баф: <b>${escapeHtml(drink.name)}</b> ще ${formatRemainingMinutes(drink.expiresAt)}${effectText}.`;
}

function presentActiveDrinkEffects(drink: HeroActiveDrink): string[] {
  if (drink.phase === "queued") {
    return ["чекає PvE бою", "шкода туди/назад ×1.13"];
  }

  const effects: string[] = [];

  if (drink.recoveryMultiplierBp && drink.recoveryMultiplierBp !== 10000) {
    effects.push(`відновлення ×${formatMultiplier(drink.recoveryMultiplierBp)}`);
  }

  if (drink.accuracyPenaltyPp) {
    effects.push(`точність −${drink.accuracyPenaltyPp}`);
  }

  return effects;
}

function formatMultiplier(multiplierBp: number): string {
  return (multiplierBp / 10_000).toFixed(2);
}

function formatRemainingMinutes(expiresAt: Date): string {
  const remainingMinutes = Math.ceil((expiresAt.getTime() - Date.now()) / 60_000);

  if (remainingMinutes <= 0) {
    return "менше 1 хв";
  }

  return `${remainingMinutes} хв`;
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
