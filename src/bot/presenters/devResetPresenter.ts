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
