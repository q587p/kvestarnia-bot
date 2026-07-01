import { InlineKeyboard } from "grammy";
import type { LatestEventFilter } from "../../services/activityEventService";
import {
  makeLatestEventsListCallbackData,
  makeLatestEventsRefreshCallbackData
} from "../callbacks/latestEventsCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildLatestEventsKeyboard(input: {
  filter: LatestEventFilter;
  page: number;
  hasNextPage: boolean;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("⭐ Важливе", makeLatestEventsListCallbackData("imp", 0))
    .text("👥 Пригодники", makeLatestEventsListCallbackData("adv", 0))
    .row()
    .text("⚔️ Бої", makeLatestEventsListCallbackData("cmb", 0))
    .text("🎒 Манатки", makeLatestEventsListCallbackData("itm", 0))
    .row()
    .text("🔄 Оновити", makeLatestEventsRefreshCallbackData(input.filter, input.page));

  if (input.page > 0) {
    keyboard.text("⬅️ Назад", makeLatestEventsListCallbackData(input.filter, input.page - 1));
  }

  if (input.hasNextPage) {
    keyboard.text("Далі ➡️", makeLatestEventsListCallbackData(input.filter, input.page + 1));
  }

  return keyboard
    .row()
    .text("⬅️ До дошки", makePlaceCallbackData("news-corner"));
}
