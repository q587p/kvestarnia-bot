import { InlineKeyboard } from "grammy";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../callbacks/onboardingCallbackData";
import {
  type BestiaryCallbackSource,
  makeBestiaryListCallbackData,
  makeBestiaryMonsterCallbackData,
  makeBestiaryRandomCallbackData,
  makeBestiarySpecialCallbackData
} from "../callbacks/bestiaryCallbackData";
import { makeLoreMenuCallbackData } from "../callbacks/loreBoardCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import {
  BESTIARY_PAGE_SIZE,
  bestiaryRecordKey,
  clampBestiaryPage,
  getBestiaryListRecords,
  getBestiaryRecordByIndex,
  getBestiaryRecordCount,
  getBestiaryRecordIndex,
  getBestiaryRecordPage,
  type BestiaryListRecord
} from "../presenters/bestiaryPresenter";

export function buildBestiaryListKeyboard(
  page: number,
  source: BestiaryCallbackSource = "quest"
): InlineKeyboard {
  const safePage = clampBestiaryPage(page);
  const start = safePage * BESTIARY_PAGE_SIZE;
  const pageRecords = getBestiaryListRecords().slice(start, start + BESTIARY_PAGE_SIZE);
  const keyboard = new InlineKeyboard();

  for (const record of pageRecords) {
    if (record.type === "monster") {
      keyboard
        .text(`🔎 ${record.monster.name}`, makeBestiaryMonsterCallbackData(record.monster.id, safePage, source))
        .row();
      continue;
    }

    keyboard
      .text(`🛢️ ${record.special.name}`, makeBestiarySpecialCallbackData(record.special.id, safePage, source))
      .row();
  }

  const hasPrevious = safePage > 0;
  const totalPages = Math.max(1, Math.ceil(getBestiaryRecordCount() / BESTIARY_PAGE_SIZE));
  const hasNext = safePage < totalPages - 1;

  if (totalPages > 1) {
    if (hasPrevious) {
      keyboard.text("⏮️ Початок", makeBestiaryListCallbackData(0, source));
      keyboard.text("◀️ Назад", makeBestiaryListCallbackData(safePage - 1, source));
      keyboard.row();
    }

    keyboard.text(`${safePage + 1}/${totalPages}`, makeBestiaryListCallbackData(safePage, source)).row();

    if (hasNext) {
      keyboard.text("Далі ▶️", makeBestiaryListCallbackData(safePage + 1, source));
      keyboard.text("Кінець ⏭️", makeBestiaryListCallbackData(totalPages - 1, source));
      keyboard.row();
    }
  }

  keyboard
    .text("🎲 Випадковий запис", makeBestiaryRandomCallbackData(source))
    .row();

  return addBestiaryReturnNavigation(keyboard, source);
}

export function buildBestiaryMonsterKeyboard(
  page: number,
  record?: BestiaryListRecord,
  source: BestiaryCallbackSource = "quest"
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (record) {
    addBestiaryRecordNavigation(keyboard, record, source);
  }

  keyboard
    .text("🎲 Випадковий запис", makeBestiaryRandomCallbackData(source))
    .row()
    .text("⬅️ До списку", makeBestiaryListCallbackData(clampBestiaryPage(page), source))
    .row();

  return addBestiaryReturnNavigation(keyboard, source);
}

export function assertBestiaryCallbackDataFits(): void {
  for (const record of getBestiaryListRecords()) {
    for (const source of ["quest", "lore"] as const) {
      const data =
        record.type === "monster"
          ? makeBestiaryMonsterCallbackData(record.monster.id, 999, source)
          : makeBestiarySpecialCallbackData(record.special.id, 999, source);

      if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
        const id = record.type === "monster" ? record.monster.id : record.special.id;
        throw new Error(`Bestiary callback is too long for ${id}.`);
      }
    }
  }
}

function addBestiaryRecordNavigation(
  keyboard: InlineKeyboard,
  record: BestiaryListRecord,
  source: BestiaryCallbackSource
): void {
  const index = getBestiaryRecordIndex(record);
  const totalRecords = getBestiaryRecordCount();

  if (index < 0 || totalRecords <= 1) {
    return;
  }

  if (index > 0) {
    const firstRecord = getBestiaryRecordByIndex(0);
    const previousRecord = getBestiaryRecordByIndex(index - 1);

    if (firstRecord) {
      keyboard.text("⏮️ Перший", makeBestiaryRecordCallbackData(firstRecord, 0, source));
    }
    if (previousRecord) {
      keyboard.text("◀️ Попередній", makeBestiaryRecordCallbackData(previousRecord, index - 1, source));
    }
    keyboard.row();
  }

  if (index < totalRecords - 1) {
    const nextRecord = getBestiaryRecordByIndex(index + 1);
    const lastRecord = getBestiaryRecordByIndex(totalRecords - 1);

    if (nextRecord) {
      keyboard.text("Наступний ▶️", makeBestiaryRecordCallbackData(nextRecord, index + 1, source));
    }
    if (lastRecord) {
      keyboard.text("Останній ⏭️", makeBestiaryRecordCallbackData(lastRecord, totalRecords - 1, source));
    }
    keyboard.row();
  }
}

function makeBestiaryRecordCallbackData(
  record: BestiaryListRecord,
  index: number,
  source: BestiaryCallbackSource
): string {
  const page = getBestiaryRecordPage(index);

  return record.type === "monster"
    ? makeBestiaryMonsterCallbackData(bestiaryRecordKey(record), page, source)
    : makeBestiarySpecialCallbackData(bestiaryRecordKey(record), page, source);
}

function addBestiaryReturnNavigation(
  keyboard: InlineKeyboard,
  source: BestiaryCallbackSource
): InlineKeyboard {
  if (source === "lore") {
    return keyboard
      .text("⬅️ До переказів", makeLoreMenuCallbackData())
      .row()
      .text("🪧 До Дошки корчми", makePlaceCallbackData("news-corner"));
  }

  return keyboard.text("🏹 До дошки", makeQuestCallbackData("hunt"));
}
