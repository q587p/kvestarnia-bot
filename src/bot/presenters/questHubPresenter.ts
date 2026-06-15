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

export function presentQuestHub(snapshot: QuestHubSnapshot): string {
  const lines = [
    "📋 Стіл зі справами",
    presentCharacterHeader(snapshot.character),
    "",
    "На столі лежать справи. Деякі лежать тихо. Деякі дихають.",
    "",
    presentAdventureRow(snapshot.adventure),
    presentFightRow(snapshot.fight),
    presentYegerRow(snapshot.yeger),
    presentCellarRow(snapshot.cellar, snapshot.cellarGrownup),
    "",
    presentQuestHubFooter(snapshot)
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

function presentFightRow(fight: Exclude<FightLookupResult, { state: "no-character" }>): string {
  if (fight.state === "needs-rest") {
    return "⚔️ <i>Сутичка з невідомим монстром</i> — герой ще не тримається на ногах, спершу /hero.";
  }

  if (fight.state === "level-retired") {
    return `⚔️ <i>Сутичка з невідомим монстром</i> — тренувальний бій для 1-${fight.maxLevel} рівнів.`;
  }

  if (fight.state === "persistent-active") {
    return `📋 <i>Тринадцять дрібних проблем</i> — ${presentThirteenProblemsStatus(fight.questProgress)}, бій уже триває.`;
  }

  if (fight.state === "persistent-ready" || fight.state === "persistent-terminal") {
    return `📋 <i>Тринадцять дрібних проблем</i> — ${presentThirteenProblemsStatus(fight.questProgress)}.`;
  }

  const status = fight.state === "ready" ? "можна починати" : "сьогодні вже зараховано";

  return `⚔️ <i>Сутичка з невідомим монстром</i> — ${status}.`;
}

function presentThirteenProblemsStatus(progress: {
  wins: number;
  target: number;
  completed: boolean;
}): string {
  if (progress.completed) {
    return `${progress.wins}/${progress.target} проблем у журналі, перший список закрито; далі практика`;
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

function presentCellarRow(
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>,
  cellarGrownup?: Exclude<CellarGrownupQuestLookupResult, { state: "no-character" | "too-young" }>
): string {
  if (cellar.state === "level-locked") {
    return `🧹 <i>Підвальна справа</i> — відкриється з ${cellar.requiredLevel} рівня.`;
  }

  if (cellar.state === "level-retired") {
    if (cellarGrownup?.state === "completed") {
      return [
        `🧹 <i>Підвальна справа</i> — новачкова справа до ${cellar.maxLevel} рівня.`,
        "🐭 <i>Справа не до миші</i> — дорослу підвальну справу вже закрито; пляшка стоїть у журналі й тихо булькає."
      ].join("\n");
    }

    return [
      `🧹 <i>Підвальна справа</i> — новачкова справа до ${cellar.maxLevel} рівня.`,
      "🐭 <i>Справа не до миші</i> — у підвалі є інша справа для старших пригодників."
    ].join("\n");
  }

  if (cellar.state === "ready") {
    return "🧹 <i>Підвальна справа</i> — миша приймає аргументи.";
  }

  return `🧹 <i>Підвальна справа</i> — пауза ще ${formatCooldown(cellar.availableAt, cellar.now)}.`;
}

function presentQuestHubFooter(snapshot: QuestHubSnapshot): string {
  if (snapshot.character.hpCurrent <= 0) {
    return "HP 0? Спершу /hero, тоді /fight. Справи почекають.";
  }

  if (hasReadyQuestAction(snapshot)) {
    return "Оберіть справу, поки вона не обрала вас.";
  }

  if (!meetsActivityLevel(snapshot.character.level, BESTIARY_MIN_LEVEL)) {
    return "Справи зараз удають меблі. Можна перевірити манатки або повернутися до зали.";
  }

  return "Справи зараз удають меблі. Можна почитати бестіарій, перевірити манатки або повернутися до зали.";
}

function hasReadyQuestAction(snapshot: QuestHubSnapshot): boolean {
  return (
    snapshot.adventure.state === "ready" ||
    snapshot.fight.state === "ready" ||
    snapshot.fight.state === "persistent-ready" ||
    snapshot.fight.state === "persistent-active" ||
    snapshot.fight.state === "persistent-terminal" ||
    snapshot.yeger.state === "offered" ||
    snapshot.yeger.state === "in-progress" ||
    snapshot.yeger.state === "turn-in-ready" ||
    snapshot.cellar.state === "ready"
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
