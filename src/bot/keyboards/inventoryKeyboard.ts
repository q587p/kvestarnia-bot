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

export function buildInventoryKeyboard(result: InventoryResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "no-character") {
    return keyboard;
  }

  keyboard.text("🛡️ Спорядження", makeEquipmentCallbackData());

  if (result.state !== "found") {
    return keyboard;
  }

  for (const item of result.items) {
    keyboard.row().text(`🔎 ${item.content.name}`, makeItemDetailCallbackData(item.itemId));
  }

  return keyboard;
}

export function buildItemDetailKeyboard(
  result: InventoryItemDetailResult,
  equippedSlot: EquipmentSlot | null = null
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
    .text("⬅️ До манаток", makeInventoryCallbackData())
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
        keyboard.text(`Зняти: ${presentSlotButtonLabel(slot.slot)}`, makeUnequipSlotCallbackData(slot.slot)).row();
      }
    }
  }

  return keyboard.text("⬅️ До манаток", makeInventoryCallbackData());
}

function presentSlotButtonLabel(slot: EquipmentSlot): string {
  const labels: Record<EquipmentSlot, string> = {
    weapon: "зброя",
    head: "голова",
    chest: "тулуб",
    legs: "ноги",
    accessory: "аксесуар"
  };

  return labels[slot];
}
