import { InlineKeyboard } from "grammy";
import type {
  ItemUpgradeListResult,
  ItemUpgradePreviewResult
} from "../../services/itemUpgradeService";
import {
  makeItemUpgradeAttemptCallbackData,
  makeItemUpgradeListCallbackData,
  makeItemUpgradePreviewCallbackData
} from "../callbacks/itemUpgradeCallbackData";
import { makeInventoryCallbackData, makeItemDetailCallbackData } from "../callbacks/itemCallbackData";

const MAX_LIST_BUTTONS = 10;

export function buildItemUpgradeListKeyboard(result: ItemUpgradeListResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "ready") {
    for (const item of result.items.slice(0, MAX_LIST_BUTTONS)) {
      keyboard
        .text(
          `${item.equipped ? "✅" : "✨"} ${item.name}${item.quantity > 1 ? ` (${item.quantity})` : ""}`,
          makeItemUpgradePreviewCallbackData(item.itemId)
        )
        .row();
    }
  }

  return keyboard.text("⬅️ До манаток", makeInventoryCallbackData());
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
          expectedFromLevel: result.item.enhancementLevel,
          expectedQuantity: result.item.quantity,
          expectedPityFailures: result.pityFailures
        })
      )
      .row();

    if (result.method === "npc") {
      keyboard.text("🔮 Самозакалка", makeItemUpgradePreviewCallbackData(
        result.item.itemId,
        "self",
        result.donor?.itemId ?? null
      )).row();
    } else {
      keyboard.text("🛠️ До майстра", makeItemUpgradePreviewCallbackData(
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

    keyboard.text("🔎 До манатки", makeItemDetailCallbackData(result.item.itemId)).row();
  }

  return keyboard
    .text("✨ До Чароковальні", makeItemUpgradeListCallbackData())
    .row()
    .text("⬅️ До манаток", makeInventoryCallbackData());
}

export function buildItemUpgradeResultKeyboard(itemId?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (itemId) {
    keyboard.text("🔎 До манатки", makeItemDetailCallbackData(itemId)).row();
  }

  return keyboard
    .text("✨ До Чароковальні", makeItemUpgradeListCallbackData())
    .row()
    .text("⬅️ До манаток", makeInventoryCallbackData());
}
