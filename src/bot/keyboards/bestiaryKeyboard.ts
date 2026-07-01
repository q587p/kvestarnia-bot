import { InlineKeyboard } from "grammy";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../callbacks/onboardingCallbackData";
import {
  makeBestiaryListCallbackData,
  makeBestiaryMonsterCallbackData,
  makeBestiarySpecialCallbackData
} from "../callbacks/bestiaryCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import {
  BESTIARY_PAGE_SIZE,
  clampBestiaryPage,
  getBestiaryListRecords,
  getBestiaryRecordCount
} from "../presenters/bestiaryPresenter";

export function buildBestiaryListKeyboard(page: number): InlineKeyboard {
  const safePage = clampBestiaryPage(page);
  const start = safePage * BESTIARY_PAGE_SIZE;
  const pageRecords = getBestiaryListRecords().slice(start, start + BESTIARY_PAGE_SIZE);
  const keyboard = new InlineKeyboard();

  for (const record of pageRecords) {
    if (record.type === "monster") {
      keyboard
        .text(`🔎 ${record.monster.name}`, makeBestiaryMonsterCallbackData(record.monster.id, safePage))
        .row();
      continue;
    }

    keyboard
      .text(`🛢️ ${record.special.name}`, makeBestiarySpecialCallbackData(record.special.id, safePage))
      .row();
  }

  const hasPrevious = safePage > 0;
  const hasNext = start + BESTIARY_PAGE_SIZE < getBestiaryRecordCount();

  if (hasPrevious) {
    keyboard.text("⬅️", makeBestiaryListCallbackData(safePage - 1));
  }

  if (hasNext) {
    keyboard.text("➡️", makeBestiaryListCallbackData(safePage + 1));
  }

  if (hasPrevious || hasNext) {
    keyboard.row();
  }

  return keyboard.text("🏹 До дошки", makeQuestCallbackData("hunt"));
}

export function buildBestiaryMonsterKeyboard(page: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("⬅️ До списку", makeBestiaryListCallbackData(clampBestiaryPage(page)))
    .row()
    .text("🏹 До дошки", makeQuestCallbackData("hunt"));
}

export function assertBestiaryCallbackDataFits(): void {
  for (const record of getBestiaryListRecords()) {
    const data =
      record.type === "monster"
        ? makeBestiaryMonsterCallbackData(record.monster.id, 999)
        : makeBestiarySpecialCallbackData(record.special.id, 999);

    if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
      const id = record.type === "monster" ? record.monster.id : record.special.id;
      throw new Error(`Bestiary callback is too long for ${id}.`);
    }
  }
}
