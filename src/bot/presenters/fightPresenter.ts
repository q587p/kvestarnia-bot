import { MIMIC_SHAWARMA_HP } from "../../domain/combat/combatProbe";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { FightLookupResult, FightResult } from "../../services/fightService";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml } from "./telegramHtml";

export function presentFightStart(character: CharacterSummary): string {
  return [
    "⚔️ Сутичка з підозрілим монстром",
    "Те, що мало бути шаурмою, розкриває зуби. Це Мімік-шаурма, і вечеря щойно стала переговорами.",
    ...presentCharacterFlavor(character, "quest.start", "fight"),
    "",
    `❤️ Ви: ${character.hpCurrent}/${character.hpMax}   🌯 Мімік: ${MIMIC_SHAWARMA_HP}/${MIMIC_SHAWARMA_HP}`,
    "",
    "Що робимо?"
  ].join("\n");
}

export function presentFightNoCharacter(): string {
  return "Спершу створіть героя через /start. Мімік-шаурма не бʼється з анонімами: погано для бухгалтерії.";
}

export function presentFightAlreadyCompleted(
  result:
    | Extract<FightLookupResult, { state: "already-completed" }>
    | Extract<FightResult, { state: "already-completed" }>
): string {
  const lines = [
    "🌯 Сьогоднішню сутичку вже зараховано.",
    "",
    "Мімік лежить тихо й робить вигляд, що він просто лаваш."
  ];

  if (result.questAvailable) {
    lines.push("", "Якщо шаурму ще не допитували, можна в /quest.");
  } else {
    lines.push("", "Повертайтесь завтра або перевірте героя: /hero");
  }

  return lines.join("\n");
}

export function presentFightResult(result: Exclude<FightResult, { state: "no-character" }>): string {
  if (result.state === "already-completed") {
    return presentFightAlreadyCompleted(result);
  }

  const lines = [
    ...presentOutcome(result),
    ...presentCharacterFlavor(result.character, "quest.outcome", "fight", result.action),
    "",
    `❤️ Ви: ${result.combat.playerHpPreview}/${result.combat.playerHpMaxPreview}   🌯 Мімік: ${result.combat.enemyHpPreview}/${result.combat.enemyHpMaxPreview}`,
    "",
    presentRewardAmount({ ...result.reward, label: "Нагорода" }),
    ...presentItemGrantBlock(result.reward.itemGrants)
  ];

  lines.push("", "Наступний крок: /hero");

  return lines.join("\n");
}

function presentCharacterFlavor(
  character: CharacterSummary,
  placement: "quest.start" | "quest.outcome",
  scene: "fight",
  action?: "attack" | "receipt" | "flee"
): string[] {
  const flavor = selectCharacterFlavorLine(character, {
    placement,
    scene,
    ...(action ? { action } : {})
  });

  return flavor ? ["", escapeHtml(flavor.text)] : [];
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
    `${escapeHtml(result.character.name)} зберіг обличчя, нерви й підозру до лаваша.`
  ];
}

function presentItemGrantBlock(itemGrants: Array<{ name: string; quantity: number }>): string[] {
  if (itemGrants.length === 0) {
    return [];
  }

  return [
    "",
    ...itemGrants.map((grant) =>
      presentRewardItemGrant({
        name: escapeHtml(grant.name),
        quantity: grant.quantity
      })
    )
  ];
}
