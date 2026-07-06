import { InlineKeyboard } from "grammy";
import {
  makeRemortClassCallbackData,
  makeRemortConfirmCallbackData,
  makeRemortItemPageCallbackData,
  makeRemortItemCallbackData,
  makeRemortPageCallbackData,
  makeRemortPronounCallbackData,
  makeRemortRaceCallbackData
} from "../callbacks/remortCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  getRemortClassOptions,
  getRemortPronounOptions,
  getRemortRaceOptions,
  type RemortViewResult
} from "../../services/remortService";

const REMORT_ITEM_PAGE_SIZE = 8;

export function buildRemortKeyboard(
  result: RemortViewResult,
  options: { itemPage?: number } = {}
): InlineKeyboard {
  if (result.state !== "ready") {
    return new InlineKeyboard().text("⬅️ До дверей", makePlaceCallbackData("front"));
  }

  const token = result.draft.token;
  const itemPage = normalizeItemPage(options.itemPage ?? 0, result.eligibleItems.length);
  const itemPageCount = Math.max(1, Math.ceil(result.eligibleItems.length / REMORT_ITEM_PAGE_SIZE));
  const itemPageStart = itemPage * REMORT_ITEM_PAGE_SIZE;
  const keyboard = new InlineKeyboard();

  for (const option of getRemortPronounOptions()) {
    const marker = option.id === result.identity.pronoun ? "✅ " : "";
    keyboard.text(`${marker}${option.label}`, makeRemortPronounCallbackData(token, option.id));
  }

  keyboard.row();

  for (const option of getRemortRaceOptions()) {
    const marker = option.key === result.identity.raceKey ? "✅ " : "";
    keyboard.text(`${marker}${option.label}`, makeRemortRaceCallbackData(token, option.key)).row();
  }

  for (const option of getRemortClassOptions()) {
    const marker = option.key === result.identity.classKey ? "✅ " : "";
    keyboard.text(`${marker}${option.label}`, makeRemortClassCallbackData(token, option.key)).row();
  }

  if (result.eligibleItems.length > 0) {
    result.eligibleItems.slice(itemPageStart, itemPageStart + REMORT_ITEM_PAGE_SIZE).forEach((item) => {
      const quantity = item.quantity > 1 ? ` ×${item.quantity}` : "";
      keyboard.text(
        `${item.selected ? "✅" : "▫️"} ${item.name}${quantity}`,
        itemPage === 0
          ? makeRemortItemCallbackData(token, item.itemKey)
          : makeRemortItemPageCallbackData(token, item.itemKey, itemPage)
      ).row();
    });

    if (itemPageCount > 1) {
      if (itemPage > 0) {
        keyboard.text("⬅️ Манатки", makeRemortPageCallbackData(token, itemPage - 1));
      }

      keyboard.text(`${itemPage + 1}/${itemPageCount}`, makeRemortPageCallbackData(token, itemPage));

      if (itemPage < itemPageCount - 1) {
        keyboard.text("Манатки ➡️", makeRemortPageCallbackData(token, itemPage + 1));
      }

      keyboard.row();
    }
  }

  keyboard
    .text("⚠️ Підтвердити реморт", makeRemortConfirmCallbackData(token))
    .row()
    .text("⬅️ До дверей", makePlaceCallbackData("front"));

  return keyboard;
}

function normalizeItemPage(page: number, itemCount: number): number {
  const pageCount = Math.max(1, Math.ceil(itemCount / REMORT_ITEM_PAGE_SIZE));
  const normalized = Math.max(0, Math.floor(Number.isFinite(page) ? page : 0));

  return Math.min(normalized, pageCount - 1);
}

export function buildRemortResultKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👤 Персонаж", makeMenuCallbackData("hero"))
    .row()
    .text("🚪 До дверей", makePlaceCallbackData("front"));
}
