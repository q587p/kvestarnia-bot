export function presentRestartPrompt(): string {
  return [
    "🔄 Почати героя з початку?",
    "Це видалить тільки вашого поточного персонажа.",
    "",
    "Після цього напишіть /start і створіть нового героя."
  ].join("\n");
}

export function presentRestartDeleted(): string {
  return "Героя видалено. Напишіть /start, і Квестарня наллє чистий аркуш біографії.";
}

export function presentRestartNoCharacter(): string {
  return "Починати з початку ще нічого: герой не створений. Напишіть /start.";
}

export function presentRestartCancelled(): string {
  return "Перезапуск скасовано. Герой лишається при манатках і життєвих рішеннях.";
}
