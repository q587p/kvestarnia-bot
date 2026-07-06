import { InlineKeyboard } from "grammy";
import type {
  ItemUpgradeListResult,
  ItemUpgradePreviewResult
} from "../../services/itemUpgradeService";
import {
  makeItemUpgradeAttemptCallbackData,
  makeItemUpgradeAttemptOrderCallbackData,
  makeItemUpgradeMenuCallbackData,
  makeItemUpgradeOrderCallbackData,
  makeItemUpgradePreviewCallbackData
} from "../callbacks/itemUpgradeCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildItemUpgradeMenuKeyboard(result: ItemUpgradeListResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "ready") {
    for (const item of result.items.slice(0, 8)) {
      keyboard.text(`🔧 ${item.name}`, makeItemUpgradePreviewCallbackData({
        method: "npc",
        itemId: item.itemId
      })).row();
    }

    for (const order of result.orders.filter((entry) => entry.status === "ready").slice(0, 3)) {
      keyboard.text(`✅ Спроба +${order.targetLevel}`, makeItemUpgradeAttemptOrderCallbackData(order.token)).row();
    }
  }

  return keyboard.text("⬅️ До корчми", makePlaceCallbackData("hall"));
}

export function buildItemUpgradePreviewKeyboard(result: ItemUpgradePreviewResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "ready") {
    if (result.requiresOrder) {
      if (result.order?.status === "ready") {
        keyboard.text("🔧 Спробувати", makeItemUpgradeAttemptOrderCallbackData(result.order.token)).row();
      } else if (!result.order) {
        keyboard.text("🧾 Замовити", makeItemUpgradeOrderCallbackData(result.item.itemId, result.donor?.itemId)).row();
      }
    } else {
      keyboard.text("🔧 Спробувати", makeItemUpgradeAttemptCallbackData({
        method: result.method,
        itemId: result.item.itemId,
        fromLevel: result.item.enhancementLevel,
        donorItemId: result.donor?.itemId ?? null
      })).row();
    }

    for (const donor of result.donorOptions.filter((option) => option.itemId !== result.donor?.itemId).slice(0, 3)) {
      keyboard.text(`🧩 Донор: ${donor.name}`, makeItemUpgradePreviewCallbackData({
        method: result.method,
        itemId: result.item.itemId,
        donorItemId: donor.itemId
      })).row();
    }

    if (result.donor) {
      keyboard.text("🧩 Без донора", makeItemUpgradePreviewCallbackData({
        method: result.method,
        itemId: result.item.itemId
      })).row();
    }

    if (result.method === "npc") {
      keyboard.text("✨ Іскровий підкрут", makeItemUpgradePreviewCallbackData({
        method: "self",
        itemId: result.item.itemId,
        donorItemId: result.donor?.itemId ?? null
      })).row();
    } else {
      keyboard.text("🧔 До Плюсослава", makeItemUpgradePreviewCallbackData({
        method: "npc",
        itemId: result.item.itemId,
        donorItemId: result.donor?.itemId ?? null
      })).row();
    }
  }

  return keyboard
    .text("↩️ До Чароковальні", makeItemUpgradeMenuCallbackData())
    .row()
    .text("⬅️ До корчми", makePlaceCallbackData("hall"));
}

export function buildItemUpgradeResultKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("↩️ До Чароковальні", makeItemUpgradeMenuCallbackData())
    .row()
    .text("⬅️ До корчми", makePlaceCallbackData("hall"));
}
