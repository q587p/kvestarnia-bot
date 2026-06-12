import {
  findClass,
  findRace,
  getComboTitle,
  getPronounLabel
} from "../../content/characterOptions";
import { classes } from "../../content/classes";
import type { Pronoun } from "../../content/schema";
import type { CharacterSummary } from "../../domain/characters/characterSummary";

export function presentWelcome(): string {
  return [
    "🍺 Вітаємо в Квестарні.",
    "Оберіть, як до вас звертатися: шинкарю треба хоч щось записати в журнал."
  ].join("\n");
}

export function presentGenderSelected(pronoun: Pronoun): string {
  return [
    `✅ Звертання: ${getPronounLabel(pronoun)}`,
    "Тепер оберіть расу.",
    "Деякі варіянти втекли від вашої біографії."
  ].join("\n");
}

export function presentRaceSelected(pronoun: Pronoun, raceId: string): string {
  const race = findRace(raceId);

  if (!race) {
    return "Не впізнала цю расу. Мабуть, вона зайшла через службовий вхід.";
  }

  return [
    `✅ Звертання: ${getPronounLabel(pronoun)}`,
    `✅ Раса: ${race.name}`,
    race.description,
    "Тепер оберіть клас."
  ].join("\n");
}

export function presentClassSelected(pronoun: Pronoun, raceId: string, classId: string): string {
  const race = findRace(raceId);
  const characterClass = findClass(classId);

  if (!race || !characterClass) {
    return presentInvalidCallback();
  }

  return [
    "Ви майже готові стати пригодою для місцевої статистики.",
    "",
    `Стать: ${getPronounLabel(pronoun)}`,
    `Раса: ${race.name}`,
    `Клас: ${characterClass.name}`,
    `Титул: ${getComboTitle(raceId, classId)}`,
    "",
    "Почати?"
  ].join("\n");
}

export function presentCharacterCreated(summary: CharacterSummary, created: boolean): string {
  const title = created ? "🎒 Героя створено." : "🎒 Герой уже чекає.";

  return [title, presentCharacterSummary(summary)].join("\n");
}

export function presentCharacterSummary(summary: CharacterSummary): string {
  return [
    `${summary.name} — ${summary.raceName}, ${summary.className}`,
    `Стать: ${summary.pronounLabel} · Титул: ${summary.title}`,
    `Рівень ${summary.level} · XP ${summary.xp} · золото ${summary.gold}`,
    `HP ${summary.hpCurrent}/${summary.hpMax} · мана ${summary.manaCurrent}/${summary.manaMax}`
  ].join("\n");
}

export function presentUnavailableChoice(reason: string): string {
  return reason;
}

export function presentInvalidCallback(): string {
  return "Ця кнопка вже втратила магію. Спробуйте /start ще раз.";
}

export function presentClassName(classId: string): string {
  return classes.find((candidate) => candidate.id === classId)?.name ?? classId;
}
