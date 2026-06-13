import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { AdventureLookupResult, AdventureResult } from "../../services/adventureService";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, npcQuote } from "./telegramHtml";

export function presentAdventureStart(character: CharacterSummary): string {
  const flavor = presentCharacterFlavor(character, "quest.start", "shawarma");

  return [
    "🌯 Підозріла шаурма",
    "",
    "На столі лежить шаурма. Вона дихає.",
    "",
    npcQuote("Корчмар", "То не моя."),
    ...flavor,
    "",
    `<b>${escapeHtml(character.name)}</b>, що робимо?`
  ].join("\n");
}

export function presentAdventureNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Шаурма не розмовляє з анонімами.";
}

export function presentAdventureAlreadyCompleted(
  result: Extract<AdventureLookupResult, { state: "already-completed" }>
): string {
  const lines = [
    "🌯 Шаурма вже дала свідчення.",
    "",
    "Сьогоднішній квест із підозрілою шаурмою зараховано. Вона лежить тихо й удає звичайну вечерю."
  ];

  if (result.fightAvailable) {
    lines.push("", "Якщо хочеться ще трохи формальної сутички, можна в /fight.");
  } else {
    lines.push("", "Повертайтесь завтра або перевірте персонажа: /hero");
  }

  return lines.join("\n");
}

export function presentAdventureResult(result: Exclude<AdventureResult, { state: "no-character" }>): string {
  if (result.state === "already-completed") {
    return [
      "🌯 Сьогоднішню шаурму вже допитано.",
      "Вона мовчить, але юридично все зрозуміло.",
      "",
      "Повертайтесь завтра або перевірте персонажа: /hero"
    ].join("\n");
  }

  const lines = [
    ...presentActionOutcome(result.action),
    ...presentCharacterFlavor(result.character, "quest.outcome", "shawarma", result.action),
    "",
    presentRewardAmount(result.reward),
    ...presentItemGrantLines(result.reward.itemGrants)
  ];

  return lines.join("\n");
}

function presentCharacterFlavor(
  character: CharacterSummary,
  placement: "quest.start" | "quest.outcome",
  scene: "shawarma",
  action?: "poke" | "receipt" | "flee"
): string[] {
  const flavor = selectCharacterFlavorLine(character, {
    placement,
    scene,
    ...(action ? { action } : {})
  });

  return flavor ? ["", escapeHtml(flavor.text)] : [];
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

function presentItemGrantLines(itemGrants: Array<{ name: string; quantity: number }>): string[] {
  if (itemGrants.length === 0) {
    return [];
  }

  return itemGrants.map(
    (grant) =>
      presentRewardItemGrant({
        name: escapeHtml(grant.name),
        quantity: grant.quantity
      })
  );
}
