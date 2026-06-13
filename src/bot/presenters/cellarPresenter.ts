import type {
  CellarErrandAction,
  CellarErrandLookupResult,
  CellarErrandResult
} from "../../services/cellarErrandService";
import type { CharacterSummary } from "../../domain/characters/characterSummary";
import { selectCharacterFlavorLine } from "../../content/characterFlavor";
import { presentRewardLevelGrowth } from "./levelGrowthPresenter";
import { presentRewardAmount, presentRewardItemGrant } from "./rewardPresenter";
import { escapeHtml, npcQuote } from "./telegramHtml";

export function presentCellarStart(
  result: Extract<CellarErrandLookupResult, { state: "ready" }>
): string {
  return [
    "🐭 Підвальна справа",
    "",
    "Корчмар показує на люк під баром.",
    "",
    npcQuote("Корчмар", "Там миша. Вона мала бути побічним квестом, але вже вимагає титул."),
    ...presentCharacterFlavor(result.character, "quest.start", "cellar"),
    "",
    `${escapeHtml(result.character.name)}, що робимо?`
  ].join("\n");
}

export function presentCellarNoCharacter(): string {
  return "Спершу створіть героя через /start. Підвал не видає доручень тіням без анкети.";
}

export function presentCellarCooldown(
  result:
    | Extract<CellarErrandLookupResult, { state: "on-cooldown" }>
    | Extract<CellarErrandResult, { state: "on-cooldown" }>
): string {
  return [
    "🐭 Підвал тимчасово тихий.",
    "",
    "Миша взяла паузу на переосмислення сирної політики.",
    "",
    `Можна повернутись за: ${formatCooldown(result.availableAt, result.now)}.`
  ].join("\n");
}

export function presentCellarResult(
  result: Exclude<CellarErrandResult, { state: "no-character" }>
): string {
  if (result.state === "on-cooldown") {
    return presentCellarCooldown(result);
  }

  const lines = [
    ...presentCellarOutcome(result.action),
    ...presentCharacterFlavor(result.character, "quest.outcome", "cellar", result.action),
    "",
    presentRewardAmount(result.reward),
    ...presentItemGrantLines(result.reward.itemGrants)
  ];

  lines.push(...presentRewardLevelGrowth(result.levelChange, result.character.classId));
  lines.push("", `Підвал знову чекатиме за: ${formatCooldown(result.availableAt, result.now)}.`);

  return lines.join("\n");
}

function presentCharacterFlavor(
  character: CharacterSummary,
  placement: "quest.start" | "quest.outcome",
  scene: "cellar",
  action?: CellarErrandAction
): string[] {
  const flavor = selectCharacterFlavorLine(character, {
    placement,
    scene,
    ...(action ? { action } : {})
  });

  return flavor ? ["", escapeHtml(flavor.text)] : [];
}

function presentCellarOutcome(action: CellarErrandAction): string[] {
  if (action === "cheese-trap") {
    return [
      "🧀 Пастка спрацювала частково.",
      "Миша лишила сир і записку.",
      "<blockquote>Ваші умови смішні.</blockquote>"
    ];
  }

  if (action === "sweep-bravely") {
    return [
      "🧹 Ви підмели підвал.",
      "Пил отримав моральну поразку, миша — простір для маневру."
    ];
  }

  return [
    "🤝 Переговори завершено.",
    "Миша погодилась не гризти квестові дошки до наступного інциденту."
  ];
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

function formatCooldown(availableAt: Date, now: Date): string {
  const remainingMs = Math.max(0, availableAt.getTime() - now.getTime());
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  return `${minutes} ${pluralize(minutes, "хвилину", "хвилини", "хвилин")}`;
}

function pluralize(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return few;
  }

  return many;
}
