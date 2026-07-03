import { InlineKeyboard } from "grammy";
import type { YegerQuestLookupResult, YegerQuestTurnInResult } from "../../services/yegerQuestService";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makeItemDetailCallbackData } from "../callbacks/itemCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  makeYegerBandagesCallbackData,
  makeYegerBuyBandageCallbackData,
  makeYegerCancelBandagePurchaseCallbackData,
  makeYegerConfirmBandagePurchaseCallbackData,
  makeYegerFreeBandageCallbackData,
  makeYegerHelpCallbackData,
  makeYegerOpenCallbackData,
  makeYegerOutsideCallbackData,
  makeYegerQuestCallbackData,
  makeYegerStartCallbackData,
  makeYegerTrackCallbackData,
  makeYegerTurnInCallbackData
} from "../callbacks/yegerCallbackData";
import { presentYegerQuestTitle } from "../presenters/yegerQuestTitle";

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
    return baseYegerKeyboard()
      .text("🚪 Надвір", makeYegerOutsideCallbackData())
      .row()
      .text("📖 Кого шукати?", makeYegerHelpCallbackData())
      .row()
      .text("🍺 До зали", makePlaceCallbackData("hall"));
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

export function buildYegerHuntKeyboard(
  result: Extract<YegerQuestLookupResult, { state: "in-progress" }>
): InlineKeyboard {
  return inProgressKeyboard(result.tracking.state);
}

export function buildYegerCornerKeyboard(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state !== "level-locked" && result.state !== "completed") {
    keyboard.text(`🏹 ${presentYegerQuestTitle(result.progress)}`, makeYegerQuestCallbackData()).row();
  }

  if (isBaseYegerQuestCompleted(result)) {
    keyboard.text("🩹 Бинти", makeYegerBandagesCallbackData()).row();
  }

  return keyboard
    .text("📖 Бестіарій", makeBestiaryListCallbackData(0))
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

export function buildYegerBandagesKeyboard(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (isBaseYegerQuestCompleted(result)) {
    keyboard.text("🩹 1 бинт", makeYegerBuyBandageCallbackData(1));
    keyboard.text("🩹 5 бинтів", makeYegerBuyBandageCallbackData(5)).row();
    keyboard.text("🩹 17 бинтів", makeYegerBuyBandageCallbackData(17));
    keyboard.text("🩹 93 бинти", makeYegerBuyBandageCallbackData(93)).row();
    if (result.character.classId === "class.ranger") {
      if (result.rangerBandage?.state === "available") {
        keyboard.text("🧰 5 єгерських бинтів", makeYegerFreeBandageCallbackData("bandage")).row();
      }
      if (result.rangerDenseBandage?.state === "available") {
        keyboard.text("🧵 Єгерський щільний", makeYegerFreeBandageCallbackData("dense-bandage")).row();
      }
      if (result.rangerFieldKit?.state === "available") {
        keyboard.text("🧰 Єгерська аптечка", makeYegerFreeBandageCallbackData("field-kit")).row();
      }
    }
  }

  return keyboard
    .text("⬅️ До Єгеря", makeYegerOpenCallbackData())
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

function isBaseYegerQuestCompleted(
  result: Exclude<YegerQuestLookupResult, { state: "no-character" }>
): boolean {
  return result.state === "completed" || (
    result.state !== "level-locked" && result.progress.stageId === "second"
  );
}

export function buildYegerBandagePurchaseKeyboard(
  token: string,
  options: { confirmLabel?: string } = {}
): InlineKeyboard {
  return new InlineKeyboard()
    .text(options.confirmLabel ?? "✅ Купити", makeYegerConfirmBandagePurchaseCallbackData(token))
    .text("✖️ Скасувати", makeYegerCancelBandagePurchaseCallbackData(token))
    .row()
    .text("⬅️ До Єгеря", makeYegerOpenCallbackData());
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
      : "👣 Взяти слід";

  return baseYegerKeyboard()
    .text(trackButtonText, makeYegerTrackCallbackData())
    .row()
    .text("⬅️ Надвір", makePlaceCallbackData("front"));
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
