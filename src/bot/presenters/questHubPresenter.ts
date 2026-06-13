import type { CharacterSummary } from "../../domain/characters/characterSummary";
import type { AdventureLookupResult } from "../../services/adventureService";
import type { CellarErrandLookupResult } from "../../services/cellarErrandService";
import type { FightLookupResult } from "../../services/fightService";
import { escapeHtml } from "./telegramHtml";

export interface QuestHubSnapshot {
  character: CharacterSummary;
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>;
  fight: Exclude<FightLookupResult, { state: "no-character" }>;
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>;
}

export function presentQuestHub(snapshot: QuestHubSnapshot): string {
  const lines = [
    "📋 Стіл зі справами",
    `${escapeHtml(snapshot.character.name)} · ${escapeHtml(snapshot.character.title)}`,
    "",
    "На столі лежать справи. Деякі лежать тихо. Деякі дихають.",
    "",
    presentAdventureRow(snapshot.adventure),
    presentFightRow(snapshot.fight),
    presentCellarRow(snapshot.cellar),
    "",
    "Оберіть справу, поки вона не обрала вас."
  ];

  return lines.join("\n");
}

export function presentKorchmaQuestGate(): string {
  return "Квести видають усередині.";
}

export function presentQuestHubNoCharacter(): string {
  return "Спершу створіть героя через /start. Стіл зі справами не видає папери без анкети.";
}

function presentAdventureRow(
  adventure: Exclude<AdventureLookupResult, { state: "no-character" }>
): string {
  const status = adventure.state === "ready" ? "готова до допиту" : "сьогодні вже дала свідчення";

  return `🌯 Підозріла шаурма — ${status}.`;
}

function presentFightRow(fight: Exclude<FightLookupResult, { state: "no-character" }>): string {
  const status = fight.state === "ready" ? "можна починати" : "сьогодні вже зараховано";

  return `⚔️ Сутичка з Міміком-шаурмою — ${status}.`;
}

function presentCellarRow(
  cellar: Exclude<CellarErrandLookupResult, { state: "no-character" }>
): string {
  if (cellar.state === "ready") {
    return "🧹 Підвальна справа — миша знову приймає аргументи.";
  }

  return `🧹 Підвальна справа — пауза ще ${formatCooldown(cellar.availableAt, cellar.now)}.`;
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
