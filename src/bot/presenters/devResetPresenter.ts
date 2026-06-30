import type { DevMonsterRestCooldownResetResult } from "../../services/fightService";
import type { TavernDevRaidResetResult, TavernDevRaidStopResult } from "../../services/tavernRaidService";

export function presentDevResetDisabled(): string {
  return "Ця команда доступна лише в локальній майстерні.";
}

export function presentDevResetPrompt(): string {
  return "Скинути персонажа? Це видалить тільки вашого персонажа і дозволить знову пройти /start.";
}

export function presentDevResetDeleted(): string {
  return "Персонажа скинуто. Напишіть /start, і корчмар удасть, що бачить вас уперше.";
}

export function presentDevResetNoCharacter(): string {
  return "Скидати нічого: пригодника ще не створено. /start чекає біля дверей.";
}

export function presentDevResetCancelled(): string {
  return "Скидання скасовано. Персонаж лишається при манатках.";
}

export function presentDevAdventureResetResult(
  result: "reset" | "rerolled" | "no-character" | "unavailable"
): string {
  if (result === "reset") {
    return "Поточний вибір пригоди скинуто. Стіл зі справами вже перетасував папірці.";
  }

  if (result === "rerolled") {
    return "Закритої пригоди ще не було, але стіл зі справами все одно перетасував папірці.";
  }

  if (result === "unavailable") {
    return "Скидання пригоди недоступне: сховище не має потрібного гачка.";
  }

  return "Скидати нічого: пригодника ще не створено. /start чекає біля дверей.";
}

export function presentDevKorchmaRoundResetResult(
  result: "reset" | "no-character" | "unavailable"
): string {
  if (result === "reset") {
    return "Корчмарський обхід скинуто для поточного київського дня. Наступне відкриття заново підніме сьогоднішні папірці з-під кухля.";
  }

  if (result === "unavailable") {
    return "Скидання Корчмарського обходу недоступне: сховище не має потрібного гачка.";
  }

  return "Скидати нічого: пригодника ще не створено. /start чекає біля дверей.";
}

export function presentDevMonsterRestResetResult(
  result: DevMonsterRestCooldownResetResult
): string {
  if (result.state === "reset") {
    return `Перерву монстрів скинуто. Низ знову вдає, що готовий до бою. Зістарено записів: ${result.clearedSessions}.`;
  }

  if (result.state === "no-cooldown") {
    return "Активної перерви монстрів не знайдено. Низ і так бурчить у робочому режимі.";
  }

  if (result.state === "unavailable") {
    return "Скидання перерви монстрів недоступне: сховище не має потрібного гачка.";
  }

  return "Скидати нічого: пригодника ще не створено. /start чекає біля дверей.";
}

export function presentDevRaidStopResult(result: TavernDevRaidStopResult): string {
  if (result.state === "completed") {
    return [
      "Рейд на Бочку завершено достроково.",
      `Зараховано: +${result.result.reward.xp} XP, +${result.result.reward.gold} золота.`
    ].join("\n");
  }

  if (result.state === "already-completed") {
    return "Рейд на Бочку в цьому відтинку вже було завершено. Бочка робить вигляд, що так і планувала.";
  }

  if (result.state === "no-pending") {
    return "Немає активного рейду на Бочку, який можна зупинити. Спершу почніть рейд у корчмі.";
  }

  if (result.state === "unavailable") {
    return "Зупинка рейду недоступна: сховище не має потрібного гачка.";
  }

  return "Зупиняти нічого: пригодника ще не створено. /start чекає біля дверей.";
}

export function presentDevRaidResetResult(result: TavernDevRaidResetResult): string {
  if (result.state === "reset") {
    const cleared = [
      result.clearedPending ? "таймер очікування" : null,
      result.clearedCompletion ? "зарахований відтинок" : null
    ].filter(Boolean);

    return [
      "Рейдовий таймер Бочки скинуто для локального тесту.",
      `Очищено: ${cleared.join(", ")}.`
    ].join("\n");
  }

  if (result.state === "nothing-to-reset") {
    return "Для Бочки немає активного таймера чи зарахованого відтинку. Вона й так готова до тесту.";
  }

  if (result.state === "unavailable") {
    return "Скидання рейду недоступне: сховище не має потрібного гачка.";
  }

  return "Скидати нічого: пригодника ще не створено. /start чекає біля дверей.";
}
