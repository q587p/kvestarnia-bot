import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { AdventureResult } from "../../services/adventureService";
import { escapeHtml, npcQuote } from "./telegramHtml";

export function presentAdventureStart(character: CharacterSummary): string {
  return [
    "🌯 Підозріла шаурма",
    "На столі лежить шаурма. Вона дихає.",
    "",
    npcQuote("Шинкар", "То не моя."),
    "",
    `${escapeHtml(character.name)}, що робимо?`
  ].join("\n");
}

export function presentAdventureNoCharacter(): string {
  return "Спершу створіть героя через /start. Шаурма не розмовляє з анонімами.";
}

export function presentAdventureResult(result: Exclude<AdventureResult, { state: "no-character" }>): string {
  if (result.state === "already-completed") {
    return [
      "🌯 Сьогоднішню шаурму вже допитано.",
      "Вона мовчить, але юридично все зрозуміло.",
      "",
      "Повертайтесь завтра або перевірте героя: /hero"
    ].join("\n");
  }

  const lines = [
    ...presentActionOutcome(result.action),
    "",
    presentRewardLine(result.reward.xp, result.reward.gold)
  ];

  if (result.levelChange.leveledUp) {
    lines.push(`Рівень підріс: ${result.levelChange.oldLevel} → ${result.levelChange.newLevel}`);
  }

  return lines.join("\n");
}

function presentActionOutcome(action: "poke" | "receipt" | "flee"): string[] {
  if (action === "poke") {
    return [
      "🏆 Шаурму викрито!",
      "Мімік визнав, що був не вечерею, а життєвим уроком."
    ];
  }

  if (action === "receipt") {
    return [
      "📋 Чек знайдено!",
      "Мімік-шаурма не очікував бухгалтерського підходу."
    ];
  }

  return [
    "🏃 Тактичний відступ",
    "Ви обережно відійшли. Шаурма образилась, але юридично нічого не доведе."
  ];
}

function presentRewardLine(xp: number, gold: number): string {
  if (gold <= 0) {
    return `+${xp} XP`;
  }

  return `+${xp} XP · +${gold} золота`;
}
