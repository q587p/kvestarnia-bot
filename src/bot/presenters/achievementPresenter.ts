import type { AchievementListEntry, AchievementListView, AchievementUnlock } from "../../services/achievementService";
import { escapeHtml } from "./telegramHtml";

export function presentAchievements(
  view: AchievementListView,
  options: { notice?: string | null } = {}
): string {
  const lines = [
    "🏅 <b>Ачівки</b>",
    `Розділ: ${presentAchievementFilter(view.filter)}`,
    `Отримано: <b>${view.earnedCount}/${view.totalCount}</b>`,
    `Сторінка: <b>${view.page + 1}/${view.totalPages}</b>`,
    ""
  ];

  if (options.notice) {
    lines.push(`🔎 ${escapeHtml(options.notice)}`, "");
  }

  if (view.entries.length === 0) {
    lines.push("Журнал порожній. Літописець підозріло чистить перо.");
  } else {
    lines.push(...view.entries.map((entry, index) => presentAchievementRow(entry, view.page * 10 + index + 1)));
  }

  return lines.join("\n");
}

function presentAchievementFilter(filter: AchievementListView["filter"]): string {
  if (filter === "earned") {
    return "✅ Отримані";
  }

  if (filter === "locked") {
    return "🔒 Не отримані";
  }

  return "📚 Усі";
}

export function presentAchievementCheckNotice(unlockCount: number): string {
  if (unlockCount === 0) {
    return "Перевірено: нових записів немає. Літописець поставив галочку й удав, що так і було.";
  }

  return `Перевірено: нових записів: ${unlockCount}. Літописець дістав ще одну теку.`;
}

export function presentAchievementUnlockNotification(unlocks: readonly AchievementUnlock[]): string | null {
  if (unlocks.length === 0) {
    return null;
  }

  if (unlocks.length === 1) {
    const unlock = unlocks[0]!;
    const titleLine = `«${escapeHtml(unlock.title)}»`;
    const titleGrant = unlock.cosmeticTitleGrantId
      ? "\nТитульний запис додано в Персонаж → Ачівки."
      : "";

    return `🏅 <b>Нова ачівка!</b>\n${titleLine}${titleGrant}`;
  }

  return [
    `🏅 <b>Нові ачівки: ${unlocks.length}</b>`,
    ...unlocks.map((unlock) => `✅ ${escapeHtml(unlock.title)}`),
    "Записи додано в Персонаж → Ачівки."
  ].join("\n");
}

function presentAchievementRow(entry: AchievementListEntry, index: number): string {
  if (!entry.earned && entry.hidden) {
    return `${index}. ❔ <b>${escapeHtml(entry.title)}</b> — ${escapeHtml(entry.description)}`;
  }

  const marker = entry.earned ? "✅" : "🔒";
  const progress = presentProgress(entry);
  const date = entry.unlockedAt ? ` • ${formatAchievementDate(entry.unlockedAt)}` : "";
  const titleGrant = entry.earned && entry.cosmeticTitleGrantId ? " • титульний запис" : "";

  return `${index}. ${marker} <b>${escapeHtml(entry.title)}</b> — ${escapeHtml(entry.description)}${progress}${date}${titleGrant}`;
}

function presentProgress(entry: AchievementListEntry): string {
  if (entry.earned || entry.progressCurrent === null || entry.progressTarget === null) {
    return "";
  }

  return ` • ${entry.progressCurrent}/${entry.progressTarget}`;
}

function formatAchievementDate(date: Date): string {
  const now = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  if (date.getFullYear() === now.getFullYear()) {
    return `${day}.${month}`;
  }

  return `${day}.${month}.${String(date.getFullYear()).slice(-2)}`;
}
