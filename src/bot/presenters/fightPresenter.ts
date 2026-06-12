import { MIMIC_SHAWARMA_HP } from "../../domain/combat/combatProbe";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { FightResult } from "../../services/fightService";
import { presentItemNameWithQuantity } from "./itemStackPresenter";
import { presentRewardLevelGrowth } from "./levelGrowthPresenter";
import { escapeHtml } from "./telegramHtml";

export function presentFightStart(character: CharacterSummary): string {
  return [
    "⚔️ Сутичка з Міміком-шаурмою",
    "Шаурма розкрила зуби. Це вже не вечеря, це переговори.",
    "",
    `❤️ Ви: ${character.hpCurrent}/${character.hpMax}   🌯 Мімік: ${MIMIC_SHAWARMA_HP}/${MIMIC_SHAWARMA_HP}`,
    "",
    "Що робимо?"
  ].join("\n");
}

export function presentFightNoCharacter(): string {
  return "Спершу створіть героя через /start. Мімік-шаурма не бʼється з анонімами: погано для бухгалтерії.";
}

export function presentFightResult(result: Exclude<FightResult, { state: "no-character" }>): string {
  if (result.state === "already-completed") {
    return [
      "🌯 Сьогоднішню сутичку вже зараховано.",
      "Мімік лежить тихо й робить вигляд, що він просто лаваш.",
      "",
      "Повертайтесь завтра або перевірте героя: /hero"
    ].join("\n");
  }

  const lines = [
    ...presentOutcome(result),
    "",
    `❤️ Ви: ${result.combat.playerHpPreview}/${result.combat.playerHpMaxPreview}   🌯 Мімік: ${result.combat.enemyHpPreview}/${result.combat.enemyHpMaxPreview}`,
    presentRewardLine(result.reward.xp, result.reward.gold),
    ...presentItemGrantLines(result.reward.itemGrants)
  ];

  lines.push(...presentRewardLevelGrowth(result.levelChange, result.character.classId));

  lines.push("Наступний крок: /hero");

  return lines.join("\n");
}

function presentOutcome(
  result: Exclude<FightResult, { state: "no-character" | "already-completed" }>
): string[] {
  if (result.action === "attack") {
    return [
      "🗡️ Ви вдарили Міміка-шаурму.",
      `Він отримав ${result.combat.playerDamage} шкоди й задумався про карʼєру салату.`
    ];
  }

  if (result.action === "receipt") {
    return [
      "📋 Ви показали чек.",
      `Мімік отримав ${result.combat.playerDamage} шкоди від формальної ввічливості.`
    ];
  }

  return [
    "🏃 Ви відступили красиво.",
    `${result.character.name} зберіг обличчя, нерви й підозру до лаваша.`
  ];
}

function presentRewardLine(xp: number, gold: number): string {
  if (gold <= 0) {
    return `Нагорода: +${xp} XP`;
  }

  return `Нагорода: +${xp} XP · +${gold} золота`;
}

function presentItemGrantLines(itemGrants: Array<{ name: string; quantity: number }>): string[] {
  if (itemGrants.length === 0) {
    return [];
  }

  return itemGrants.map(
    (grant) =>
      `Здобуто: ${presentItemNameWithQuantity({
        name: escapeHtml(grant.name),
        quantity: grant.quantity
      })}`
  );
}
