import { classes } from "../../content/classes";
import { races } from "../../content/races";
import type { CharacterSummary } from "../../domain/characters/characterSummary";

export function presentWelcome(): string {
  return [
    "🍺 Вітаємо в Квестарні.",
    "Оберіть, ким вас занесло в таверну: документи зачекають, пригода ні."
  ].join("\n");
}

export function presentRaceSelected(raceId: string): string {
  const race = races.find((candidate) => candidate.id === raceId);

  if (!race) {
    return "Не впізнала цю расу. Мабуть, вона зайшла через службовий вхід.";
  }

  return [`✅ Раса: ${race.name}`, race.description, "Тепер оберіть клас."].join("\n");
}

export function presentCharacterCreated(summary: CharacterSummary, created: boolean): string {
  const title = created ? "🎒 Героя створено." : "🎒 Герой уже чекає.";

  return [title, presentCharacterSummary(summary)].join("\n");
}

export function presentCharacterSummary(summary: CharacterSummary): string {
  return [
    `${summary.name} — ${summary.raceName}, ${summary.className}`,
    `Рівень ${summary.level} · XP ${summary.xp} · золото ${summary.gold}`,
    `HP ${summary.hpCurrent}/${summary.hpMax} · мана ${summary.manaCurrent}/${summary.manaMax}`
  ].join("\n");
}

export function presentInvalidCallback(): string {
  return "Ця кнопка вже втратила магію. Спробуйте /start ще раз.";
}

export function presentClassName(classId: string): string {
  return classes.find((candidate) => candidate.id === classId)?.name ?? classId;
}
