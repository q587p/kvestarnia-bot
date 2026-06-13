export function presentDevResetDisabled(): string {
  return "Ця команда доступна лише в локальній майстерні.";
}

export function presentDevResetPrompt(): string {
  return "Скинути героя? Це видалить тільки вашого персонажа і дозволить знову пройти /start.";
}

export function presentDevResetDeleted(): string {
  return "Героя скинуто. Напишіть /start, і корчмар удасть, що бачить вас уперше.";
}

export function presentDevResetNoCharacter(): string {
  return "Скидати нічого: герой ще не створений. /start чекає біля дверей.";
}

export function presentDevResetCancelled(): string {
  return "Скидання скасовано. Герой лишається при манатках.";
}
