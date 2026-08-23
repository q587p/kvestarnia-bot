import { InlineKeyboard } from "grammy";
import { FRIENDLY_CHEST_ICON } from "../itemActionIcons";
import type { MantokChestManualSelectionResult } from "../../services/mantokChestService";
import { makeItemDetailCallbackData } from "../callbacks/itemCallbackData";
import {
  makeMantokChestAddCallbackData,
  makeMantokChestAutoCallbackData,
  makeMantokChestCancelCallbackData,
  makeMantokChestConfirmCallbackData,
  makeMantokChestHelpCallbackData,
  makeMantokChestInventoryCallbackData,
  makeMantokChestManualCallbackData,
  makeMantokChestOpenCallbackData,
  makeMantokChestPageCallbackData,
  makeMantokChestPreviewCallbackData,
  makeMantokChestRemoveCallbackData
} from "../callbacks/mantokChestCallbackData";

export function buildMantokChestOverviewKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Згодувати 5 найдешевших", makeMantokChestAutoCallbackData())
    .row()
    .text("Обрати вручну", makeMantokChestManualCallbackData())
    .row()
    .text("Що вона робить?", makeMantokChestHelpCallbackData())
    .row()
    .text("⬅️ До манаток", makeMantokChestInventoryCallbackData());
}

export function buildMantokChestHelpKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ До Скрині", makeMantokChestOpenCallbackData())
    .row()
    .text("⬅️ До манаток", makeMantokChestInventoryCallbackData());
}

export function buildMantokChestPreviewKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Згодувати", makeMantokChestConfirmCallbackData(token))
    .row()
    .text("⬅️ Не годувати", makeMantokChestCancelCallbackData(token))
    .row()
    .text("⬅️ До манаток", makeMantokChestInventoryCallbackData());
}

export function buildMantokChestManualSelectionKeyboard(
  result: Extract<MantokChestManualSelectionResult, { state: "selection" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const item of result.items) {
    if (item.selectedQuantity > 0) {
      keyboard.text(`➖ ${item.content.name}`, makeMantokChestRemoveCallbackData(result.run.token, result.page, item.index)).row();
    }

    if (result.selectedCount < result.requiredCount && item.selectedQuantity < item.availableQuantity) {
      keyboard.text(`➕ ${item.content.name}`, makeMantokChestAddCallbackData(result.run.token, result.page, item.index)).row();
    }
  }

  if (result.selectedCount === result.requiredCount) {
    keyboard.text("✅ До підтвердження", makeMantokChestPreviewCallbackData(result.run.token)).row();
  }

  if (result.pageCount > 1) {
    if (result.page > 0) {
      keyboard.text("◀️ Назад", makeMantokChestPageCallbackData(result.run.token, result.page - 1));
    }

    keyboard.text(`${result.page + 1}/${result.pageCount}`, makeMantokChestPageCallbackData(result.run.token, result.page));

    if (result.page < result.pageCount - 1) {
      keyboard.text("Вперед ▶️", makeMantokChestPageCallbackData(result.run.token, result.page + 1));
    }

    keyboard.row();
  }

  return keyboard
    .text("⬅️ Не годувати", makeMantokChestCancelCallbackData(result.run.token))
    .row()
    .text("⬅️ До манаток", makeMantokChestInventoryCallbackData());
}

export function buildMantokChestResultKeyboard(outputItem?: {
  itemId: string;
  content: { name: string };
} | null): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (outputItem) {
    keyboard.text(`🔎 ${outputItem.content.name}`, makeItemDetailCallbackData(outputItem.itemId)).row();
  }

  return keyboard
    .text(`${FRIENDLY_CHEST_ICON} Ще до Скрині`, makeMantokChestOpenCallbackData())
    .row()
    .text("⬅️ До манаток", makeMantokChestInventoryCallbackData());
}
