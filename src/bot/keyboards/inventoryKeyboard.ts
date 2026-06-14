import { InlineKeyboard } from "grammy";
import {
  makeEquipItemCallbackData,
  makeEquipmentCallbackData,
  makeInventoryCallbackData,
  makeItemDetailCallbackData,
  makeUnequipSlotCallbackData
} from "../callbacks/itemCallbackData";
import type { InventoryItemDetailResult, InventoryResult } from "../../services/inventoryService";
import type { EquipmentResult, EquipmentSlot } from "../../services/equipmentService";
import { isEquippableItem } from "../../services/equipmentService";
import {
  clampInventoryPage,
  getInventoryPageItems,
  getInventoryTotalPages
} from "../presenters/inventoryPresenter";

export function buildInventoryKeyboard(result: InventoryResult, page = 0): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "no-character") {
    return keyboard;
  }

  keyboard.text("🛡️ Спорядження", makeEquipmentCallbackData());

  if (result.state !== "found") {
    return keyboard;
  }

  const safePage = clampInventoryPage(result, page);
  const totalPages = getInventoryTotalPages(result);

  for (const item of getInventoryPageItems(result, safePage)) {
    keyboard.row().text(`🔎 ${item.content.name}`, makeItemDetailCallbackData(item.itemId, safePage));
  }

  if (totalPages > 1) {
    keyboard.row();

    if (safePage > 0) {
      keyboard.text("◀️ Назад", makeInventoryCallbackData(safePage - 1));
    }

    keyboard.text(`${safePage + 1}/${totalPages}`, makeInventoryCallbackData(safePage));

    if (safePage < totalPages - 1) {
      keyboard.text("Далі ▶️", makeInventoryCallbackData(safePage + 1));
    }
  }

  return keyboard;
}

export function buildItemDetailKeyboard(
  result: InventoryItemDetailResult,
  equippedSlot: EquipmentSlot | null = null,
  page = 0
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "no-character") {
    return keyboard;
  }

  if (result.state === "found" && isEquippableItem(result.item.content)) {
    if (equippedSlot) {
      keyboard.text("Зняти", makeUnequipSlotCallbackData(equippedSlot)).row();
    } else {
      keyboard.text("🧥 Екіпірувати", makeEquipItemCallbackData(result.item.itemId)).row();
    }
  }

  return keyboard
    .text("⬅️ До манаток", makeInventoryCallbackData(page))
    .row()
    .text("🛡️ Спорядження", makeEquipmentCallbackData());
}

export function buildEquipmentKeyboard(result: EquipmentResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "no-character") {
    return keyboard;
  }

  if (result.state === "ready") {
    for (const slot of result.slots) {
      if (slot.item) {
        keyboard.text(presentUnequipSlotButtonLabel(slot.slot), makeUnequipSlotCallbackData(slot.slot)).row();
      }
    }
  }

  return keyboard.text("⬅️ До манаток", makeInventoryCallbackData());
}

function presentUnequipSlotButtonLabel(slot: EquipmentSlot): string {
  const labels: Record<EquipmentSlot, string> = {
    weapon: "Зняти зброю",
    head: "Зняти шолом",
    chest: "Зняти обладунок",
    legs: "Зняти поножі",
    accessory: "Зняти аксесуар"
  };

  return labels[slot];
}
