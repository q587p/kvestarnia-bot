import { InlineKeyboard } from "grammy";
import type { LatestEventFilter } from "../../services/activityEventService";
import { makeLatestEventsListCallbackData } from "../callbacks/latestEventsCallbackData";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";

export function buildLatestEventsKeyboard(input: {
  filter: LatestEventFilter;
  page: number;
  hasNextPage: boolean;
}): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(filterButtonLabel(input.filter, "imp", "⭐ Важливе"), makeLatestEventsListCallbackData("imp", 0))
    .text(filterButtonLabel(input.filter, "adv", "👥 Пригодники"), makeLatestEventsListCallbackData("adv", 0))
    .row()
    .text(filterButtonLabel(input.filter, "cmb", "⚔️ Бої"), makeLatestEventsListCallbackData("cmb", 0))
    .text(filterButtonLabel(input.filter, "itm", "🎒 Манатки"), makeLatestEventsListCallbackData("itm", 0));

  if (input.page > 0) {
    keyboard.row();
    keyboard.text("⬅️ Назад", makeLatestEventsListCallbackData(input.filter, input.page - 1));
  }

  if (input.hasNextPage) {
    if (input.page === 0) {
      keyboard.row();
    }
    keyboard.text("Далі ➡️", makeLatestEventsListCallbackData(input.filter, input.page + 1));
  }

  return keyboard
    .row()
    .text("⬅️ До дошки", makePlaceCallbackData("news-corner"));
}

function filterButtonLabel(
  currentFilter: LatestEventFilter,
  filter: LatestEventFilter,
  label: string
): string {
  return currentFilter === filter ? `🔘 ${label}` : label;
}
