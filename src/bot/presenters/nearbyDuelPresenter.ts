import type {
  NearbyDuelCandidatesSnapshot,
  PresencePerson
} from "../../services/presenceService";
import type { DuelCreateResult, DuelResourceWarning } from "../../services/duelChallengeService";
import { escapeHtml } from "./telegramHtml";

export function presentNearbyDuelCandidates(snapshot: NearbyDuelCandidatesSnapshot): string {
  if (snapshot.state === "no-character") {
    return "Спершу створіть пригодника через /start. Викликати тіні Корчмар не дозволяє: вони погано підписують протоколи.";
  }

  const lines = [
    "🥊 <b>Кинути виклик присутнім</b>",
    "",
    `📍 ${escapeHtml(snapshot.location.name)}`,
    ""
  ];

  if (snapshot.total === 0) {
    lines.push("Активних пригодників поруч зараз немає. Можна оновити список або кинути відкритий виклик у Бійцівському кутку.");
    return lines.join("\n");
  }

  lines.push("Оберіть пригодника поруч:");
  lines.push("");
  lines.push(...snapshot.visible.map(presentNearbyCandidate));

  if (snapshot.totalPages > 1) {
    lines.push("");
    lines.push(`Сторінка ${snapshot.page + 1}/${snapshot.totalPages}`);
  }

  return lines.join("\n");
}

export function presentNearbyDuelMode(target: PresencePerson): string {
  return [
    "🥊 <b>Формат виклику</b>",
    "",
    `Кому: <b>${escapeHtml(target.name)}</b>${target.level ? ` · рівень ${target.level}` : ""}`,
    "",
    "Оберіть, який протокол Корчмар понесе до столу:"
  ].join("\n");
}

export function presentNearbyDuelTargetMissing(): string {
  return [
    "🥊 <b>Виклик не причепився</b>",
    "",
    "Цей пригодник уже не стоїть активним поруч. Оновіть список: корчемна географія має ноги."
  ].join("\n");
}

export function presentNearbyDuelCreate(
  result: DuelCreateResult,
  options: { targetName: string; mode: "quick" | "turn-based"; warning?: DuelResourceWarning } | { targetName: string; mode: "quick" | "turn-based" }
): string {
  if (result.state === "resource-warning") {
    return [
      options.mode === "turn-based"
        ? "♟️ <b>Кинути покрокову дуель?</b>"
        : "⚡ <b>Кинути миттєву дуель?</b>",
      "",
      `Кому: <b>${escapeHtml(options.targetName)}</b>`,
      "",
      "Виклик готовий, але ваш пригодник не зовсім відпочив.",
      presentResourceWarning(result.warning),
      "",
      "Можна кинути все одно. Корчмар просто поставить біля рядка маленьку пляму сумніву."
    ].join("\n");
  }

  if (result.state === "pending") {
    return [
      `${result.challenge.mode === "turn-based" ? "♟️" : "⚡"} <b>Виклик надіслано</b>`,
      "",
      `Кому: <b>${escapeHtml(options.targetName)}</b>`,
      "",
      result.challenge.mode === "turn-based"
        ? "Формат: покрокова дуель із закритими виборами за раунд."
        : "Формат: миттєва дуель із результатом після згоди.",
      "",
      "Запрошення прийде всередині гри. Якщо Telegram промовчить, запис усе одно лишиться відкритим у протоколі.",
      result.challenge.mode === "turn-based"
        ? "За покрокову дуель буде трохи досвіду. Ставок, золота й втрат немає."
        : "Нагород, ставок і втрат немає."
    ].join("\n");
  }

  if (result.state === "level-gated") {
    return [
      "🥊 <b>Рукавиці ще не видали</b>",
      "",
      `Бійцівський куток відкриває дуелі з рівня ${result.minLevel}.`,
      "Корчмар каже, що спершу треба хоча б трохи налякати власну біографію."
    ].join("\n");
  }

  return "Квестарня не знайшла пригодника для виклику. Протокол подивився вбік.";
}

export function presentNearbyDuelTargetNotification(
  result: Extract<DuelCreateResult, { state: "pending" }>
): string {
  return [
    `${result.challenge.mode === "turn-based" ? "♟️" : "⚡"} <b>Вам кинули виклик</b>`,
    "",
    `Запрошує: <b>${escapeHtml(result.challenger.name)}</b> · ${escapeHtml(result.challenger.title)} · рівень ${result.challenger.level}`,
    "",
    result.challenge.mode === "turn-based"
      ? "Покрокова дуель: гравці таємно обирають дії за раунд."
      : "Миттєва дуель: результат з’явиться після згоди.",
    "",
    result.challenge.mode === "turn-based"
      ? "Трохи досвіду за час у протоколі; без золота, ставок і втрат манаток."
      : "Без XP, золота, ставок і втрат манаток."
  ].join("\n");
}

function presentNearbyCandidate(candidate: PresencePerson): string {
  return `— ${escapeHtml(candidate.name)}${candidate.level ? ` · рівень ${candidate.level}` : ""}`;
}

function presentResourceWarning(warning: DuelResourceWarning): string {
  const parts = [];

  if (warning.hpBelowMax) {
    parts.push("здоров’я не повне");
  }

  if (warning.manaBelowMax) {
    parts.push("мана не повна");
  }

  return `Попередження: ${parts.join(", ")}.`;
}
