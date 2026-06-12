import {
  findClass,
  findRace,
  getPronounLabel
} from "../../content/characterOptions";
import { classes } from "../../content/classes";
import type { Pronoun } from "../../content/schema";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { escapeHtml } from "./telegramHtml";

export function presentWelcome(): string {
  return [
    "🍺 Вітаємо в Квестарні.",
    "",
    "Оберіть, як до вас звертатися: шинкарю треба хоч щось записати в журнал."
  ].join("\n");
}

export function presentGenderSelected(pronoun: Pronoun): string {
  return [
    `✅ Звертання: <b>${escapeHtml(getPronounLabel(pronoun))}</b>`,
    "",
    "Тепер оберіть расу.",
    "",
    "Деякі варіянти втекли від вашої біографії."
  ].join("\n");
}

export function presentRaceSelected(pronoun: Pronoun, raceId: string): string {
  const race = findRace(raceId);

  if (!race) {
    return "Не впізнала цю расу. Мабуть, вона зайшла через службовий вхід.";
  }

  return [
    `✅ Звертання: <b>${escapeHtml(getPronounLabel(pronoun))}</b>`,
    "",
    `✅ Раса: <b>${escapeHtml(race.name)}</b>`,
    "",
    `<i>${escapeHtml(race.description)}</i>`,
    "",
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
    `✅ Звертання: <b>${escapeHtml(getPronounLabel(pronoun))}</b>`,
    "",
    `✅ Раса: <b>${escapeHtml(race.name)}</b>`,
    "",
    `✅ Клас: <b>${escapeHtml(characterClass.name)}</b>`,
    "",
    `<i>${escapeHtml(characterClass.description)}</i>`,
    "",
    "Почати?"
  ].join("\n");
}

export function presentCharacterCreated(summary: CharacterSummary, created: boolean): string {
  const title = created ? "🎒 Героя створено." : "🎒 Герой уже чекає.";

  return [title, "", presentCharacterSummary(summary)].join("\n");
}

export function presentCharacterSummary(summary: CharacterSummary): string {
  return [
    `<b>${escapeHtml(summary.name)}</b>`,
    `<i>${escapeHtml(summary.raceName)} · ${escapeHtml(summary.className)}</i>`,
    "",
    `Звертання: <b>${escapeHtml(summary.pronounLabel)}</b> · Титул: <i>${escapeHtml(summary.title)}</i>`,
    `Рівень ${summary.level} · XP ${summary.xp} · золото ${summary.gold}`,
    "",
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
