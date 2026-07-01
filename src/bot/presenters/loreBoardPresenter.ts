import { InlineKeyboard } from "grammy";
import {
  getLoreCategory,
  getLoreEntriesForCategory,
  getLoreEntry,
  loreCategories,
  loreEntries,
  type LoreCategory,
  type LoreEntry
} from "../../content/loreBoard";
import {
  makeLoreCategoryCallbackData,
  makeLoreCategoryRandomCallbackData,
  makeLoreEntryCallbackData,
  makeLoreMenuCallbackData,
  makeLoreRandomCallbackData
} from "../callbacks/loreBoardCallbackData";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { escapeHtml } from "./telegramHtml";

export interface LoreBoardPage {
  text: string;
  keyboard: InlineKeyboard;
}

export function presentLoreMenu(): LoreBoardPage {
  const keyboard = new InlineKeyboard();

  for (const category of sortedCategories(loreCategories)) {
    keyboard.text(category.title, makeLoreCategoryCallbackData(category.id)).row();
  }

  keyboard
    .text("🎲 Випадковий переказ", makeLoreRandomCallbackData())
    .row()
    .text("⬅️ До Дошки корчми", makePlaceCallbackData("news-corner"));

  return {
    text: [
      "📖 Перекази Квестарні",
      "",
      "На краю Дошки корчми висить тека з переказами. Тут не все правда, але в Квестарні правда й не завжди найдорожча.",
      "",
      "Обери, про що почитати:"
    ].join("\n"),
    keyboard
  };
}

export function presentLoreCategory(categoryId: string): LoreBoardPage {
  const category = getLoreCategory(categoryId);

  if (!category) {
    return presentLoreInvalidCategory();
  }

  const entries = getLoreEntriesForCategory(category.id);
  const keyboard = new InlineKeyboard();
  const externalCategory = category.entryMode === "external";

  if (externalCategory && category.id === "bestiary") {
    keyboard.text("📖 Відкрити Бестіарій", makeBestiaryListCallbackData(0, "lore")).row();
  }

  for (const entry of entries) {
    keyboard.text(entry.title, makeLoreEntryCallbackData(entry.id)).row();
  }

  if (!externalCategory && entries.length > 0) {
    keyboard.text("🎲 Випадковий із цієї категорії", makeLoreCategoryRandomCallbackData(category.id)).row();
  }

  keyboard
    .text("⬅️ До переказів", makeLoreMenuCallbackData())
    .row()
    .text("🪧 До Дошки корчми", makePlaceCallbackData("news-corner"));

  return {
    text: [
      escapeHtml(category.title),
      "",
      escapeHtml(category.description),
      "",
      presentLoreCategoryListLabel(category, entries.length)
    ].join("\n"),
    keyboard
  };
}

export function presentLoreEntry(entryId: string): LoreBoardPage {
  const entry = getLoreEntry(entryId);

  if (!entry) {
    return presentLoreInvalidEntry();
  }

  return presentLoreEntryPage(entry);
}

export function presentLoreEntryPage(entry: LoreEntry): LoreBoardPage {
  const category = getLoreCategory(entry.categoryId);
  const entries = getLoreEntriesForCategory(entry.categoryId);
  const index = Math.max(0, entries.findIndex((candidate) => candidate.id === entry.id));
  const categoryPosition = category ? `${category.title} · ${index + 1}/${Math.max(1, entries.length)}` : "Перекази";

  const keyboard = new InlineKeyboard()
    .text("⬅️ Категорія", makeLoreCategoryCallbackData(entry.categoryId))
    .row()
    .text("🎲 Ще переказ", makeLoreRandomCallbackData())
    .row()
    .text("📖 Усі перекази", makeLoreMenuCallbackData())
    .row()
    .text("🪧 До Дошки корчми", makePlaceCallbackData("news-corner"));

  return {
    text: [
      `📖 <b>${escapeHtml(entry.title)}</b>`,
      `<i>Джерело: ${escapeHtml(entry.source)}.</i>`,
      "",
      escapeHtml(entry.body),
      "",
      `— ${escapeHtml(categoryPosition)}`
    ].join("\n"),
    keyboard
  };
}

export function presentLoreEmptyRandom(): LoreBoardPage {
  const keyboard = new InlineKeyboard()
    .text("📖 Усі перекази", makeLoreMenuCallbackData())
    .row()
    .text("🪧 До Дошки корчми", makePlaceCallbackData("news-corner"));

  return {
    text: [
      "📖 Перекази Квестарні",
      "",
      "Тут поки тихо. Навіть підозріло тихо."
    ].join("\n"),
    keyboard
  };
}

function presentLoreInvalidCategory(): LoreBoardPage {
  const menu = presentLoreMenu();

  return {
    text: [
      "📖 Перекази Квестарні",
      "",
      "Цю теку переклали. Можливо, під ніжку столу.",
      "",
      "Повертаю до списку переказів."
    ].join("\n"),
    keyboard: menu.keyboard
  };
}

function presentLoreInvalidEntry(): LoreBoardPage {
  const keyboard = new InlineKeyboard()
    .text("📖 Усі перекази", makeLoreMenuCallbackData())
    .row()
    .text("🪧 До Дошки корчми", makePlaceCallbackData("news-corner"));

  return {
    text: [
      "📖 Перекази Квестарні",
      "",
      "На цьому місці лишилася тільки дірка від цвяха. Повертаю до переказів."
    ].join("\n"),
    keyboard
  };
}

function sortedCategories(categories: readonly LoreCategory[]): LoreCategory[] {
  return [...categories].sort((left, right) => left.sortOrder - right.sortOrder);
}

function presentLoreCategoryListLabel(category: LoreCategory, entryCount: number): string {
  if (category.entryMode === "external") {
    return "Окремий записник:";
  }

  return entryCount > 0 ? "Перекази:" : "Тут поки тихо. Навіть підозріло тихо.";
}

export function getLoreEntryCount(): number {
  return loreEntries.length;
}
