import { InlineKeyboard } from "grammy";
import {
  makeEquipItemCallbackData,
  makeEquipmentCallbackData,
  makeInventoryCallbackData,
  makeItemDetailCallbackData,
  makeUnequipSlotCallbackData
} from "../callbacks/itemCallbackData";
import {
  makeItemUseCancelCallbackData,
  makeItemUseConfirmCallbackData,
  makeItemUsePreviewCallbackData,
  makeItemUseRestoreToFullCallbackData
} from "../callbacks/itemUseCallbackData";
import { makeFightItemUseCallbackData } from "../callbacks/fightCallbackData";
import { makePartyBossItemUseCallbackData } from "../callbacks/partySessionCallbackData";
import { makeMantokChestOpenCallbackData } from "../callbacks/mantokChestCallbackData";
import type { InventoryItemDetailResult, InventoryResult } from "../../services/inventoryService";
import type { EquipmentResult, EquipmentSlot } from "../../services/equipmentService";
import { isEquippableItem } from "../../services/equipmentService";
import {
  clampInventoryPage,
  getInventoryPageItems,
  getInventoryTotalPages,
  type InventorySlotFilter
} from "../presenters/inventoryPresenter";

export const RESTORE_TO_FULL_BUTTON_LABEL = "🧻 До відновлення";

export function buildInventoryKeyboard(
  result: InventoryResult,
  page = 0,
  slotFilter: InventorySlotFilter = null
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "no-character") {
    return keyboard;
  }

  keyboard.text("🛡️ Спорядження", makeEquipmentCallbackData());
  if (slotFilter) {
    keyboard.text("🎒 Усі манатки", makeInventoryCallbackData()).row();
  } else {
    keyboard.text("♻️ До Дружньої Скрині", makeMantokChestOpenCallbackData()).row();
  }

  if (result.state !== "found") {
    return keyboard;
  }

  const safePage = clampInventoryPage(result, page, slotFilter);
  const totalPages = getInventoryTotalPages(result, slotFilter);

  for (const item of getInventoryPageItems(result, safePage, slotFilter)) {
    keyboard
      .row()
      .text(`🔎 ${item.content.name}`, makeItemDetailCallbackData(item.itemId, safePage, slotFilter));
  }

  if (totalPages > 1) {
    keyboard.row();

    if (safePage > 0) {
      keyboard.text("◀️ Назад", makeInventoryCallbackData(safePage - 1, slotFilter));
    }

    keyboard.text(`${safePage + 1}/${totalPages}`, makeInventoryCallbackData(safePage, slotFilter));

    if (safePage < totalPages - 1) {
      keyboard.text("Далі ▶️", makeInventoryCallbackData(safePage + 1, slotFilter));
    }
  }

  return keyboard;
}

export function buildItemDetailKeyboard(
  result: InventoryItemDetailResult,
  equippedSlot: EquipmentSlot | null = null,
  page = 0,
  slotFilter: InventorySlotFilter = null,
  options: {
    canUse?: boolean;
    combatUse?:
      | {
          kind: "fight";
          sessionId: string;
          turn: number;
          itemKey: string;
        }
      | {
          kind: "party-boss";
          token: string;
          turn: number;
          itemKey: string;
        };
  } = {}
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

  if (result.state === "found" && options.canUse === true) {
    if (options.combatUse) {
      keyboard.text(
        "⚔️ Використати у бою",
        options.combatUse.kind === "fight"
          ? makeFightItemUseCallbackData(options.combatUse)
          : makePartyBossItemUseCallbackData(options.combatUse)
      ).row();
    } else {
      keyboard.text("🩹 Використати", makeItemUsePreviewCallbackData(result.item.itemId)).row();
    }
  }

  return keyboard
    .text(
      slotFilter ? "⬅️ До списку слота" : "⬅️ До манаток",
      makeInventoryCallbackData(page, slotFilter)
    )
    .row()
    .text("🛡️ Спорядження", makeEquipmentCallbackData());
}

export function buildItemUsePreviewKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Використати", makeItemUseConfirmCallbackData(token))
    .text("✖️ Скасувати", makeItemUseCancelCallbackData(token))
    .row()
    .text("⬅️ До манаток", makeInventoryCallbackData());
}

export function buildItemUseResultKeyboard(
  options: { repeatItemId?: string | null; restoreToFullItemId?: string | null } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (options.repeatItemId) {
    keyboard.text("🩹 Ще один", makeItemUsePreviewCallbackData(options.repeatItemId));
    if (options.restoreToFullItemId) {
      keyboard.text(RESTORE_TO_FULL_BUTTON_LABEL, makeItemUseRestoreToFullCallbackData(options.restoreToFullItemId));
    }
    keyboard.row();
  }

  return keyboard
    .text("⬅️ До манаток", makeInventoryCallbackData())
    .row()
    .text("🛡️ Спорядження", makeEquipmentCallbackData());
}

export function buildEquipItemResultKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
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
    keyboard.text("🗡️ Показати зброю", makeInventoryCallbackData(0, "weapon")).row();
    keyboard.text("🧥 Показати тулуб", makeInventoryCallbackData(0, "chest")).row();
    keyboard.text("💍 Показати аксесуари", makeInventoryCallbackData(0, "accessory")).row();

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
