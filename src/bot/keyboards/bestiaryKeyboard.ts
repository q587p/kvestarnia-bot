import { InlineKeyboard } from "grammy";
import { monsters } from "../../content";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../callbacks/onboardingCallbackData";
import {
  makeBestiaryListCallbackData,
  makeBestiaryMonsterCallbackData
} from "../callbacks/bestiaryCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import { BESTIARY_PAGE_SIZE, clampBestiaryPage } from "../presenters/bestiaryPresenter";

export function buildBestiaryListKeyboard(page: number): InlineKeyboard {
  const safePage = clampBestiaryPage(page);
  const start = safePage * BESTIARY_PAGE_SIZE;
  const pageMonsters = monsters.slice(start, start + BESTIARY_PAGE_SIZE);
  const keyboard = new InlineKeyboard();

  for (const monster of pageMonsters) {
    keyboard.text(`🔎 ${monster.name}`, makeBestiaryMonsterCallbackData(monster.id, safePage)).row();
  }

  const hasPrevious = safePage > 0;
  const hasNext = start + BESTIARY_PAGE_SIZE < monsters.length;

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
  for (const monster of monsters) {
    const data = makeBestiaryMonsterCallbackData(monster.id, 999);

    if (Buffer.byteLength(data, "utf8") > TELEGRAM_CALLBACK_DATA_LIMIT) {
      throw new Error(`Bestiary callback is too long for ${monster.id}.`);
    }
  }
}
