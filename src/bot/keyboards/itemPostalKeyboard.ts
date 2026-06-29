import { InlineKeyboard } from "grammy";
import type {
  ItemGiftRespondResult,
  ItemPostalConfirmServiceResult,
  ItemPostalDraftViewResult,
  ItemPostalOpenSection,
  ItemPostalRecipientsListResult
} from "../../services/itemTransferService";
import { ITEM_POSTAL_MAX_UNITS_PER_TYPE } from "../../domain/itemTransfers";
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
    for (const transfer of result.inTransit.visible) {
      if (transfer.direction === "incoming") {
        keyboard
          .text(`📮 Прийняти від ${buttonName(transfer.otherName)}`, makeItemPostalAcceptCallbackData(transfer.token))
          .row()
          .text("Ні, дякую", makeItemPostalDeclineCallbackData(transfer.token))
          .row();
      } else {
        keyboard
          .text(`🧹 Скасувати до ${buttonName(transfer.otherName)}`, makeItemPostalCancelCallbackData(transfer.token))
          .row();
      }
    }
    addSectionPagination(keyboard, result.inTransit, "transit");

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
    addSectionPagination(keyboard, result.history, "history");
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
    addQuantityButtons(keyboard, result, line, index);
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

function addQuantityButtons(
  keyboard: InlineKeyboard,
  result: Extract<ItemPostalDraftViewResult, { state: "draft" }>,
  line: Extract<ItemPostalDraftViewResult, { state: "draft" }>["packageLines"][number],
  index: number
): void {
  if (line.quantity <= 1) {
    keyboard.text("➖", makeItemPostalRemoveCallbackData(result.transfer.token, index, result.page));
  } else {
    keyboard.text("-1", makeItemPostalQuantityCallbackData(result.transfer.token, index, line.quantity - 1, result.page));
    for (const step of [5, 10, 50]) {
      if (line.quantity > step) {
        keyboard.text(`-${step}`, makeItemPostalQuantityCallbackData(result.transfer.token, index, line.quantity - step, result.page));
      }
    }
  }

  const maxAvailable = Math.min(ITEM_POSTAL_MAX_UNITS_PER_TYPE, line.observedQuantity);
  if (line.quantity < maxAvailable) {
    keyboard.text("+1", makeItemPostalQuantityCallbackData(result.transfer.token, index, line.quantity + 1, result.page));
    for (const step of [5, 10, 50]) {
      if (line.quantity + step <= maxAvailable) {
        keyboard.text(`+${step}`, makeItemPostalQuantityCallbackData(result.transfer.token, index, line.quantity + step, result.page));
      }
    }
  }
  keyboard.row();
}

function addSectionPagination(
  keyboard: InlineKeyboard,
  page: { page: number; totalPages: number },
  section: Exclude<ItemPostalOpenSection, "recipients">
): void {
  if (page.totalPages <= 1) {
    return;
  }

  if (page.page > 0) {
    keyboard.text("◀️", makeItemPostalOpenCallbackData(page.page - 1, section));
  }
  keyboard.text(`${page.page + 1}/${page.totalPages}`, makeItemPostalOpenCallbackData(page.page, section));
  if (page.page + 1 < page.totalPages) {
    keyboard.text("▶️", makeItemPostalOpenCallbackData(page.page + 1, section));
  }
  keyboard.row();
}
