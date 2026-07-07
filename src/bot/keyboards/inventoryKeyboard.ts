import { InlineKeyboard } from "grammy";
import {
  makeEquipItemCallbackData,
  makeEquipmentCallbackData,
  makeInventoryCallbackData,
  makeInventoryPagePromptCallbackData,
  makeItemDetailCallbackData,
  makeUnequipSlotCallbackData
} from "../callbacks/itemCallbackData";
import {
  makeItemCraftConfirmCallbackData,
  makeItemCraftPreviewCallbackData
} from "../callbacks/itemCraftCallbackData";
import {
  makeItemUseCancelCallbackData,
  makeItemUseConfirmCallbackData,
  makeItemUsePreviewCallbackData,
  makeItemUseRestoreToFullCallbackData
} from "../callbacks/itemUseCallbackData";
import { makeFightItemUseCallbackData } from "../callbacks/fightCallbackData";
import { makePartyBossItemUseCallbackData } from "../callbacks/partySessionCallbackData";
import { makeMantokChestOpenCallbackData } from "../callbacks/mantokChestCallbackData";
import {
  makeItemUpgradeListCallbackData,
  makeItemUpgradePreviewCallbackData
} from "../callbacks/itemUpgradeCallbackData";
import { isItemUpgradeable } from "../../domain/itemUpgrades";
import type { InventoryItemDetailResult, InventoryResult } from "../../services/inventoryService";
import type {
  EquipmentResult,
  EquipmentSlot,
  EquipItemResult,
  ItemEquipPreviewResult
} from "../../services/equipmentService";
import type { ItemCraftOption } from "../../services/itemCraftService";
import { isEquippableItem } from "../../services/equipmentService";
import {
  ONE_USE_INVENTORY_FILTER,
  ONE_USE_INVENTORY_FILTER_ICON,
  isInventoryEquipmentSlotFilter,
  isOneUseInventoryFilter,
  type InventoryFilter
} from "../inventoryFilter";
import {
  DEFAULT_INVENTORY_SORT,
  getInventoryDateSortTarget,
  getInventoryNameSortTarget,
  presentInventoryDateSortButton,
  presentInventoryNameSortButton,
  type InventorySort
} from "../inventorySort";
import {
  clampInventoryPage,
  getFilteredInventoryItems,
  getInventoryPageItems,
  getInventoryTotalPages,
  type InventoryPresenterOptions
} from "../presenters/inventoryPresenter";

export const RESTORE_TO_FULL_BUTTON_LABEL = "🧻 До відновлення";

export function buildInventoryKeyboard(
  result: InventoryResult,
  page = 0,
  filter: InventoryFilter = null,
  options: InventoryPresenterOptions = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const sort = options.sort ?? DEFAULT_INVENTORY_SORT;
  const inventoryOptions = { ...options, sort };

  if (result.state === "no-character") {
    return keyboard;
  }

  keyboard.text("🛡️ Спорядження", makeEquipmentCallbackData());
  if (filter) {
    keyboard.text("🎒 Усі манатки", makeInventoryCallbackData(0, null, sort)).row();
  } else {
    keyboard
      .text(`${ONE_USE_INVENTORY_FILTER_ICON} Разові`, makeInventoryCallbackData(0, ONE_USE_INVENTORY_FILTER, sort))
      .row();
    keyboard.text("✨ Чароковальня", makeItemUpgradeListCallbackData()).row();
    keyboard.text("♻️ До Дружньої Скрині", makeMantokChestOpenCallbackData()).row();
  }

  if (result.state !== "found") {
    return keyboard;
  }

  const filteredCount = getFilteredInventoryItems(result, filter, inventoryOptions).length;

  if (filteredCount > 1) {
    keyboard
      .text(
        presentInventoryDateSortButton(sort),
        makeInventoryCallbackData(0, filter, getInventoryDateSortTarget(sort))
      )
      .text(
        presentInventoryNameSortButton(sort),
        makeInventoryCallbackData(0, filter, getInventoryNameSortTarget(sort))
      )
      .row();
  }

  const safePage = clampInventoryPage(result, page, filter, inventoryOptions);
  const totalPages = getInventoryTotalPages(result, filter, inventoryOptions);

  const pageItems = getInventoryPageItems(result, safePage, filter, inventoryOptions);

  for (const [index, item] of pageItems.entries()) {
    const isEquipped =
      options.equippedItemIds?.has(item.itemId) || options.currentSlotItem?.itemId === item.itemId;
    const itemIcon = isEquipped ? "✅" : "🔎";

    keyboard
      .text(
        `${itemIcon} ${presentInventoryItemButtonLabel(item.content.name, item.quantity)}`,
        makeItemDetailCallbackData(item.itemId, safePage, filter, sort)
      );

    if (index < pageItems.length - 1 || totalPages > 1) {
      keyboard.row();
    }
  }

  if (totalPages > 1) {
    if (safePage > 0) {
      keyboard.text("◀️ Назад", makeInventoryCallbackData(safePage - 1, filter, sort));
    }

    keyboard.text(`${safePage + 1}/${totalPages}`, makeInventoryPagePromptCallbackData(totalPages, filter, sort));

    if (safePage < totalPages - 1) {
      keyboard.text("Далі ▶️", makeInventoryCallbackData(safePage + 1, filter, sort));
    }
  }

  return keyboard;
}

function presentInventoryItemButtonLabel(name: string, quantity: number): string {
  return quantity > 1 ? `${name} (${quantity})` : name;
}

export function buildItemDetailKeyboard(
  result: InventoryItemDetailResult,
  equippedSlot: EquipmentSlot | null = null,
  page = 0,
  filter: InventoryFilter = null,
  options: {
    canUse?: boolean;
    sort?: InventorySort;
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
    craftOptions?: ItemCraftOption[];
    equipPreview?: ItemEquipPreviewResult | null;
  } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "no-character") {
    return keyboard;
  }

  if (result.state === "found" && isEquippableItem(result.item.content)) {
    const targetSlot = isInventoryEquipmentSlotFilter(filter) ? filter : null;

    if (equippedSlot && (!targetSlot || equippedSlot === targetSlot)) {
      keyboard.text("Зняти", makeUnequipSlotCallbackData(equippedSlot)).row();
    } else {
      const canEquipTarget =
        !targetSlot ||
        options.equipPreview === undefined ||
        (
          (options.equipPreview?.state === "can-equip" ||
            options.equipPreview?.state === "twohand-confirm-required") &&
          options.equipPreview.slot === targetSlot
        );

      if (canEquipTarget) {
        const targetLabel = targetSlot === "offhand" ? " в другу руку" : "";

        keyboard.text(
          `🧥 Екіпірувати${targetLabel}`,
          makeEquipItemCallbackData(result.item.itemId, targetSlot)
        ).row();
      }
    }
  }

  if (result.state === "found" && options.craftOptions && options.craftOptions.length > 0) {
    for (const option of options.craftOptions) {
      keyboard.text(option.recipe.buttonLabel, makeItemCraftPreviewCallbackData(option.recipe.code)).row();
    }
  }

  if (result.state === "found" && isItemUpgradeable(result.item.content)) {
    keyboard.text("✨ Підсилити", makeItemUpgradePreviewCallbackData(result.item.itemId)).row();
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
      presentInventoryBackButtonLabel(filter),
      makeInventoryCallbackData(page, filter, options.sort ?? DEFAULT_INVENTORY_SORT)
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
  options: {
    repeatItemId?: string | null;
    restoreToFullItemId?: string | null;
    detailItemId?: string | null;
  } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (options.repeatItemId) {
    keyboard.text("🩹 Ще один", makeItemUsePreviewCallbackData(options.repeatItemId));
    if (options.restoreToFullItemId) {
      keyboard.text(RESTORE_TO_FULL_BUTTON_LABEL, makeItemUseRestoreToFullCallbackData(options.restoreToFullItemId));
    }
    keyboard.row();
  }

  if (options.detailItemId) {
    keyboard
      .text(
        presentItemUseDetailButtonLabel(options.detailItemId),
        makeItemDetailCallbackData(options.detailItemId)
      )
      .row();
  }

  return keyboard
    .text("⬅️ До манаток", makeInventoryCallbackData())
    .row()
    .text("🛡️ Спорядження", makeEquipmentCallbackData());
}

function presentItemUseDetailButtonLabel(itemId: string): string {
  if (itemId === "item.field-kit") {
    return "🔎 До аптечки";
  }

  if (itemId === "item.responsible-panic-bandage" || itemId === "item.dense-bandage") {
    return "🔎 До бинта";
  }

  return "🔎 До манатки";
}

function presentInventoryBackButtonLabel(filter: InventoryFilter): string {
  if (isInventoryEquipmentSlotFilter(filter)) {
    return "⬅️ До списку слота";
  }

  if (isOneUseInventoryFilter(filter)) {
    return "⬅️ До разових";
  }

  return "⬅️ До манаток";
}

export function buildItemCraftPreviewKeyboard(recipeCode: ItemCraftOption["recipe"]["code"]): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Створити", makeItemCraftConfirmCallbackData(recipeCode))
    .text("✖️ Скасувати", makeItemDetailCallbackData("item.responsible-panic-bandage"))
    .row()
    .text("⬅️ До манаток", makeInventoryCallbackData());
}

export function buildItemCraftResultKeyboard(options: { repeatRecipeCode?: ItemCraftOption["recipe"]["code"] } = {}): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (options.repeatRecipeCode) {
    keyboard.text("✅ Створити ще", makeItemCraftConfirmCallbackData(options.repeatRecipeCode)).row();
  }

  return keyboard
    .text("🔎 До бинта", makeItemDetailCallbackData("item.responsible-panic-bandage"))
    .row()
    .text("⬅️ До манаток", makeInventoryCallbackData());
}

export function buildEquipItemResultKeyboard(result?: EquipItemResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result?.state === "twohand-confirm-required") {
    keyboard
      .text(
        "✅ Так, звільнити руку",
        makeEquipItemCallbackData(result.item.itemId, result.slot, { confirmTwohand: true })
      )
      .row();
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
    const equippedSlots = new Set(result.slots.filter((slot) => slot.item).map((slot) => slot.slot));

    for (const slot of equipmentSlotButtons) {
      keyboard.text(slot.showLabel, makeInventoryCallbackData(0, slot.slot));

      if (equippedSlots.has(slot.slot)) {
        keyboard.text(presentUnequipSlotButtonLabel(slot.slot), makeUnequipSlotCallbackData(slot.slot));
      }

      keyboard.row();
    }
  }

  return keyboard.text("⬅️ До манаток", makeInventoryCallbackData());
}

const equipmentSlotButtons: ReadonlyArray<{ slot: EquipmentSlot; showLabel: string }> = [
  { slot: "head", showLabel: "🎩 Показати голову" },
  { slot: "chest", showLabel: "🧥 Показати тулуб" },
  { slot: "legs", showLabel: "🥾 Показати ноги" },
  { slot: "accessory", showLabel: "💍 Показати аксесуари" },
  { slot: "tool", showLabel: "🧰 Показати інструменти" },
  { slot: "weapon", showLabel: "🗡️ Показати основну руку" },
  { slot: "offhand", showLabel: "✋ Показати другу руку" }
];

function presentUnequipSlotButtonLabel(slot: EquipmentSlot): string {
  const labels: Record<EquipmentSlot, string> = {
    weapon: "Зняти з основної руки",
    offhand: "Зняти з другої руки",
    head: "Зняти шолом",
    chest: "Зняти обладунок",
    legs: "Зняти поножі",
    accessory: "Зняти аксесуар",
    tool: "Зняти інструмент"
  };

  return labels[slot];
}
