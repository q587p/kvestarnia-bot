import { InlineKeyboard } from "grammy";
import {
  makeNewsEntryCallbackData,
  makeNewsListCallbackData
} from "../callbacks/newsCallbackData";
import type { NewsEntry } from "../../news/newsMarkdown";

const NEWS_PAGE_SIZE = 8;
const PREVIOUS_TITLE_COUNT = 8;
const NEWS_CHANNEL_URL = "https://t.me/kvestarnia";

export interface NewsPage {
  text: string;
  keyboard?: InlineKeyboard;
}

export function presentNewsIndex(entries: readonly NewsEntry[], requestedPage = 0): NewsPage {
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
    .map((entry) => `- ${entry.title}`)
    .join("\n");

  return {
    text: [
      "📰 Новини Квестарні",
      `Канал новин: ${NEWS_CHANNEL_URL}`,
      "",
      latest.raw,
      ...(previousTitles ? ["", "Попередні новини:", previousTitles] : []),
      "",
      `Архів: ${rangeStart}-${rangeEnd} з ${entries.length}. Оберіть версію кнопкою.`
    ].join("\n"),
    keyboard: buildNewsIndexKeyboard(entries, page, totalPages)
  };
}

export function presentNewsEntry(
  entries: readonly NewsEntry[],
  requestedEntryIndex: number,
  requestedListPage = 0
): NewsPage {
  if (entries.length === 0) {
    return presentNewsIndex(entries, requestedListPage);
  }

  const entryIndex = clamp(requestedEntryIndex, 0, entries.length - 1);
  const entry = entries[entryIndex];

  return {
    text: [
      "📰 Новини Квестарні",
      `Канал новин: ${NEWS_CHANNEL_URL}`,
      "",
      entry?.raw ?? "Новину не знайдено."
    ].join("\n"),
    keyboard: buildNewsEntryKeyboard(entryIndex, requestedListPage, entries.length)
  };
}

function buildNewsIndexKeyboard(
  entries: readonly NewsEntry[],
  page: number,
  totalPages: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const start = page * NEWS_PAGE_SIZE;
  const pageEntries = entries.slice(start, start + NEWS_PAGE_SIZE);

  for (const entry of pageEntries) {
    keyboard.text(entry.version, makeNewsEntryCallbackData(entry.index, page)).row();
  }

  if (totalPages > 1) {
    if (page > 0) {
      keyboard.text("⏮️ Початок", makeNewsListCallbackData(0));
      keyboard.text("◀️ Назад", makeNewsListCallbackData(page - 1));
      keyboard.row();
    }

    keyboard.text(`${page + 1}/${totalPages}`, makeNewsListCallbackData(page)).row();

    if (page < totalPages - 1) {
      keyboard.text("Далі ▶️", makeNewsListCallbackData(page + 1));
      keyboard.text("Кінець ⏭️", makeNewsListCallbackData(totalPages - 1));
    }
  }

  return keyboard;
}

function buildNewsEntryKeyboard(
  entryIndex: number,
  requestedListPage: number,
  totalEntries: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (entryIndex > 0) {
    keyboard.text("◀️ Новіша", makeNewsEntryCallbackData(entryIndex - 1, requestedListPage));
  }

  if (entryIndex < totalEntries - 1) {
    keyboard.text("Старіша ▶️", makeNewsEntryCallbackData(entryIndex + 1, requestedListPage));
  }

  if (entryIndex > 0 || entryIndex < totalEntries - 1) {
    keyboard.row();
  }

  keyboard.text("↩️ До архіву", makeNewsListCallbackData(requestedListPage));
  return keyboard;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
