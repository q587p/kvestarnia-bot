import type { HuntLookupResult, HuntResult } from "../../services/huntService";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export function presentHuntBoard(result: Extract<HuntLookupResult, { state: "ready" }>): string {
  const monster = result.contract.monster;
  const lines = [
    "🏹 Дошка полювання",
    presentCharacterHeader(result.character),
    "",
    "Корчмар пришпилив проблему цієї години. Вона ще не знає, що стала паперовою.",
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

export function presentHuntLevelLocked(
  result:
    | Extract<HuntLookupResult, { state: "level-locked" }>
    | Extract<HuntResult, { state: "level-locked" }>
): string {
  return [
    "🏹 Дошка полювання поки зависоко.",
    "",
    `Корчмар прикриває список рукою: «З ${result.requiredLevel} рівня покажу. Поки що дошка вчиться вас не лякати».`,
    "",
    "Почніть зі Столу зі справами: /quest"
  ].join("\n");
}

export function presentHuntAlreadyCompleted(
  result:
    | Extract<HuntLookupResult, { state: "already-completed" }>
    | Extract<HuntResult, { state: "already-completed" }>
): string {
  const lines = [
    "🏹 Полювання цієї години вже зараховано.",
    "",
    `<b>${escapeHtml(result.contract.monster.name)}</b> внесено в журнал як «проблема, що мала плани».`,
    ""
  ];

  if (result.reward) {
    lines.push(
      "Вже отримано:",
      presentRewardAmount({
        xp: result.reward.xp,
        gold: result.reward.gold
      }),
      ...presentItemGrantBlock(result.reward.itemGrants)
    );

    if (result.reward.itemReplayUnavailable) {
      lines.push("", "Деталі здобичі вже в торбі або старому журналі. Корчмар не вигадує їх вдруге.");
    }

    lines.push("", "Повертайтесь за наступною годиною або перевірте персонажа: /hero");
    return lines.join("\n");
  }

  lines.push("Повертайтесь за наступною годиною або перевірте персонажа: /hero");
  return lines.join("\n");
}

export function presentHuntMissingContractMonster(
  result:
    | Extract<HuntLookupResult, { state: "missing-contract-monster" }>
    | Extract<HuntResult, { state: "missing-contract-monster" }>
): string {
  return [
    "🏹 Запис дошки потребує корчмаря.",
    "",
    `У журналі лишився контракт на <code>${escapeHtml(result.monsterId)}</code>, але такого монстра зараз немає в бестіарії.`,
    "",
    "Нагороду за цим записом не видаємо. Оновіть дошку пізніше: /hunt"
  ].join("\n");
}

export function presentHuntStalePeriod(
  _result: Extract<HuntResult, { state: "stale-period" }>
): string {
  void _result;

  return [
    "🏹 Цей листок дошки вже з минулої години.",
    "",
    "Корчмар прибрав старі проблеми й вивісив нові. Оновіть дошку: /hunt"
  ].join("\n");
}

export function presentHuntStaleContract(
  _result: Extract<HuntResult, { state: "stale-contract" }>
): string {
  void _result;

  return [
    "🏹 Цей запис дошки вже не збігається з журналом.",
    "",
    "Корчмар перерахував ціль, печатку й підозри. Оновіть дошку: /hunt"
  ].join("\n");
}

export function presentHuntResult(result: Exclude<HuntResult, { state: "no-character" }>): string {
  if (result.state === "level-locked") {
    return presentHuntLevelLocked(result);
  }

  if (result.state === "stale-period") {
    return presentHuntStalePeriod(result);
  }

  if (result.state === "stale-contract") {
    return presentHuntStaleContract(result);
  }

  if (result.state === "missing-contract-monster") {
    return presentHuntMissingContractMonster(result);
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
    "📋 Ви закрили справу актом.",
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
