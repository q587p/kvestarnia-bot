import { InlineKeyboard } from "grammy";
import type {
  ItemUpgradeListResult,
  ItemUpgradePreviewResult,
  ItemUpgradeUnlockServiceResult
} from "../../services/itemUpgradeService";
import { isMageClassForItemSelfUpgrade } from "../../domain/itemUpgrades";
import {
  makeItemUpgradeAttemptCallbackData,
  makeItemUpgradeListCallbackData,
  makeItemUpgradePagePromptCallbackData,
  makeItemUpgradePreviewCallbackData,
  makeItemUpgradeUnlockCallbackData
} from "../callbacks/itemUpgradeCallbackData";
import { makeItemDetailCallbackData } from "../callbacks/itemCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeTavernCallbackData } from "../callbacks/tavernCallbackData";
import {
  DEFAULT_INVENTORY_SORT,
  getInventoryDateSortTarget,
  getInventoryNameSortTarget,
  presentInventoryDateSortButton,
  presentInventoryNameSortButton,
  type InventorySort
} from "../inventorySort";

const MAX_LIST_BUTTONS = 10;
const EQUIPPED_UPGRADE_ITEM_ICON = "🧥";
const UPGRADE_ITEM_ICON = "✨";

export function buildItemUpgradeListKeyboard(
  result: ItemUpgradeListResult,
  page = 0,
  sort: InventorySort = DEFAULT_INVENTORY_SORT
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "ready") {
    const safePage = clampItemUpgradeListPage(result.items.length, page);
    const totalPages = getItemUpgradeListPageCount(result.items.length);
    const start = safePage * MAX_LIST_BUTTONS;
    const sortedItems = sortItemUpgradeListItems(result.items, sort);

    if (result.items.length > 1) {
      keyboard
        .text(
          presentInventoryDateSortButton(sort),
          makeItemUpgradeListCallbackData(0, getInventoryDateSortTarget(sort))
        )
        .text(
          presentInventoryNameSortButton(sort),
          makeItemUpgradeListCallbackData(0, getInventoryNameSortTarget(sort))
        )
        .row();
    }

    for (const item of sortedItems.slice(start, start + MAX_LIST_BUTTONS)) {
      keyboard
        .text(
          `${item.equipped ? EQUIPPED_UPGRADE_ITEM_ICON : UPGRADE_ITEM_ICON} ${item.name}${item.quantity > 1 ? ` (${item.quantity})` : ""}`,
          makeItemUpgradePreviewCallbackData(item.itemId)
        )
        .row();
    }

    if (totalPages > 1) {
      if (safePage > 0) {
        keyboard.text("◀️ Назад", makeItemUpgradeListCallbackData(safePage - 1, sort));
      }

      keyboard.text(`${safePage + 1}/${totalPages}`, makeItemUpgradePagePromptCallbackData(totalPages, sort));

      if (safePage < totalPages - 1) {
        keyboard.text("Далі ▶️", makeItemUpgradeListCallbackData(safePage + 1, sort));
      }

      keyboard.row();
    }
  }

  if (result.state === "unlock-required") {
    if (result.fieldKitQuantity > 0) {
      keyboard.text("🧰 Віддати аптечку магу", makeItemUpgradeUnlockCallbackData()).row();
    } else {
      keyboard.text("🏹 До Єгеря по аптечку", makeTavernCallbackData("ranger")).row();
    }
  }

  return keyboard.text("⬅️ До задвірку", makePlaceCallbackData("yard"));
}

function getItemUpgradeListPageCount(itemCount: number): number {
  return Math.max(1, Math.ceil(Math.max(0, itemCount) / MAX_LIST_BUTTONS));
}

function clampItemUpgradeListPage(itemCount: number, page: number): number {
  const pageCount = getItemUpgradeListPageCount(itemCount);
  const safePage = Math.max(0, Math.floor(page));

  return Math.min(safePage, pageCount - 1);
}

function sortItemUpgradeListItems(
  items: Extract<ItemUpgradeListResult, { state: "ready" }>["items"],
  sort: InventorySort
): Extract<ItemUpgradeListResult, { state: "ready" }>["items"] {
  if (sort === DEFAULT_INVENTORY_SORT) {
    return [...items];
  }

  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (sort === "date-asc" || sort === "date-desc") {
        const leftTime = left.item.createdAt?.getTime() ?? 0;
        const rightTime = right.item.createdAt?.getTime() ?? 0;
        const dateOrder = sort === "date-asc" ? leftTime - rightTime : rightTime - leftTime;

        return dateOrder || left.index - right.index;
      }

      const nameOrder = left.item.name.localeCompare(right.item.name, "uk");

      return (sort === "name-asc" ? nameOrder : -nameOrder) || left.index - right.index;
    })
    .map(({ item }) => item);
}

export function buildItemUpgradePreviewKeyboard(result: ItemUpgradePreviewResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "ready") {
    keyboard
      .text(
        "✅ Спробувати",
        makeItemUpgradeAttemptCallbackData({
          itemId: result.item.itemId,
          method: result.method,
          donorItemId: result.donor?.itemId ?? null,
          attemptGuard: result.attemptGuard,
          expectedFromLevel: result.item.enhancementLevel,
          expectedQuantity: result.item.quantity,
          expectedPityFailures: result.pityFailures
        })
      )
      .row();

    if (result.method === "npc" && isMageClassForItemSelfUpgrade(result.character.classId)) {
      keyboard.text("🔮 Іскровий підкрут", makeItemUpgradePreviewCallbackData(
        result.item.itemId,
        "self",
        result.donor?.itemId ?? null
      )).row();
    } else if (result.method === "self") {
      keyboard.text("🛠️ За допомогою ельфа-мага", makeItemUpgradePreviewCallbackData(
        result.item.itemId,
        "npc",
        result.donor?.itemId ?? null
      )).row();
    }

    for (const donor of result.donorOptions.slice(0, 3)) {
      keyboard
        .text(
          donor.itemId === result.donor?.itemId ? `✖️ Без донора: ${donor.name}` : `➕ Донор: ${donor.name}`,
          makeItemUpgradePreviewCallbackData(
            result.item.itemId,
            result.method,
            donor.itemId === result.donor?.itemId ? null : donor.itemId
          )
        )
        .row();
    }

    keyboard.text("🔎 До манатки", makeItemDetailCallbackData(
      result.item.itemId,
      0,
      null,
      "default",
      { source: "item-upgrade" }
    )).row();
  }

  return keyboard
    .text("✨ До Чароковальні", makeItemUpgradeListCallbackData())
    .row()
    .text("⬅️ До задвірку", makePlaceCallbackData("yard"));
}

export function buildItemUpgradeResultKeyboard(itemId?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (itemId) {
    keyboard.text("🔎 До манатки", makeItemDetailCallbackData(
      itemId,
      0,
      null,
      "default",
      { source: "item-upgrade" }
    )).row();
  }

  return keyboard
    .text("✨ До Чароковальні", makeItemUpgradeListCallbackData())
    .row()
    .text("⬅️ До задвірку", makePlaceCallbackData("yard"));
}

export function buildItemUpgradeUnlockResultKeyboard(result: ItemUpgradeUnlockServiceResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "missing-field-kit") {
    keyboard.text("🏹 До Єгеря по аптечку", makeTavernCallbackData("ranger")).row();
  }

  if (result.state === "unlocked" || result.state === "already-unlocked") {
    keyboard.text("✨ До Чароковальні", makeItemUpgradeListCallbackData()).row();
  }

  return keyboard.text("⬅️ До задвірку", makePlaceCallbackData("yard"));
}
