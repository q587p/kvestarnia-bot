import { InlineKeyboard } from "grammy";
import type {
  ItemGiftCandidatesResult,
  ItemGiftCreateResult,
  ItemGiftRespondResult,
  ItemGiftSelectionResult
} from "../../services/itemTransferService";
import {
  makeItemGiftAcceptCallbackData,
  makeItemGiftCancelCallbackData,
  makeItemGiftCreateCallbackData,
  makeItemGiftDeclineCallbackData,
  makeItemGiftOpenCallbackData,
  makeItemGiftSelectionPageCallbackData,
  makeItemGiftTargetCallbackData
} from "../callbacks/itemGiftCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

const MAX_BUTTON_NAME_LENGTH = 28;

export function buildItemGiftOpenKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("🎁 Подарувати манатку", makeItemGiftOpenCallbackData());
}

export function buildItemGiftCandidatesKeyboard(result: ItemGiftCandidatesResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "ready") {
    for (const candidate of result.visible) {
      keyboard
        .text(`🎁 ${buttonName(candidate.name)}`, makeItemGiftTargetCallbackData(candidate.telegramUserId, result.page))
        .row();
    }

    if (result.totalPages > 1) {
      if (result.page > 0) {
        keyboard.text("◀️", makeItemGiftOpenCallbackData(result.page - 1));
      }
      keyboard.text(`${result.page + 1}/${result.totalPages}`, makeItemGiftOpenCallbackData(result.page));
      if (result.page + 1 < result.totalPages) {
        keyboard.text("▶️", makeItemGiftOpenCallbackData(result.page + 1));
      }
      keyboard.row();
    }

    keyboard.text("🔎 Оновити", makeItemGiftOpenCallbackData(result.page)).row();
  }

  return keyboard.text("⬅️ До Шинку", makePlaceCallbackData("bar"));
}

export function buildItemGiftSelectionKeyboard(result: ItemGiftSelectionResult): InlineKeyboard {
  if (result.state !== "selection") {
    return buildBackToGiftStartKeyboard();
  }

  const keyboard = new InlineKeyboard();
  for (const item of result.items) {
    keyboard
      .text(
        `🎁 ${buttonName(item.content.name)}`,
        makeItemGiftCreateCallbackData(result.target.telegramUserId, result.page, item.index, item.selectionGuard)
      )
      .row();
  }

  if (result.pageCount > 1) {
    if (result.page > 0) {
      keyboard.text("◀️", makeItemGiftSelectionPageCallbackData(result.target.telegramUserId, result.page - 1));
    }
    keyboard.text(`${result.page + 1}/${result.pageCount}`, makeItemGiftSelectionPageCallbackData(result.target.telegramUserId, result.page));
    if (result.page + 1 < result.pageCount) {
      keyboard.text("▶️", makeItemGiftSelectionPageCallbackData(result.target.telegramUserId, result.page + 1));
    }
    keyboard.row();
  }

  return keyboard.text("⬅️ До присутніх", makeItemGiftOpenCallbackData()).row()
    .text("⬅️ До Шинку", makePlaceCallbackData("bar"));
}

export function buildItemGiftCreateKeyboard(result: ItemGiftCreateResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (result.state === "created") {
    keyboard.text("🧹 Скасувати", makeItemGiftCancelCallbackData(result.transfer.token)).row();
  }

  return keyboard.text("⬅️ До Шинку", makePlaceCallbackData("bar"));
}

export function buildItemGiftOfferKeyboard(result: Extract<ItemGiftCreateResult, { state: "created" }>): InlineKeyboard {
  return new InlineKeyboard()
    .text("🎁 Прийняти", makeItemGiftAcceptCallbackData(result.transfer.token))
    .row()
    .text("Ні, дякую", makeItemGiftDeclineCallbackData(result.transfer.token));
}

export function buildItemGiftResultKeyboard(_result: ItemGiftRespondResult): InlineKeyboard {
  void _result;
  return new InlineKeyboard().text("⬅️ До Шинку", makePlaceCallbackData("bar"));
}

function buildBackToGiftStartKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ До присутніх", makeItemGiftOpenCallbackData())
    .row()
    .text("⬅️ До Шинку", makePlaceCallbackData("bar"));
}

function buttonName(name: string): string {
  return name.length <= MAX_BUTTON_NAME_LENGTH
    ? name
    : `${name.slice(0, MAX_BUTTON_NAME_LENGTH - 1)}…`;
}
