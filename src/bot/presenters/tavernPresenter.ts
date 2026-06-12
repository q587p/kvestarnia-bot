import type { TavernRaidResult } from "../../services/tavernRaidService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { escapeHtml, npcQuote } from "./telegramHtml";

export function presentTavern(character: CharacterSummary): string {
  return [
    "🍺 Таверна Квестарні",
    `${escapeHtml(character.name)} · ${escapeHtml(character.title)}`,
    "",
    "У кутку героїчно піниться Бочка Пінного Міражу.",
    npcQuote("Шинкар", "Це не проблема. Це рейд на 1-3 хвилини."),
    "",
    "Що робимо?"
  ].join("\n");
}

export function presentTavernNoCharacter(): string {
  return "Спершу створіть героя через /start. Бочка не воює з анонімами.";
}

export function presentTavernRaidResult(result: Exclude<TavernRaidResult, { state: "no-character" }>): string {
  if (result.state === "already-completed") {
    return [
      "🍺 Бочка вас пам’ятає.",
      "Сьогоднішній рейд уже зараховано. Вона все ще трохи нервує.",
      "",
      `Вже отримано: +${result.reward.xp} XP · +${result.reward.gold} золота`,
      "Повертайтесь завтра або перевірте героя: /hero"
    ].join("\n");
  }

  const lines = [
    "🍺 Рейд завершено!",
    "Ви штурмували Бочку Пінного Міражу. Бочка відступила стратегічною піною.",
    "",
    `+${result.reward.xp} XP · +${result.reward.gold} золота`,
    `Здобуто: ${result.reward.flavor}`
  ];

  if (result.levelChange.leveledUp) {
    lines.push(`Рівень підріс: ${result.levelChange.oldLevel} → ${result.levelChange.newLevel}`);
  }

  return lines.join("\n");
}
