import { InlineKeyboard } from "grammy";
import {
  makeEquipmentCallbackData,
  makeInventoryCallbackData,
  makeItemDetailCallbackData
} from "../callbacks/itemCallbackData";
import type { InventoryResult } from "../../services/inventoryService";

export function buildInventoryKeyboard(result: InventoryResult): InlineKeyboard {
  const keyboard = new InlineKeyboard().text("🧥 Спорядження", makeEquipmentCallbackData());

  if (result.state !== "found") {
    return keyboard;
  }

  for (const item of result.items) {
    keyboard.row().text(`🔎 ${item.content.name}`, makeItemDetailCallbackData(item.itemId));
  }

  return keyboard;
}

export function buildItemDetailKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ До манаток", makeInventoryCallbackData())
    .row()
    .text("🧥 Спорядження", makeEquipmentCallbackData());
}

export function buildEquipmentKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ До манаток", makeInventoryCallbackData());
}
