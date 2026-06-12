import type { CharacterSummary } from "../../domain/characters/characterSummary";

export function presentHero(summary: CharacterSummary): string {
  return [
    `👤 ${summary.name}`,
    `${summary.raceName} · ${summary.className}`,
    `Стать: ${summary.pronounLabel} · Титул: ${summary.title}`,
    `Рівень ${summary.level} · XP ${summary.xp} · золото ${summary.gold}`,
    `HP ${summary.hpCurrent}/${summary.hpMax} · мана ${summary.manaCurrent}/${summary.manaMax}`,
    `Сили ${summary.stats.strength} · Спритн. ${summary.stats.dexterity} · Розум ${summary.stats.intelligence}`,
    `Харизма ${summary.stats.charisma} · Вдача ${summary.stats.luck}`,
    "Далі: зазирніть у таверну або чекайте пригоди в наступному PR."
  ].join("\n");
}

export function presentHeroMissing(): string {
  return "Героя ще немає. Напишіть /start, і Квестарня знайде вам куток біля каміна.";
}
