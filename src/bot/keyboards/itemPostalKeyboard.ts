import { InlineKeyboard } from "grammy";
import type {
  ItemGiftRespondResult,
  ItemPostalConfirmServiceResult,
  ItemPostalDraftViewResult,
  ItemPostalRecipientsListResult
} from "../../services/itemTransferService";
import {
  makeItemPostalAcceptCallbackData,
  makeItemPostalAddCallbackData,
  makeItemPostalCancelCallbackData,
  makeItemPostalConfirmCallbackData,
  makeItemPostalDeclineCallbackData,
  makeItemPostalOpenCallbackData,
  makeItemPostalPageCallbackData,
  makeItemPostalQuantityCallbackData,
  makeItemPostalRecipientCallbackData,
  makeItemPostalRemoveCallbackData
} from "../callbacks/itemPostalCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

const MAX_BUTTON_NAME_LENGTH = 24;

export function buildItemPostalOpenKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("📮 Пошта Квестарні", makeItemPostalOpenCallbackData());
}

export function buildItemPostalRecipientsKeyboard(result: ItemPostalRecipientsListResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (result.state === "ready") {
    for (const recipient of result.visible) {
      keyboard.text(`📮 ${buttonName(recipient.name)}`, makeItemPostalRecipientCallbackData(recipient.telegramUserId, result.page)).row();
    }
    if (result.totalPages > 1) {
      if (result.page > 0) {
        keyboard.text("◀️", makeItemPostalOpenCallbackData(result.page - 1));
      }
      keyboard.text(`${result.page + 1}/${result.totalPages}`, makeItemPostalOpenCallbackData(result.page));
      if (result.page + 1 < result.totalPages) {
        keyboard.text("▶️", makeItemPostalOpenCallbackData(result.page + 1));
      }
      keyboard.row();
    }
    keyboard.text("🔎 Оновити", makeItemPostalOpenCallbackData(result.page)).row();
  }

  return keyboard.text("↩️ До місцини", makePlaceCallbackData("current"));
}

export function buildItemPostalDraftKeyboard(result: ItemPostalDraftViewResult): InlineKeyboard {
  if (result.state !== "draft") {
    return new InlineKeyboard().text("↩️ До місцини", makePlaceCallbackData("current"));
  }

  const keyboard = new InlineKeyboard();
  result.packageLines.forEach((line, index) => {
    keyboard.text("➖", makeItemPostalQuantityCallbackData(result.transfer.token, index, Math.max(1, line.quantity - 1), result.page));
    keyboard.text(`×${line.quantity}`, makeItemPostalQuantityCallbackData(result.transfer.token, index, line.quantity, result.page));
    keyboard.text("➕", makeItemPostalQuantityCallbackData(result.transfer.token, index, Math.min(93, line.quantity + 1), result.page));
    keyboard.text("93", makeItemPostalQuantityCallbackData(result.transfer.token, index, 93, result.page));
    keyboard.text("🧹", makeItemPostalRemoveCallbackData(result.transfer.token, index, result.page)).row();
  });

  for (const item of result.items) {
    if (result.packageLines.some((line) => line.itemId === item.itemId)) {
      continue;
    }
    keyboard
      .text(
        `➕ ${buttonName(item.content.name)}`,
        makeItemPostalAddCallbackData(result.transfer.token, result.page, item.index, item.selectionGuard)
      )
      .row();
  }

  if (result.pageCount > 1) {
    if (result.page > 0) {
      keyboard.text("◀️", makeItemPostalPageCallbackData(result.transfer.token, result.page - 1));
    }
    keyboard.text(`${result.page + 1}/${result.pageCount}`, makeItemPostalPageCallbackData(result.transfer.token, result.page));
    if (result.page + 1 < result.pageCount) {
      keyboard.text("▶️", makeItemPostalPageCallbackData(result.transfer.token, result.page + 1));
    }
    keyboard.row();
  }

  if (result.packageLines.length > 0) {
    keyboard.text("📮 Передати гінцеві", makeItemPostalConfirmCallbackData(result.transfer.token)).row();
  }

  return keyboard
    .text("🧹 Скасувати", makeItemPostalCancelCallbackData(result.transfer.token))
    .row()
    .text("⬅️ До отримувачів", makeItemPostalOpenCallbackData())
    .row()
    .text("↩️ До місцини", makePlaceCallbackData("current"));
}

export function buildItemPostalConfirmKeyboard(result: ItemPostalConfirmServiceResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  if (result.state === "created") {
    keyboard.text("🧹 Скасувати", makeItemPostalCancelCallbackData(result.transfer.token)).row();
  }

  return keyboard.text("↩️ До місцини", makePlaceCallbackData("current"));
}

export function buildItemPostalOfferKeyboard(result: Extract<ItemPostalConfirmServiceResult, { state: "created" }>): InlineKeyboard {
  return new InlineKeyboard()
    .text("📮 Прийняти", makeItemPostalAcceptCallbackData(result.transfer.token))
    .row()
    .text("Ні, дякую", makeItemPostalDeclineCallbackData(result.transfer.token));
}

export function buildItemPostalResultKeyboard(_result: ItemGiftRespondResult): InlineKeyboard {
  void _result;
  return new InlineKeyboard().text("↩️ До місцини", makePlaceCallbackData("current"));
}

function buttonName(name: string): string {
  return name.length <= MAX_BUTTON_NAME_LENGTH
    ? name
    : `${name.slice(0, MAX_BUTTON_NAME_LENGTH - 1)}…`;
}
