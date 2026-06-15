import { InlineKeyboard } from "grammy";
import { makeItemDetailCallbackData } from "../callbacks/itemCallbackData";
import {
  makeMantokChestAutoCallbackData,
  makeMantokChestCancelCallbackData,
  makeMantokChestConfirmCallbackData,
  makeMantokChestHelpCallbackData,
  makeMantokChestInventoryCallbackData,
  makeMantokChestOpenCallbackData
} from "../callbacks/mantokChestCallbackData";

export function buildMantokChestOverviewKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Згодувати 5 найдешевших", makeMantokChestAutoCallbackData())
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

export function buildMantokChestResultKeyboard(outputItem?: {
  itemId: string;
  content: { name: string };
} | null): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (outputItem) {
    keyboard.text(`🔎 ${outputItem.content.name}`, makeItemDetailCallbackData(outputItem.itemId)).row();
  }

  return keyboard
    .text("♻️ Ще до Скрині", makeMantokChestOpenCallbackData())
    .row()
    .text("⬅️ До манаток", makeMantokChestInventoryCallbackData());
}
