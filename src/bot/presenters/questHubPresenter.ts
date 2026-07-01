import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { AdventureLookupResult, MimicShawarmaLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { CellarGrownupQuestLookupResult } from "../../services/cellarGrownupQuestService";
import type { FightLookupResult, ProblemQuestProgress } from "../../services/fightService";
import type { DailyKorchmaRoundLookupResult } from "../../services/dailyKorchmaRoundService";
import type { YegerQuestLookupResult } from "../../services/yegerQuestService";
import {
  BESTIARY_MIN_LEVEL,
  FIGHTING_CORNER_MIN_LEVEL,
  meetsActivityLevel,
  STARTER_ACTIVITY_MAX_LEVEL
} from "../../domain/progression/activityGates";
import { presentYegerQuestTitle } from "./yegerQuestTitle";

export interface QuestHubSnapshot {
  character: CharacterSummary;
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>;
  starterAdventure?: Exclude<MimicShawarmaLookupResult, { state: "no-character" }>;
  fight: Exclude<FightLookupResult, { state: "no-character" }>;
  problemQuest: ProblemQuestProgress;
  problemQuestArchive: ProblemQuestProgress[];
  yeger: Exclude<YegerQuestLookupResult, { state: "no-character" }>;
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>;
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>;
  dailyKorchmaRound?: Exclude<DailyKorchmaRoundLookupResult, { state: "no-character" }>;
}

export type QuestHubMode = "active" | "archive";

export function presentQuestHub(snapshot: QuestHubSnapshot, mode: QuestHubMode = "active"): string {
  const rows = mode === "archive" ? getQuestHubArchiveRows(snapshot) : getQuestHubActiveRows(snapshot);
  const lines = [
    mode === "archive" ? "📦 Архів справ" : "📋 Стіл зі справами",
    "",
    mode === "archive"
      ? "Архів показує закриті й недоступні справи. Він шарудить так, ніби памʼятає більше, ніж треба."
      : "На столі лежать актуальні справи. Кожна папірцем удає, що вона легша за інші.",
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
  character: CharacterSummary,
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>,
  starterAdventure?: Exclude<MimicShawarmaLookupResult, { state: "no-character" }>
): string {
  const title = "🪧 <i>Три справи на найближчий час</i>";

  if (adventure.state === "level-locked") {
    if (character.level <= STARTER_ACTIVITY_MAX_LEVEL && starterAdventure?.state === "ready") {
      return "🌯 <i>Підозріла шаурма</i> — новачкова підозра чекає на столі.";
    }

    return `${title} — відкриється з ${adventure.requiredLevel} рівня.`;
  }

  if (adventure.state === "active-fight") {
    return `${title} — спершу завершіть поточний бій.`;
  }

  const status = adventure.state === "ready" ? "три проблеми чекають вибору" : "цей відтинок уже закрито";

  return `${title} — ${status}.`;
}

function presentAdventureArchiveRows(
  character: CharacterSummary,
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>,
  starterAdventure?: Exclude<MimicShawarmaLookupResult, { state: "no-character" }>
): string[] {
  if (adventure.state === "ready") {
    return [];
  }

  if (adventure.state === "already-completed") {
    return [
      "🪧 <i>Три справи на найближчий час</i> — виконано; Корчмар поставив галочку і не визнає повторів."
    ];
  }

  if (adventure.state === "active-fight" || adventure.state === "combat-blocked") {
    return [];
  }

  const rows = [
    `🪧 <i>Три справи на найближчий час</i> — відкриється з ${adventure.requiredLevel} рівня; у журналі немає позначки виконання.`
  ];

  if (
    character.level <= STARTER_ACTIVITY_MAX_LEVEL &&
    starterAdventure?.state === "already-completed"
  ) {
    rows.push("🌯 <i>Підозріла шаурма</i> — сьогодні вже дала свідчення.");
  }

  return rows;
}

function presentProblemQuestRow(
  character: CharacterSummary,
  progress: ProblemQuestProgress,
  fight: Exclude<FightLookupResult, { state: "no-character" }>
): string {
  if (!meetsActivityLevel(character.level, FIGHTING_CORNER_MIN_LEVEL)) {
    return `🧾 <i>${progress.title}</i> — відкриється з ${FIGHTING_CORNER_MIN_LEVEL} рівня.`;
  }

  if (progress.branchComplete) {
    return `🧾 <i>${progress.title}</i> — ${presentProblemQuestStatus(progress)}.`;
  }

  if (!progress.issued) {
    if (progress.wins > 0) {
      return `🧾 <i>${progress.title}</i> — ${progress.wins}/${progress.target} проблем у старому журналі; Корчмар має папірець у шинку, спершу візьміть справу там.`;
    }

    return `🧾 <i>${progress.title}</i> — Корчмар має папірець у шинку. Спершу візьміть справу там.`;
  }

  if (fight.state === "persistent-active") {
    return `🧾 <i>${progress.title}</i> — ${presentProblemQuestStatus(progress)}, бій уже триває в Низу.`;
  }

  return `🧾 <i>${progress.title}</i> — ${presentProblemQuestStatus(progress)}.`;
}

function presentFightRow(fight: Exclude<FightLookupResult, { state: "no-character" }>): string | null {
  if (fight.state === "needs-rest") {
    return "🪜 <i>Низ</i> — герой ще не тримається на ногах; потрібен хоча б 1 HP.";
  }

  if (fight.state === "level-retired") {
    return `⚔️ <i>Новачкова сутичка</i> — навчальний бій для 1-${fight.maxLevel} рівнів.`;
  }

  if (fight.state === "persistent-active") {
    return null;
  }

  if (fight.state === "training-active") {
    return "🥊 <i>Бійцівський куток</i> — тренування вже триває; звичайні проблеми почекають після /spar.";
  }

  if (fight.state === "monster-rest") {
    return "🪜 <i>Низ</i> — монстри взяли коротку перерву й дуже пишаються профспілковою дисципліною.";
  }

  if (fight.state === "persistent-not-issued") {
    return null;
  }

  if (fight.state === "persistent-ready" || fight.state === "persistent-terminal") {
    return null;
  }

  const status = fight.state === "ready" ? "можна починати" : "сьогодні вже зараховано";

  return `🪜 <i>Низ</i> — ${status}.`;
}

function presentActiveFightRow(
  character: CharacterSummary,
  fight: Exclude<FightLookupResult, { state: "no-character" }>
): string | null {
  if (fight.state === "level-retired" || fight.state === "already-completed") {
    return null;
  }

  if (fight.state === "ready" && character.level <= STARTER_ACTIVITY_MAX_LEVEL) {
    return "⚔️ <i>Новачкова сутичка</i> — підозріла шаурма ще не дала свідчень.";
  }

  return presentFightRow(fight);
}

function presentFightArchiveRow(
  character: CharacterSummary,
  fight: Exclude<FightLookupResult, { state: "no-character" }>
): string | null {
  if (fight.state === "already-completed" && character.level <= STARTER_ACTIVITY_MAX_LEVEL) {
    return "⚔️ <i>Новачкова сутичка</i> — сьогодні вже зараховано.";
  }

  if (fight.state === "level-retired" || fight.state === "already-completed") {
    return presentFightRow(fight);
  }

  return null;
}

function presentProblemQuestArchiveRows(progresses: ProblemQuestProgress[]): string[] {
  return progresses.map(
    (progress) => `🧾 <i>${progress.title}</i> — ${presentProblemQuestStatus(progress)}.`
  );
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
      : `${progress.wins}/${progress.target} проблем у журналі, Корчмар чекає в шинку`;
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
    return `🏹 <i>${presentYegerQuestTitle(yeger.progress)}</i> — ${yeger.progress.wins}/${yeger.progress.target} неупокоєних у журналі.`;
  }

  if (yeger.state === "turn-in-ready") {
    return `🏹 <i>${presentYegerQuestTitle(yeger.progress)}</i> — ${yeger.progress.wins}/${yeger.progress.target}, Єгер чекає дощечку.`;
  }

  return `🏹 <i>${presentYegerQuestTitle(yeger.progress)}</i> — виконано; Єгер удає, що не пишається.`;
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
      return "🐭 <i>Справа не до миші</i> — пляшка вже з вами; Корчмар чекає в шинку.";
    }

    return "🐭 <i>Справа не до миші</i> — у льосі є інша справа для старших пригодників.";
  }

  return presentCellarRow(cellar, cellarGrownup);
}

function presentDailyKorchmaRoundRow(
  daily: Exclude<DailyKorchmaRoundLookupResult, { state: "no-character" }> | undefined
): string | null {
  if (!daily) {
    return null;
  }

  const title = "🧾 <i>Корчмарський обхід</i>";

  if (daily.state === "level-locked") {
    return null;
  }

  if (daily.state === "hp-blocked") {
    return `${title} — спершу відновіть хоча б 1 HP.`;
  }

  if (daily.state === "active-fight") {
    return `${title} — спершу завершіть поточний бій.`;
  }

  if (daily.state === "pending-barrel") {
    return `${title} — Бочка Пінного Міражу ще ревнує до черги.`;
  }

  if (daily.state === "completed") {
    return `${title} — сьогодні закрито; Корчмар удає, що так і було заплановано.`;
  }

  const completed = daily.offer.completedSceneIds.length;

  return daily.state === "turn-in-ready"
    ? `${title} — 2/2, Корчмар чекає на два підписи біля столу.`
    : `${title} — ${completed}/2 дрібниць чекають ревізії здорового глузду.`;
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

  const rows = [
    cellar.completed
      ? `🧹 <i>Льохова справа</i> — виконано; миша прийняла аргументи до ${cellar.maxLevel} рівня.`
      : `🧹 <i>Льохова справа</i> — новачкова справа до ${cellar.maxLevel} рівня; у журналі немає сліду виконання.`
  ];

  if (cellarGrownup?.state === "completed") {
    rows.push("🐭 <i>Справа не до миші</i> — дорослу льохову справу вже закрито; пляшка стоїть у журналі й тихо булькає.");
  }

  return rows;
}

function getQuestHubActiveRows(snapshot: QuestHubSnapshot): string[] {
  const rows = [
    snapshot.adventure.state === "ready" ||
    (snapshot.adventure.state === "level-locked" &&
      snapshot.character.level <= STARTER_ACTIVITY_MAX_LEVEL &&
      snapshot.starterAdventure?.state === "ready")
      ? presentAdventureRow(snapshot.character, snapshot.adventure, snapshot.starterAdventure)
      : null,
    meetsActivityLevel(snapshot.character.level, FIGHTING_CORNER_MIN_LEVEL)
      ? presentProblemQuestRow(snapshot.character, snapshot.problemQuest, snapshot.fight)
      : null,
    presentActiveFightRow(snapshot.character, snapshot.fight),
    presentActiveYegerRow(snapshot.yeger),
    presentActiveCellarRow(snapshot.cellar, snapshot.cellarGrownup),
    snapshot.dailyKorchmaRound?.state === "completed"
      ? null
      : presentDailyKorchmaRoundRow(snapshot.dailyKorchmaRound)
  ].filter(isPresent);

  if (rows.length > 0) {
    return rows;
  }

  return ["На столі зараз немає живих справ. Архів тихо кашляє пилом і робить вигляд, що це спецефект."];
}

function getQuestHubArchiveRows(snapshot: QuestHubSnapshot): string[] {
  const rows = [
    ...presentAdventureArchiveRows(snapshot.character, snapshot.adventure, snapshot.starterAdventure),
    !meetsActivityLevel(snapshot.character.level, FIGHTING_CORNER_MIN_LEVEL)
      ? presentProblemQuestRow(snapshot.character, snapshot.problemQuest, snapshot.fight)
      : null,
    ...presentProblemQuestArchiveRows(snapshot.problemQuestArchive),
    presentFightArchiveRow(snapshot.character, snapshot.fight),
    presentYegerArchiveRow(snapshot.yeger),
    ...presentCellarArchiveRows(snapshot.cellar, snapshot.cellarGrownup),
    snapshot.dailyKorchmaRound?.state === "completed"
      ? presentDailyKorchmaRoundRow(snapshot.dailyKorchmaRound)
      : null
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
    return withRemortHint("HP 0? Спершу трохи відновіться. Справи почекають, доки буде хоча б 1 HP.");
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
    (snapshot.adventure.state === "level-locked" &&
      snapshot.character.level <= STARTER_ACTIVITY_MAX_LEVEL &&
      snapshot.starterAdventure?.state === "ready") ||
    snapshot.fight.state === "ready" ||
    (meetsActivityLevel(snapshot.character.level, FIGHTING_CORNER_MIN_LEVEL) &&
      !snapshot.problemQuest.branchComplete) ||
    snapshot.fight.state === "training-active" ||
    snapshot.yeger.state === "offered" ||
    snapshot.yeger.state === "in-progress" ||
    snapshot.yeger.state === "turn-in-ready" ||
    snapshot.cellar.state === "ready" ||
    (snapshot.cellar.state === "level-retired" && snapshot.cellarGrownup?.state !== "completed") ||
    snapshot.dailyKorchmaRound?.state === "ready" ||
    snapshot.dailyKorchmaRound?.state === "turn-in-ready"
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
