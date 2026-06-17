import type { TrainingDoppelgangerResult } from "../../services/trainingDoppelgangerService";
import { escapeHtml, presentCharacterHeader } from "./telegramHtml";

export function presentTrainingDoppelgangerNoCharacter(): string {
  return "Спершу створіть пригодника через /start. Допельґанґер не копіює порожні анкети.";
}

export function presentTrainingDoppelgangerNeedsRest(
  result: Extract<TrainingDoppelgangerResult, { state: "needs-rest" }>
): string {
  return [
    "🥊 <b>Бійцівський куток</b>",
    presentCharacterHeader(result.character),
    "",
    "Сумлінний Допельґанґер чемно розминається, але герой тримається на чесному слові.",
    "",
    "Спершу віддихайтеся. Тренування не має починатися з інструкції «підберіть себе з підлоги»."
  ].join("\n");
}

export function presentTrainingDoppelganger(
  result: Extract<TrainingDoppelgangerResult, { state: "ready" }>
): string {
  return [
    "🥊 <b>Бійцівський куток</b>",
    presentCharacterHeader(result.character),
    "",
    "У кутку корчми стоїть <b>Сумлінний Допельґанґер</b>: він копіює вас так обережно, ніби підписував акт приймання-передачі особистости.",
    "",
    `Копія: ${escapeHtml(result.doppelganger.raceName)} · ${escapeHtml(result.doppelganger.className)} · рівень ${result.doppelganger.level}`,
    `Титул копії: <i>${escapeHtml(result.doppelganger.title)}</i>`,
    "",
    presentTrainingOutcome(result),
    "",
    "Нагород немає: це тренування перед майбутніми дуелями, а не спосіб фармити корчму."
  ].join("\n");
}

function presentTrainingOutcome(
  result: Extract<TrainingDoppelgangerResult, { state: "ready" }>
): string {
  const outcomeLine =
    result.resolution.outcome === "hero-wins"
      ? "Результат: ви переграли власну копію."
      : result.resolution.outcome === "doppelganger-wins"
        ? "Результат: копія переграла вас і дуже ввічливо цим пишається."
        : "Результат: нічия. Обидві сторони вимагають перегляду протоколу.";

  return [outcomeLine, presentReason(result.resolution.reason)].join("\n");
}

function presentReason(reason: Extract<TrainingDoppelgangerResult, { state: "ready" }>["resolution"]["reason"]): string {
  switch (reason) {
    case "hero-found-gap":
      return "Ви помітили паузу саме там, де допельґанґер надто старанно повторював ваш героїчний вираз обличчя.";
    case "copy-read-notes":
      return "Копія, здається, прочитала ваші попередні помилки й підкреслила найсмішніші.";
    case "mutual-paperwork":
      return "Після третього обміну ударами обидва вирішили, що формально це вже звітність.";
    case "matched-footwork":
      return "Кроки збіглися так точно, що підлога попросила попереджати її заздалегідь.";
  }
}
