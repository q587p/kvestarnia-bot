import { InlineKeyboard } from "grammy";
import { makePlaceCallbackData } from "../callbacks/placeCallbackData";
import { makeQuestCallbackData } from "../callbacks/questCallbackData";
import type { QuestOverviewRow, QuestOverviewRoute } from "../presenters/questOverviewPresenter";

const MAX_DIRECT_ROUTES = 5;

export function buildQuestOverviewKeyboard(rows: readonly QuestOverviewRow[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const routes = uniqueRoutes(rows.flatMap((row) => row.route ? [row.route] : []));

  for (const route of routes.slice(0, MAX_DIRECT_ROUTES)) {
    keyboard.text(route.label, route.callbackData).row();
  }

  if (!routes.some((route) => route.callbackData === makeQuestCallbackData("list"))) {
    keyboard.text("📋 До Столу зі справами", makeQuestCallbackData("list")).row();
  }

  keyboard.text("↩️ Назад", makePlaceCallbackData("hall"));

  return keyboard;
}

function uniqueRoutes(routes: readonly QuestOverviewRoute[]): QuestOverviewRoute[] {
  const seen = new Set<string>();
  const unique: QuestOverviewRoute[] = [];

  for (const route of routes) {
    const key = `${route.callbackData}\0${route.label}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(route);
  }

  return unique;
}
