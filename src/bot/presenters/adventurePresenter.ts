import type {
  AdventureLookupResult,
  AdventureProblemResult,
  AdventureResult,
  MimicShawarmaLookupResult,
  MimicShawarmaResult
} from "../../services/adventureService";
import { getAdventureProblemIcon } from "../../services/adventureService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, npcQuote, presentCharacterHeader } from "./telegramHtml";

export function presentAdventureOffer(
  result: Extract<AdventureLookupResult, { state: "ready" }>
): string {
  const choiceLines = result.offer.choices.flatMap((choice, index) => [
    `${index + 1}. ${getAdventureProblemIcon(choice.id)} <b>${escapeHtml(choice.title)}</b>`,
    `<i>${escapeHtml(choice.client)}</i>`,
    ...(index < result.offer.choices.length - 1 ? [""] : [])
  ]);

  return [
    "🪧 Три справи на найближчий час",
    presentCharacterHeader(result.character),
    "",
    ...choiceLines
  ].join("\n");
}

export function presentAdventureStart(character: CharacterSummary): string {
  return [
    "🪧 Три справи на найближчий час",
    presentCharacterHeader(character),
    "",
    "Корчмар виклав на стіл три проблеми. Оберіть одну на столі зі справами."
  ].join("\n");
}

export function presentMimicShawarmaStart(character: CharacterSummary): string {
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

export function presentAdventureProblem(
  result: Exclude<AdventureProblemResult, { state: "no-character" }>
): string {
  if (result.state === "level-locked") {
    return presentAdventureLevelLocked(result);
  }

  if (result.state === "active-fight") {
    return presentAdventureActiveFight();
  }

  if (result.state === "stale") {
    return presentAdventureStale(result);
  }

  if (result.state === "already-completed") {
    return presentAdventureAlreadyCompleted();
  }

  const methodLines = result.approaches.flatMap((approach) => [
    `${escapeHtml(approach.label)}`,
    `<i>${escapeHtml(approach.hint)} ${escapeHtml(approach.chanceHint ?? "якісна оцінка прихована")}.${approach.goldCost ? ` Коштує ${approach.goldCost} золота.` : ""}</i>`
  ]);

  return [
    `📌 <b>${escapeHtml(result.choice.title)}</b>`,
    "",
    escapeHtml(result.choice.hook),
    "",
    "Можливі способи:",
    ...methodLines,
    "",
    npcQuote("Корчмар", "Метод оберіть самі. Потім не кажіть, що метод обрав вас.")
  ].join("\n");
}

export function presentAdventureNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Стіл зі справами не видає папери без анкети.";
}

export function presentAdventureAlreadyCompleted(): string {
  return [
    "🪧 Справу на найближчий час уже закрито.",
    "",
    "Корчмар поставив галочку, потім ще одну для впевненості. Повторні натискання не видають додаткову винагороду.",
    "",
    "Повертайтесь трохи згодом або перевірте персонажа: /hero"
  ].join("\n");
}

export function presentMimicShawarmaAlreadyCompleted(
  result: Extract<MimicShawarmaLookupResult, { state: "already-completed" }>
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

export function presentAdventureLevelLocked(
  result:
    | Extract<AdventureLookupResult, { state: "level-locked" }>
    | Extract<AdventureProblemResult, { state: "level-locked" }>
    | Extract<AdventureResult, { state: "level-locked" }>
): string {
  return [
    "🪧 Стіл притримав складніші справи.",
    "",
    `Вибір пригод відкриється з ${result.requiredLevel} рівня. До того корчма радить не сперечатись із паперами, які мають зуби.`,
    "",
    "Поки що загляньте до інших справ на столі."
  ].join("\n");
}

export function presentMimicShawarmaLevelRetired(
  result:
    | Extract<MimicShawarmaLookupResult, { state: "level-retired" }>
    | Extract<MimicShawarmaResult, { state: "level-retired" }>
): string {
  return [
    "🌯 Шаурма лишилась для новачків.",
    "",
    `Після ${result.maxLevel} рівня корчмар більше не видає цю навчальну підозру.`,
    "",
    "Стіл зі справами вже шукає вам серйозніші проблеми: /hunt"
  ].join("\n");
}

export function presentAdventureActiveFight(): string {
  return [
    "⚔️ Спершу завершіть поточний бій.",
    "",
    "Стіл зі справами не любить паралельних героїзмів: вони плутають чорнило, HP і відповідальних."
  ].join("\n");
}

export function presentAdventureResult(result: Exclude<AdventureResult, { state: "no-character" }>): string {
  if (result.state === "level-locked") {
    return presentAdventureLevelLocked(result);
  }

  if (result.state === "active-fight") {
    return presentAdventureActiveFight();
  }

  if (result.state === "stale") {
    return presentAdventureStale(result);
  }

  if (result.state === "already-completed") {
    return presentAdventureAlreadyCompleted();
  }

  if (result.state === "insufficient-gold") {
    return [
      "🪙 Метод просить золото.",
      "",
      `<b>${escapeHtml(result.choice.title)}</b>: ${escapeHtml(result.approach.label)}`,
      "",
      `Потрібно ${result.requiredGold} золота. У вас — ${result.character.gold}.`,
      "",
      "Справу не зараховано, золото не списано. Корчмар ховає рахівницю назад під стіл."
    ].join("\n");
  }

  const outcome = result.outcome ?? {
    headline: result.complication ? "⚠️ Справа вкусила у відповідь" : "✅ Справу закрито",
    body: [
      result.complication
        ? `${result.choice.title} не прийняла метод без заперечень.`
        : `${result.choice.title} погодилась бути вирішеною.`
    ]
  };
  const lines = [
    escapeHtml(outcome.headline),
    "",
    ...outcome.body.map(escapeHtml),
    ...(outcome.biographyLine ? ["", escapeHtml(outcome.biographyLine)] : []),
    "",
    `<i>Метод:</i> ${escapeHtml(result.approach.label)}`,
    ...(result.spentGold > 0 ? [`Списано: ${result.spentGold} золота.`] : []),
    ...(result.fightHandoff ? ["Нагорода не видана: проблема покликала бій."] : [presentRewardAmount(result.reward)]),
    "",
    ...presentItemGrantLines(result.reward.itemGrants)
  ];

  return lines.join("\n");
}

export function presentMimicShawarmaResult(
  result: Exclude<MimicShawarmaResult, { state: "no-character" }>
): string {
  if (result.state === "level-retired") {
    return presentMimicShawarmaLevelRetired(result);
  }

  if (result.state === "already-completed") {
    return [
      "🌯 Сьогоднішню шаурму вже допитано.",
      "",
      "Вона мовчить, але юридично все зрозуміло.",
      "",
      "Повертайтесь завтра або перевірте персонажа: /hero"
    ].join("\n");
  }

  const outcome = result.outcome ?? {
    headline: "✅ Справу закрито",
    body: ["Підозріла шаурма дала свідчення й записалась у навчальні пригоди."]
  };
  const methodLabel = result.method?.label ?? String(result.action);
  const lines = [
    escapeHtml(outcome.headline),
    "",
    ...outcome.body.map(escapeHtml),
    ...(outcome.biographyLine ? ["", escapeHtml(outcome.biographyLine)] : []),
    "",
    `<i>Метод:</i> ${escapeHtml(methodLabel)}`,
    presentRewardAmount(result.reward),
    ...presentItemGrantLines(result.reward.itemGrants)
  ];

  return lines.join("\n");
}

function presentAdventureStale(result: Extract<AdventureResult | AdventureProblemResult, { state: "stale" }>): string {
  return [
    "🪧 Цей папірець уже не актуальний.",
    "",
    "Стіл зі справами перерахував актуальні проблеми й підсунув свіжий список.",
    "",
    ...result.offer.choices.map(
      (choice, index) =>
        `${index + 1}. ${getAdventureProblemIcon(choice.id)} <b>${escapeHtml(choice.title)}</b> — ${escapeHtml(choice.hook)}`
    )
  ].join("\n");
}

export function presentAdventureLegacyApproachStale(
  result: Exclude<AdventureProblemResult, { state: "no-character" }>
): string {
  if (result.state === "selected") {
    return [
      "🪧 Старий папірець утратив силу.",
      "",
      "Корчмар замінив обережно-хитро-ризикову шкалу на методи, які належать самій справі.",
      "",
      presentAdventureProblem(result)
    ].join("\n");
  }

  return presentAdventureProblem(result);
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

function presentItemGrantLines(itemGrants: Array<{ name: string; quantity: number }>): string[] {
  if (itemGrants.length === 0) {
    return [];
  }

  return itemGrants.map((grant) =>
    presentRewardItemGrant({
      name: escapeHtml(grant.name),
      quantity: grant.quantity
    })
  );
}
