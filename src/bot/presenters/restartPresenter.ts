export function presentRestartPrompt(): string {
  return [
    "🔄 Почати персонажа з початку?",
    "Це видалить тільки вашого поточного персонажа.",
    "",
    "Після цього напишіть /start і створіть нового пригодника."
  ].join("\n");
}

export function presentRestartDeleted(): string {
  return "Персонажа видалено. Напишіть /start, і Квестарня наллє чистий аркуш біографії.";
}

export function presentRestartNoCharacter(): string {
  return "Починати з початку ще нічого: пригодника не створено. Напишіть /start.";
}

export function presentRestartActiveCombat(): string {
  return "Почати заново під час активного бою не можна. Спершу завершіть бій — корчма не викреслює учасників посеред раунду.";
}

export function presentRestartActiveParty(): string {
  return "Почати заново під час живого збору ватаги не можна. Спершу вийдіть із ватаги або завершіть спільну справу.";
}

export function presentRestartCancelled(): string {
  return "Перезапуск скасовано. Персонаж лишається при манатках і життєвих рішеннях.";
}
