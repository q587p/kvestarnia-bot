import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { AdventureLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { FightLookupResult } from "../../services/fightService";
import type { HuntLookupResult } from "../../services/huntService";
import { BESTIARY_MIN_LEVEL, meetsActivityLevel } from "../../domain/progression/activityGates";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export interface QuestHubSnapshot {
  character: CharacterSummary;
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>;
  fight: Exclude<FightLookupResult, { state: "no-character" }>;
  hunt: Exclude<HuntLookupResult, { state: "no-character" }>;
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>;
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
    presentHuntRow(snapshot.hunt),
    presentCellarRow(snapshot.cellar),
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

function presentHuntRow(hunt: Exclude<HuntLookupResult, { state: "no-character" }>): string {
  if (hunt.state === "level-locked") {
    return `🏹 <i>Дошка полювання</i> — відкриється з ${hunt.requiredLevel} рівня.`;
  }

  if (hunt.state === "missing-contract-monster") {
    return "🏹 <i>Дошка полювання</i> — корчмар шукає старий запис у журналі.";
  }

  const status =
    hunt.state === "ready"
      ? `контракт на ${escapeHtml(hunt.contract.monster.name)}`
      : "у цю годину вже закрито";

  return `🏹 <i>Дошка полювання</i> — ${status}.`;
}

function presentCellarRow(
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>
): string {
  if (cellar.state === "level-locked") {
    return `🧹 <i>Підвальна справа</i> — відкриється з ${cellar.requiredLevel} рівня.`;
  }

  if (cellar.state === "level-retired") {
    return `🧹 <i>Підвальна справа</i> — новачкова справа до ${cellar.maxLevel} рівня.`;
  }

  if (cellar.state === "ready") {
    return "🧹 <i>Підвальна справа</i> — миша приймає аргументи.";
  }

  return `🧹 <i>Підвальна справа</i> — пауза ще ${formatCooldown(cellar.availableAt, cellar.now)}.`;
}

function presentQuestHubFooter(snapshot: QuestHubSnapshot): string {
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
    snapshot.hunt.state === "ready" ||
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
