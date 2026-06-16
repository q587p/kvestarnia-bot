import { InlineKeyboard } from "grammy";
import {
  makeLevelBarterAutoCallbackData,
  makeLevelBarterConfirmCallbackData
} from "../callbacks/levelBarterCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import type { LevelBarterPreviewResult } from "../../services/levelBarterService";

export function buildLevelBarterOfferKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🧮 Автопідібрати манатки й золото", makeLevelBarterAutoCallbackData())
    .row()
    .text("↩️ До дверей", makePlaceCallbackData("front"));
}

export function buildLevelBarterPreviewKeyboard(result: LevelBarterPreviewResult): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (result.state === "preview") {
    keyboard.text("✅ Міняю на рівень", makeLevelBarterConfirmCallbackData(result.offer.token)).row();
    keyboard.text("🔁 Перерахувати", makeLevelBarterAutoCallbackData()).row();
  }

  return keyboard.text("↩️ До дверей", makePlaceCallbackData("front"));
}

export function buildLevelBarterResultKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👤 Персонаж", makeMenuCallbackData("hero"))
    .row()
    .text("↩️ До дверей", makePlaceCallbackData("front"));
}
