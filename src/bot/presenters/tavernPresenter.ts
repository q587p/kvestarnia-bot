import type { TavernRaidResult } from "../../services/tavernRaidService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { presentRewardLevelGrowth } from "./levelGrowthPresenter";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, npcQuote } from "./telegramHtml";

export function presentTavern(character: CharacterSummary): string {
  return [
    "🍺 Таверна Квестарні",
    `${escapeHtml(character.name)} · ${escapeHtml(character.title)}`,
    "",
    "У кутку героїчно піниться Бочка Пінного Міражу.",
    "",
    npcQuote("Шинкар", "Це не проблема. Це рейд на 1-3 хвилини."),
    "",
    "Що робимо?"
  ].join("\n");
}

export function presentTavernAlreadyRaided(character: CharacterSummary): string {
  return [
    "🍺 Таверна Квестарні",
    `${escapeHtml(character.name)} · ${escapeHtml(character.title)}`,
    "",
    "Бочка Пінного Міражу сьогодні вже пережила ваш героїзм.",
    "",
    npcQuote("Шинкар", "Вона просила передати: завтра знову буде хоробра. Можливо."),
    "",
    "Поки що можна перевірити героя: /hero"
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
      presentRewardAmount({
        xp: result.reward.xp,
        gold: result.reward.gold,
        label: "Вже отримано"
      }),
      "Повертайтесь завтра або перевірте героя: /hero"
    ].join("\n");
  }

  const lines = [
    "🍺 Рейд завершено!",
    "Ви штурмували Бочку Пінного Міражу. Бочка відступила стратегічною піною.",
    "",
    presentRewardAmount(result.reward),
    ...presentItemGrantLines(result.reward.itemGrants)
  ];

  lines.push(...presentRewardLevelGrowth(result.levelChange, result.character.classId));

  return lines.join("\n");
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
