import { InlineKeyboard } from "grammy";
import {
  makeLevelBarterAutoCallbackData,
  makeLevelBarterConfirmCallbackData
} from "../callbacks/levelBarterCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makePlaceCallbackData, type PlaceCallback } from "../callbacks/placeCallbackData";
import type { MunchkinLocation } from "../../domain/levelBarter/munchkinSchedule";
import type { LevelBarterPreviewResult } from "../../services/levelBarterService";

export interface LevelBarterReturnOptions {
  munchkinLocation?: MunchkinLocation;
}

interface LevelBarterReturnTarget {
  label: string;
  place: PlaceCallback;
}

export function buildLevelBarterOfferKeyboard(options: LevelBarterReturnOptions = {}): InlineKeyboard {
  const returnTarget = getLevelBarterReturnTarget(options);

  return new InlineKeyboard()
    .text("🧮 Автопідібрати манатки й золото", makeLevelBarterAutoCallbackData())
    .row()
    .text(returnTarget.label, makePlaceCallbackData(returnTarget.place));
}

export function buildLevelBarterPreviewKeyboard(
  result: LevelBarterPreviewResult,
  options: LevelBarterReturnOptions = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const returnTarget = getLevelBarterReturnTarget(options);

  if (result.state === "preview") {
    keyboard.text("✅ Міняю на рівень", makeLevelBarterConfirmCallbackData(result.offer.token)).row();
    keyboard.text("🔁 Перерахувати", makeLevelBarterAutoCallbackData()).row();
  }

  return keyboard.text(returnTarget.label, makePlaceCallbackData(returnTarget.place));
}

export function buildLevelBarterResultKeyboard(options: LevelBarterReturnOptions = {}): InlineKeyboard {
  const returnTarget = getLevelBarterReturnTarget(options);

  return new InlineKeyboard()
    .text("👤 Персонаж", makeMenuCallbackData("hero"))
    .row()
    .text(returnTarget.label, makePlaceCallbackData(returnTarget.place));
}

function getLevelBarterReturnTarget(options: LevelBarterReturnOptions): LevelBarterReturnTarget {
  if (options.munchkinLocation === "nyz-descent") {
    return { label: "↩️ До Низу", place: "deep" };
  }

  return { label: "↩️ До дверей", place: "front" };
}
