import { InlineKeyboard } from "grammy";
import type { YegerQuestLookupResult, YegerQuestTurnInResult } from "../../services/yegerQuestService";
import { makeBestiaryListCallbackData } from "../callbacks/bestiaryCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  makeYegerHelpCallbackData,
  makeYegerOpenCallbackData,
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
    return inProgressKeyboard();
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
    return new InlineKeyboard()
      .text("📖 Бестіарій", makeBestiaryListCallbackData(0))
      .row()
      .text("⬅️ До столу", makePlaceCallbackData("quest-table"));
  }

  return new InlineKeyboard().text("⬅️ До столу", makePlaceCallbackData("quest-table"));
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

  return new InlineKeyboard()
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

function inProgressKeyboard(): InlineKeyboard {
  return baseYegerKeyboard()
    .text("👣 Вийти на слід", makeYegerTrackCallbackData())
    .row()
    .text("📖 Кого шукати?", makeYegerHelpCallbackData())
    .row()
    .text("🍺 До зали", makePlaceCallbackData("hall"));
}

function baseYegerKeyboard(): InlineKeyboard {
  return new InlineKeyboard();
}
