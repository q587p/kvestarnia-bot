import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { AdventureLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { CellarGrownupQuestLookupResult } from "../../services/cellarGrownupQuestService";
import type { FightLookupResult } from "../../services/fightService";
import type { YegerQuestLookupResult } from "../../services/yegerQuestService";
import { BESTIARY_MIN_LEVEL, meetsActivityLevel } from "../../domain/progression/activityGates";
import { presentCharacterHeader } from "./telegramHtml";

export interface QuestHubSnapshot {
  character: CharacterSummary;
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>;
  fight: Exclude<FightLookupResult, { state: "no-character" }>;
  yeger: Exclude<YegerQuestLookupResult, { state: "no-character" }>;
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>;
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>;
}

export type QuestHubMode = "active" | "archive";

export function presentQuestHub(snapshot: QuestHubSnapshot, mode: QuestHubMode = "active"): string {
  const rows = mode === "archive" ? getQuestHubArchiveRows(snapshot) : getQuestHubActiveRows(snapshot);
  const lines = [
    mode === "archive" ? "📦 Архів справ" : "📋 Стіл зі справами",
    presentCharacterHeader(snapshot.character),
    "",
    mode === "archive"
      ? "Архів показує закриті й недоступні справи. Він шарудить так, ніби памʼятає більше, ніж треба."
      : "На столі лежать актуальні справи, а збоку тулиться Бійцівський куток для обережного /spar. Тут обирають напрям, а далі Стіл уже штовхає туди, де справа насправді шумить.",
    "",
    ...rows,
    "",
    mode === "archive" ? presentQuestHubArchiveFooter() : presentQuestHubFooter(snapshot)
  ];

  return lines.join("\n");
}

export function presentKorchmaQuestGate(): string {
  return "Квести видають усередині.";
}

export function presentQuestHubNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Стіл зі справами не видає папери без анкети.";
}

function presentAdventureRow(
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>
): string {
  if (adventure.state === "level-retired") {
    return `🌯 <i>Підозріла шаурма</i> — перша підозра для 1-${adventure.maxLevel} рівнів.`;
  }

  const status = adventure.state === "ready" ? "готова до допиту" : "сьогодні вже дала свідчення";

  return `🌯 <i>Підозріла шаурма</i> — ${status}.`;
}

function presentAdventureArchiveRow(
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>
): string | null {
  if (adventure.state === "ready") {
    return null;
  }

  return presentAdventureRow(adventure);
}

function presentFightRow(fight: Exclude<FightLookupResult, { state: "no-character" }>): string {
  if (fight.state === "needs-rest") {
    return "⚔️ <i>Сутичка з невідомим монстром</i> — герой ще не тримається на ногах, спершу /hero.";
  }

  if (fight.state === "level-retired") {
    return `⚔️ <i>Сутичка з невідомим монстром</i> — тренувальний бій для 1-${fight.maxLevel} рівнів.`;
  }

  if (fight.state === "persistent-active") {
    return `📋 <i>${fight.questProgress.title}</i> — ${presentProblemQuestStatus(fight.questProgress)}, бій уже триває.`;
  }

  if (fight.state === "training-active") {
    return "🥊 <i>Бійцівський куток</i> — тренування вже триває; звичайні проблеми почекають після /spar.";
  }

  if (fight.state === "persistent-not-issued") {
    return `📋 <i>${fight.questProgress.title}</i> — Корчмар має папірець у Шинку. Спершу візьміть справу там.`;
  }

  if (fight.state === "persistent-ready" || fight.state === "persistent-terminal") {
    return `📋 <i>${fight.questProgress.title}</i> — ${presentProblemQuestStatus(fight.questProgress)}.`;
  }

  const status = fight.state === "ready" ? "можна починати" : "сьогодні вже зараховано";

  return `⚔️ <i>Сутичка з невідомим монстром</i> — ${status}.`;
}

function presentActiveFightRow(fight: Exclude<FightLookupResult, { state: "no-character" }>): string | null {
  if (fight.state === "level-retired" || fight.state === "already-completed") {
    return null;
  }

  return presentFightRow(fight);
}

function presentFightArchiveRow(fight: Exclude<FightLookupResult, { state: "no-character" }>): string | null {
  if (fight.state === "level-retired" || fight.state === "already-completed") {
    return presentFightRow(fight);
  }

  if (
    (fight.state === "persistent-active" ||
      fight.state === "persistent-not-issued" ||
      fight.state === "persistent-ready" ||
      fight.state === "persistent-terminal") &&
    fight.questProgress.completed
  ) {
    return `📋 <i>${fight.questProgress.title}</i> — ${presentProblemQuestStatus(fight.questProgress)}.`;
  }

  return null;
}

function presentProblemQuestStatus(progress: {
  wins: number;
  target: number;
  completed: boolean;
  rewardClaimed?: boolean;
  branchComplete?: boolean;
}): string {
  if (progress.branchComplete) {
    return "гілку закрито; Корчмар тимчасово робить вигляд, що не вміє рахувати далі";
  }

  if (progress.completed) {
    return progress.rewardClaimed
      ? `${progress.wins}/${progress.target} проблем у журналі, справу здано; Корчмар має наступний папірець`
      : `${progress.wins}/${progress.target} проблем у журналі, Корчмар чекає в Шинку`;
  }

  return `${progress.wins}/${progress.target} проблем у журналі`;
}

function presentYegerRow(yeger: Exclude<YegerQuestLookupResult, { state: "no-character" }>): string {
  if (yeger.state === "level-locked") {
    return `🏹 <i>Єгерська справа</i> — відкриється з ${yeger.requiredLevel} рівня.`;
  }

  if (yeger.state === "offered") {
    return "🏹 <i>Єгерська справа</i> — Єгер має роботу для тих, хто вже не плутає слід із мотузкою.";
  }

  if (yeger.state === "in-progress") {
    return `🏹 <i>Неспокійні справи</i> — ${yeger.progress.wins}/${yeger.progress.target} неупокоєних у журналі.`;
  }

  if (yeger.state === "turn-in-ready") {
    return `🏹 <i>Неспокійні справи</i> — ${yeger.progress.wins}/${yeger.progress.target}, Єгер чекає дощечку.`;
  }

  return "🏹 <i>Неспокійні справи</i> — виконано; Єгер удає, що не пишається.";
}

function presentActiveYegerRow(yeger: Exclude<YegerQuestLookupResult, { state: "no-character" }>): string | null {
  if (yeger.state === "level-locked" || yeger.state === "completed") {
    return null;
  }

  return presentYegerRow(yeger);
}

function presentYegerArchiveRow(yeger: Exclude<YegerQuestLookupResult, { state: "no-character" }>): string | null {
  if (yeger.state !== "level-locked" && yeger.state !== "completed") {
    return null;
  }

  return presentYegerRow(yeger);
}

function presentCellarRow(
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>,
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>
): string {
  if (cellar.state === "level-locked") {
    return `🧹 <i>Льохова справа</i> — відкриється з ${cellar.requiredLevel} рівня.`;
  }

  if (cellar.state === "level-retired") {
    if (cellarGrownup?.state === "completed") {
      return [
        `🧹 <i>Льохова справа</i> — новачкова справа до ${cellar.maxLevel} рівня.`,
        "🐭 <i>Справа не до миші</i> — дорослу льохову справу вже закрито; пляшка стоїть у журналі й тихо булькає."
      ].join("\n");
    }

    return [
      `🧹 <i>Льохова справа</i> — новачкова справа до ${cellar.maxLevel} рівня.`,
      "🐭 <i>Справа не до миші</i> — у льосі є інша справа для старших пригодників."
    ].join("\n");
  }

  if (cellar.state === "ready") {
    return "🧹 <i>Льохова справа</i> — миша приймає аргументи.";
  }

  return `🧹 <i>Льохова справа</i> — пауза ще ${formatCooldown(cellar.availableAt, cellar.now)}.`;
}

function presentActiveCellarRow(
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>,
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>
): string | null {
  if (cellar.state === "level-locked") {
    return null;
  }

  if (cellar.state === "level-retired") {
    if (cellarGrownup?.state === "completed") {
      return null;
    }

    if (hasGrownupBottle(cellarGrownup)) {
      return "🐭 <i>Справа не до миші</i> — пляшка вже з вами; Корчмар чекає в Шинку.";
    }

    return "🐭 <i>Справа не до миші</i> — у льосі є інша справа для старших пригодників.";
  }

  return presentCellarRow(cellar, cellarGrownup);
}

function hasGrownupBottle(
  cellarGrownup:
    | Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>
    | undefined
): boolean {
  return cellarGrownup?.state === "bottle-obtained" && cellarGrownup.bottleQuantity > 0;
}

function presentCellarArchiveRows(
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>,
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>
): string[] {
  if (cellar.state === "level-locked") {
    return [presentCellarRow(cellar, cellarGrownup)];
  }

  if (cellar.state !== "level-retired") {
    return [];
  }

  const rows = [`🧹 <i>Льохова справа</i> — новачкова справа до ${cellar.maxLevel} рівня.`];

  if (cellarGrownup?.state === "completed") {
    rows.push("🐭 <i>Справа не до миші</i> — дорослу льохову справу вже закрито; пляшка стоїть у журналі й тихо булькає.");
  }

  return rows;
}

function getQuestHubActiveRows(snapshot: QuestHubSnapshot): string[] {
  const rows = [
    snapshot.adventure.state === "ready" ? presentAdventureRow(snapshot.adventure) : null,
    presentActiveFightRow(snapshot.fight),
    presentActiveYegerRow(snapshot.yeger),
    presentActiveCellarRow(snapshot.cellar, snapshot.cellarGrownup)
  ].filter(isPresent);

  if (rows.length > 0) {
    return rows;
  }

  return ["На столі зараз немає живих справ. Архів тихо кашляє пилом і робить вигляд, що це спецефект."];
}

function getQuestHubArchiveRows(snapshot: QuestHubSnapshot): string[] {
  const rows = [
    presentAdventureArchiveRow(snapshot.adventure),
    presentFightArchiveRow(snapshot.fight),
    presentYegerArchiveRow(snapshot.yeger),
    ...presentCellarArchiveRows(snapshot.cellar, snapshot.cellarGrownup)
  ].filter(isPresent);

  if (rows.length > 0) {
    return rows;
  }

  return ["Архів поки порожній. Навіть пил ще не встиг оформити вступний внесок."];
}

function isPresent(row: string | null): row is string {
  return row !== null;
}

function presentQuestHubFooter(snapshot: QuestHubSnapshot): string {
  const withRemortHint = (text: string): string => {
    if (snapshot.character.level < 13) {
      return text;
    }

    return [
      text,
      "",
      "Або оберіть /remort і спробуйте інакше повирішувати всі ці справи."
    ].join("\n");
  };

  if (snapshot.character.hpCurrent <= 0) {
    return withRemortHint("HP 0? Спершу /hero, тоді /fight. Справи почекають.");
  }

  if (hasReadyQuestAction(snapshot)) {
    return withRemortHint("Оберіть справу, поки вона не обрала вас.");
  }

  if (!meetsActivityLevel(snapshot.character.level, BESTIARY_MIN_LEVEL)) {
    return withRemortHint("Справи зараз удають меблі. Можна перевірити манатки або повернутися до зали.");
  }

  return withRemortHint("Справи зараз удають меблі. Можна почитати бестіарій, перевірити манатки або повернутися до зали.");
}

function hasReadyQuestAction(snapshot: QuestHubSnapshot): boolean {
  return (
    snapshot.adventure.state === "ready" ||
    snapshot.fight.state === "ready" ||
    snapshot.fight.state === "persistent-not-issued" ||
    snapshot.fight.state === "persistent-ready" ||
    snapshot.fight.state === "persistent-active" ||
    snapshot.fight.state === "persistent-terminal" ||
    snapshot.fight.state === "training-active" ||
    snapshot.yeger.state === "offered" ||
    snapshot.yeger.state === "in-progress" ||
    snapshot.yeger.state === "turn-in-ready" ||
    snapshot.cellar.state === "ready" ||
    (snapshot.cellar.state === "level-retired" && snapshot.cellarGrownup?.state !== "completed")
  );
}

function presentQuestHubArchiveFooter(): string {
  return "Актуальні справи лежать на столі. Архів лише підморгує обкладинкою.";
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
