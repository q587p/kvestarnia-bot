import type { HuntLookupResult, HuntResult } from "../../services/huntService";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml } from "./telegramHtml";

export function presentHuntBoard(result: Extract<HuntLookupResult, { state: "ready" }>): string {
  const monster = result.contract.monster;
  const lines = [
    "🏹 Дошка полювання",
    `${escapeHtml(result.character.name)} · ${escapeHtml(result.character.title)}`,
    "",
    "Корчмар пришпилив сьогоднішню проблему. Вона ще не знає, що стала паперовою.",
    "",
    `Ціль: <b>${escapeHtml(monster.name)}</b> · рівень ${monster.level}`,
    `<i>${escapeHtml(monster.description)}</i>`
  ];

  if (result.contract.startFlavor) {
    lines.push("", escapeHtml(result.contract.startFlavor));
  }

  lines.push("", "Це не повний бій. Це дошка, три варіянти й трохи відповідальности.", "", "Що робимо?");

  return lines.join("\n");
}

export function presentHuntNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Дошка полювання не видає проблеми порожнім графам.";
}

export function presentHuntAlreadyCompleted(
  result:
    | Extract<HuntLookupResult, { state: "already-completed" }>
    | Extract<HuntResult, { state: "already-completed" }>
): string {
  return [
    "🏹 Сьогоднішнє полювання вже зараховано.",
    "",
    `<b>${escapeHtml(result.contract.monster.name)}</b> внесено в журнал як «проблема, що мала плани».`,
    "",
    "Повертайтесь завтра або перевірте персонажа: /hero"
  ].join("\n");
}

export function presentHuntStalePeriod(
  _result: Extract<HuntResult, { state: "stale-period" }>
): string {
  void _result;

  return [
    "🏹 Цей листок дошки вже вчорашній.",
    "",
    "Корчмар прибрав старі проблеми й вивісив нові. Оновіть дошку: /hunt"
  ].join("\n");
}

export function presentHuntResult(result: Exclude<HuntResult, { state: "no-character" }>): string {
  if (result.state === "stale-period") {
    return presentHuntStalePeriod(result);
  }

  if (result.state === "already-completed") {
    return presentHuntAlreadyCompleted(result);
  }

  const lines = [
    ...presentOutcome(result),
    ...presentOutcomeFlavor(result.outcomeFlavor),
    "",
    presentRewardAmount({ ...result.reward, label: "Нагорода" }),
    ...presentItemGrantBlock(result.reward.itemGrants),
    "",
    "Наступний крок: /hero"
  ];

  return lines.join("\n");
}

function presentOutcome(
  result: Extract<HuntResult, { state: "completed" }>
): string[] {
  const monsterName = escapeHtml(result.contract.monster.name);

  if (result.action === "strike") {
    return [
      "🗡️ Ви вдарили по проблемі.",
      "",
      `<b>${monsterName}</b> отримує аргумент, який важко оскаржити без шолома.`
    ];
  }

  if (result.action === "trick") {
    return [
      "🎭 Ви обдурили проблему.",
      "",
      `<b>${monsterName}</b> підписує власний відступ і ще просить копію.`
    ];
  }

  return [
    "🏃 Ви відступили з актом.",
    "",
    `<b>${monsterName}</b> вважає це своєю перемогою. Корчмар вважає це закритою справою.`
  ];
}

function presentOutcomeFlavor(flavor: string | null): string[] {
  return flavor ? ["", escapeHtml(flavor)] : [];
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
