import { InlineKeyboard } from "grammy";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../callbacks/onboardingCallbackData";
import {
  makeBestiaryListCallbackData,
  makeBestiaryMonsterCallbackData,
  makeBestiaryRandomCallbackData,
  makeBestiarySpecialCallbackData
} from "../callbacks/bestiaryCallbackData";
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
  const totalPages = Math.max(1, Math.ceil(getBestiaryRecordCount() / BESTIARY_PAGE_SIZE));
  const hasNext = safePage < totalPages - 1;

  if (totalPages > 1) {
    if (hasPrevious) {
      keyboard.text("⏮️ Початок", makeBestiaryListCallbackData(0));
      keyboard.text("◀️ Назад", makeBestiaryListCallbackData(safePage - 1));
      keyboard.row();
    }

    keyboard.text(`${safePage + 1}/${totalPages}`, makeBestiaryListCallbackData(safePage)).row();

    if (hasNext) {
      keyboard.text("Далі ▶️", makeBestiaryListCallbackData(safePage + 1));
      keyboard.text("Кінець ⏭️", makeBestiaryListCallbackData(totalPages - 1));
      keyboard.row();
    }
  }

  return keyboard
    .text("🎲 Випадковий запис", makeBestiaryRandomCallbackData())
    .row()
    .text("🏹 До дошки", makeQuestCallbackData("hunt"));
}

export function buildBestiaryMonsterKeyboard(page: number, record?: BestiaryListRecord): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (record) {
    addBestiaryRecordNavigation(keyboard, record);
  }

  return keyboard
    .text("🎲 Випадковий запис", makeBestiaryRandomCallbackData())
    .row()
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

function addBestiaryRecordNavigation(keyboard: InlineKeyboard, record: BestiaryListRecord): void {
  const index = getBestiaryRecordIndex(record);
  const totalRecords = getBestiaryRecordCount();

  if (index < 0 || totalRecords <= 1) {
    return;
  }

  if (index > 0) {
    const firstRecord = getBestiaryRecordByIndex(0);
    const previousRecord = getBestiaryRecordByIndex(index - 1);

    if (firstRecord) {
      keyboard.text("⏮️ Перший", makeBestiaryRecordCallbackData(firstRecord, 0));
    }
    if (previousRecord) {
      keyboard.text("◀️ Попередній", makeBestiaryRecordCallbackData(previousRecord, index - 1));
    }
    keyboard.row();
  }

  if (index < totalRecords - 1) {
    const nextRecord = getBestiaryRecordByIndex(index + 1);
    const lastRecord = getBestiaryRecordByIndex(totalRecords - 1);

    if (nextRecord) {
      keyboard.text("Наступний ▶️", makeBestiaryRecordCallbackData(nextRecord, index + 1));
    }
    if (lastRecord) {
      keyboard.text("Останній ⏭️", makeBestiaryRecordCallbackData(lastRecord, totalRecords - 1));
    }
    keyboard.row();
  }
}

function makeBestiaryRecordCallbackData(record: BestiaryListRecord, index: number): string {
  const page = getBestiaryRecordPage(index);

  return record.type === "monster"
    ? makeBestiaryMonsterCallbackData(bestiaryRecordKey(record), page)
    : makeBestiarySpecialCallbackData(bestiaryRecordKey(record), page);
}
