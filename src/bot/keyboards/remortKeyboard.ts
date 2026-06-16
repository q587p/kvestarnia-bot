import { InlineKeyboard } from "grammy";
import {
  makeRemortClassCallbackData,
  makeRemortConfirmCallbackData,
  makeRemortItemCallbackData,
  makeRemortPronounCallbackData,
  makeRemortRaceCallbackData
} from "../callbacks/remortCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import {
  getRemortClassOptions,
  getRemortPronounOptions,
  getRemortRaceOptions,
  type RemortViewResult
} from "../../services/remortService";

export function buildRemortKeyboard(result: RemortViewResult): InlineKeyboard {
  if (result.state !== "ready") {
    return new InlineKeyboard().text("⬅️ До дверей", makePlaceCallbackData("front"));
  }

  const token = result.draft.token;
  const keyboard = new InlineKeyboard();

  for (const option of getRemortPronounOptions()) {
    const marker = option.id === result.identity.pronoun ? "✅ " : "";
    keyboard.text(`${marker}${option.label}`, makeRemortPronounCallbackData(token, option.id));
  }

  keyboard.row();

  for (const option of getRemortRaceOptions()) {
    const marker = option.key === result.identity.raceKey ? "✅ " : "";
    keyboard.text(`${marker}${option.label}`, makeRemortRaceCallbackData(token, option.key)).row();
  }

  for (const option of getRemortClassOptions()) {
    const marker = option.key === result.identity.classKey ? "✅ " : "";
    keyboard.text(`${marker}${option.label}`, makeRemortClassCallbackData(token, option.key)).row();
  }

  if (result.eligibleItems.length > 0) {
    result.eligibleItems.slice(0, 8).forEach((item) => {
      const quantity = item.quantity > 1 ? ` ×${item.quantity}` : "";
      keyboard.text(
        `${item.selected ? "✅" : "▫️"} ${item.name}${quantity}`,
        makeRemortItemCallbackData(token, item.itemKey)
      ).row();
    });
  }

  keyboard
    .text("⚠️ Підтвердити реморт", makeRemortConfirmCallbackData(token))
    .row()
    .text("⬅️ До дверей", makePlaceCallbackData("front"));

  return keyboard;
}

export function buildRemortResultKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👤 Персонаж", makeMenuCallbackData("hero"))
    .row()
    .text("🚪 До дверей", makePlaceCallbackData("front"));
}
