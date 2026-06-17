import { InlineKeyboard } from "grammy";
import type { YegerQuestLookupResult, YegerQuestTurnInResult } from "../../services/yegerQuestService";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makeItemDetailCallbackData } from "../callbacks/itemCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  makeYegerHelpCallbackData,
  makeYegerOpenCallbackData,
  makeYegerQuestCallbackData,
  makeYegerStartCallbackData,
  makeYegerTrackCallbackData,
  makeYegerTurnInCallbackData
} from "../callbacks/yegerCallbackData";

export function buildYegerKeyboard(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): InlineKeyboard {
  if (result.state === "offered") {
    return baseYegerKeyboard()
      .text("🏹 Взяти справу", makeYegerStartCallbackData())
      .row()
      .text("📖 Кого шукати?", makeYegerHelpCallbackData())
      .row()
      .text("🍺 До зали", makePlaceCallbackData("hall"));
  }

  if (result.state === "in-progress") {
    return inProgressKeyboard(result.tracking.state);
  }

  if (result.state === "turn-in-ready") {
    return baseYegerKeyboard()
      .text("🏹 Здати Єгерю", makeYegerTurnInCallbackData())
      .row()
      .text("📖 Кого шукати?", makeYegerHelpCallbackData())
      .row()
      .text("🍺 До зали", makePlaceCallbackData("hall"));
  }

  if (result.state === "completed") {
    const keyboard = new InlineKeyboard();

    addRewardItemButton(keyboard, result.reward);

    return keyboard
      .text("📖 Бестіарій", makeBestiaryListCallbackData(0))
      .row()
      .text("📋 До справ", makePlaceCallbackData("quest-table"));
  }

  return new InlineKeyboard().text("📋 До справ", makePlaceCallbackData("quest-table"));
}

export function buildYegerCornerKeyboard(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state !== "level-locked") {
    keyboard.text("🏹 Неспокійні справи", makeYegerQuestCallbackData()).row();
  }

  return keyboard
    .text("📖 Бестіарій", makeBestiaryListCallbackData(0))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildYegerTurnInKeyboard(
  result: Exclude<YegerQuestTurnInResult, { state: "no-character" }>
): InlineKeyboard {
  if (result.state === "not-started") {
    return new InlineKeyboard()
      .text("🏹 Взяти справу", makeYegerStartCallbackData())
      .row()
      .text("⬅️ До Єгеря", makeYegerOpenCallbackData());
  }

  if (result.state === "not-ready") {
    return inProgressKeyboard();
  }

  const keyboard = new InlineKeyboard();

  if (result.state === "completed" || result.state === "already-completed") {
    addRewardItemButton(keyboard, result.reward);
  }

  return keyboard
    .text("⬅️ До Єгеря", makeYegerOpenCallbackData())
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildYegerHelpKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ До Єгеря", makeYegerOpenCallbackData())
    .row()
    .text("📖 Бестіарій", makeBestiaryListCallbackData(0))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

function inProgressKeyboard(
  trackingState: "none" | "tracking-pending" | "tracking-ready" = "none"
): InlineKeyboard {
  const trackButtonText = trackingState === "tracking-ready"
    ? "🔎 Перевірити слід"
    : trackingState === "tracking-pending"
      ? "⏳ Чекати слід"
      : "👣 Вийти на слід";

  return baseYegerKeyboard()
    .text(trackButtonText, makeYegerTrackCallbackData())
    .row()
    .text("📖 Кого шукати?", makeYegerHelpCallbackData())
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

function baseYegerKeyboard(): InlineKeyboard {
  return new InlineKeyboard();
}

function addRewardItemButton(
  keyboard: InlineKeyboard,
  reward: { itemGrants: Array<{ itemId: string; name: string }> }
): InlineKeyboard {
  const item = reward.itemGrants[0];

  if (!item) {
    return keyboard;
  }

  return keyboard.text(`🔎 ${item.name}`, makeItemDetailCallbackData(item.itemId)).row();
}
