import {
  ACHIEVEMENTS_PAGE_SIZE,
  type AchievementListEntry,
  type AchievementListView,
  type AchievementUnlock
} from "../../services/achievementService";
import { escapeHtml } from "./telegramHtml";

const ACHIEVEMENT_DATE_TIME_ZONE = "Europe/Kyiv";
const achievementDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ACHIEVEMENT_DATE_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});
const ACHIEVEMENTS_SECTION_LINK = "<i>Персонаж → Ачівки.</i>";

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
    lines.push(
      ...view.entries.map((entry, index) =>
        presentAchievementRow(entry, view.page * ACHIEVEMENTS_PAGE_SIZE + index + 1))
    );
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
      ? `\nТитульний запис додано в ${ACHIEVEMENTS_SECTION_LINK}`
      : "";

    return `🏅 <b>Нова ачівка!</b>\n${titleLine}${titleGrant}`;
  }

  return [
    `🏅 <b>Нові ачівки: ${unlocks.length}</b>`,
    ...unlocks.map((unlock) => `✅ ${escapeHtml(unlock.title)}`),
    `Записи додано в ${ACHIEVEMENTS_SECTION_LINK}`
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
  const { day, month, year } = getKyivDateParts(date);
  const currentYear = getKyivDateParts(now).year;

  if (year === currentYear) {
    return `${day}.${month}`;
  }

  return `${day}.${month}.${year.slice(-2)}`;
}

function getKyivDateParts(date: Date): { day: string; month: string; year: string } {
  const parts = achievementDateFormatter.formatToParts(date);

  return {
    day: parts.find((part) => part.type === "day")?.value ?? "01",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    year: parts.find((part) => part.type === "year")?.value ?? "0000"
  };
}
