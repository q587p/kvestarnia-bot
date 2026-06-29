import { InlineKeyboard } from "grammy";
import {
  makeNewsEntryCallbackData,
  makeNewsListCallbackData,
  type NewsCallbackSource
} from "../callbacks/newsCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";
import type { NewsEntry } from "../../news/newsMarkdown";
import { escapeHtml } from "./telegramHtml";

const NEWS_PAGE_SIZE = 8;
const PREVIOUS_TITLE_COUNT = 8;
const NEWS_CHANNEL_URL = "https://t.me/kvestarnia";

export interface NewsPage {
  text: string;
  keyboard?: InlineKeyboard;
}

export function presentNewsIndex(
  entries: readonly NewsEntry[],
  requestedPage = 0,
  source: NewsCallbackSource = "hall"
): NewsPage {
  if (entries.length === 0) {
    return {
      text: "Новини Квестарні поки недоступні: news.md порожній або не читається."
    };
  }

  const latest = entries[0]!;
  const totalPages = Math.max(1, Math.ceil(entries.length / NEWS_PAGE_SIZE));
  const page = clamp(requestedPage, 0, totalPages - 1);
  const rangeStart = page * NEWS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(entries.length, rangeStart + NEWS_PAGE_SIZE - 1);
  const previousTitles = entries
    .slice(1, PREVIOUS_TITLE_COUNT + 1)
    .map((entry) => `- <b>${escapeHtml(entry.title)}</b>`)
    .join("\n");

  return {
    text: [
      "📰 Новини Квестарні",
      `Канал новин: ${NEWS_CHANNEL_URL}`,
      "",
      renderNewsEntry(latest),
      ...(previousTitles ? ["", "Попередні новини:", previousTitles] : []),
      "",
      `Архів: ${rangeStart}-${rangeEnd} з ${entries.length}. Оберіть версію кнопкою.`
    ].join("\n"),
    keyboard: buildNewsIndexKeyboard(entries, page, totalPages, source)
  };
}

export function presentNewsEntry(
  entries: readonly NewsEntry[],
  requestedEntryIndex: number,
  requestedListPage = 0,
  source: NewsCallbackSource = "hall"
): NewsPage {
  if (entries.length === 0) {
    return presentNewsIndex(entries, requestedListPage, source);
  }

  const entryIndex = clamp(requestedEntryIndex, 0, entries.length - 1);
  const entry = entries[entryIndex];

  return {
    text: [
      "📰 Новини Квестарні",
      `Канал новин: ${NEWS_CHANNEL_URL}`,
      "",
      entry ? renderNewsEntry(entry) : "Новину не знайдено."
    ].join("\n"),
    keyboard: buildNewsEntryKeyboard(entryIndex, requestedListPage, entries.length, source)
  };
}

function buildNewsIndexKeyboard(
  entries: readonly NewsEntry[],
  page: number,
  totalPages: number,
  source: NewsCallbackSource
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const start = page * NEWS_PAGE_SIZE;
  const pageEntries = entries.slice(start, start + NEWS_PAGE_SIZE);

  for (const entry of pageEntries) {
    keyboard.text(entry.version, makeNewsEntryCallbackData(entry.index, page, source)).row();
  }

  if (totalPages > 1) {
    if (page > 0) {
      keyboard.text("⏮️ Початок", makeNewsListCallbackData(0, source));
      keyboard.text("◀️ Назад", makeNewsListCallbackData(page - 1, source));
      keyboard.row();
    }

    keyboard.text(`${page + 1}/${totalPages}`, makeNewsListCallbackData(page, source)).row();

    if (page < totalPages - 1) {
      keyboard.text("Далі ▶️", makeNewsListCallbackData(page + 1, source));
      keyboard.text("Кінець ⏭️", makeNewsListCallbackData(totalPages - 1, source));
    }
  }

  return addReturnButton(keyboard.row(), source);
}

function buildNewsEntryKeyboard(
  entryIndex: number,
  requestedListPage: number,
  totalEntries: number,
  source: NewsCallbackSource
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (entryIndex > 0) {
    keyboard.text("◀️ Новіша", makeNewsEntryCallbackData(entryIndex - 1, requestedListPage, source));
  }

  if (entryIndex < totalEntries - 1) {
    keyboard.text("Старіша ▶️", makeNewsEntryCallbackData(entryIndex + 1, requestedListPage, source));
  }

  if (entryIndex > 0 || entryIndex < totalEntries - 1) {
    keyboard.row();
  }

  keyboard.text("↩️ До архіву", makeNewsListCallbackData(requestedListPage, source)).row();
  return addReturnButton(keyboard, source);
}

function addReturnButton(keyboard: InlineKeyboard, source: NewsCallbackSource): InlineKeyboard {
  return source === "raid"
    ? keyboard.text("⬅️ До рейду", makeTavernCallbackData("raid"))
    : keyboard.text("⬅️ Назад", makePlaceCallbackData("news-corner"));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function renderNewsEntry(entry: NewsEntry): string {
  return [`<b>${escapeHtml(entry.title)}</b>`, "", escapeHtml(entry.body)].join("\n");
}
