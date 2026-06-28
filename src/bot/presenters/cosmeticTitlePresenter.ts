import type {
  CosmeticTitleListEntry,
  CosmeticTitleListView,
  CosmeticTitleMutationState
} from "../../services/achievementService";
import { escapeHtml } from "./telegramHtml";

const TITLE_DATE_TIME_ZONE = "Europe/Kyiv";
const titleDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TITLE_DATE_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

export function presentCosmeticTitles(
  view: CosmeticTitleListView,
  options: { notice?: string | null } = {}
): string {
  const lines = [
    "🏷️ <b>Титули</b>",
    "Один можна носити в картці персонажа. Бонусів він не дає.",
    ""
  ];

  if (options.notice) {
    lines.push(`ℹ️ ${escapeHtml(options.notice)}`, "");
  }

  if (view.entries.length === 0) {
    lines.push("Титулів ще нема. Ачівки вже точать таблички, але поки без вашого прізвища.");
  } else {
    lines.push(...view.entries.map((entry, index) => presentCosmeticTitleRow(entry, index + 1)));
  }

  if (view.activeTitleMissing) {
    lines.push("", "Активний титул загубився в архіві. Його можна очистити.");
  }

  return lines.join("\n");
}

export function presentCosmeticTitleNotice(state: CosmeticTitleMutationState, unlockCount = 0): string {
  const achievement = unlockCount > 0 ? " Ачівка за перший вибір теж записана." : "";

  switch (state) {
    case "selected":
      return `Титул вдягнуто.${achievement}`;
    case "already-active":
      return "Цей титул уже активний. Літописець лише кивнув.";
    case "cleared":
      return "Косметичний титул знято. Сила не змінилася, як і планувалося.";
    case "already-clear":
      return "Активного косметичного титулу й так нема.";
    case "not-owned":
      return "Цей титул не належить вашому пригоднику.";
    case "stale-life":
      return "Картка застаріла після реморту. Ось поточний список.";
  }
}

function presentCosmeticTitleRow(entry: CosmeticTitleListEntry, index: number): string {
  const marker = entry.active ? "✅" : "▫️";
  const archive = entry.archived ? " • архів" : "";

  return `${index}. ${marker} <b>${escapeHtml(entry.title)}</b> — з ачівки «${escapeHtml(entry.sourceAchievementTitle)}» • ${formatTitleDate(entry.grantedAt)}${archive}`;
}

function formatTitleDate(date: Date): string {
  const parts = titleDateFormatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";

  return `${day}.${month}`;
}
