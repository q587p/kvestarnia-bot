export function presentBattleObserverNotice(encounter: "бою" | "рейду" | "тестового бою"): string {
  return `Ви вибиті з ${encounter}. Картка лишається для спостереження й оновлення.`;
}
