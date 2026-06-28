import { InlineKeyboard } from "grammy";
import type { AchievementListView } from "../../services/achievementService";
import {
  makeAchievementCheckCallbackData,
  makeAchievementListCallbackData
} from "../callbacks/achievementCallbackData";

export function buildHeroAchievementsKeyboard(
  options: { restoreCallbackData?: string | null } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard().text("🏅 Ачівки", makeAchievementListCallbackData(0));

  if (options.restoreCallbackData) {
    keyboard.row().text("🧻 До відновлення", options.restoreCallbackData);
  }

  return keyboard;
}

export function buildAchievementsKeyboard(view: AchievementListView): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  keyboard
    .text(formatFilterLabel("all", view.filter), makeAchievementListCallbackData(0, "all"))
    .text(formatFilterLabel("earned", view.filter), makeAchievementListCallbackData(0, "earned"))
    .row()
    .text(formatFilterLabel("locked", view.filter), makeAchievementListCallbackData(0, "locked"))
    .row();

  keyboard.text("🔎 Перевірити", makeAchievementCheckCallbackData(view.filter)).row();

  if (view.totalPages > 1) {
    if (view.page > 0) {
      keyboard.text("◀️ Назад", makeAchievementListCallbackData(view.page - 1, view.filter));
    }

    keyboard.text(`${view.page + 1}/${view.totalPages}`, makeAchievementListCallbackData(view.page, view.filter));

    if (view.page < view.totalPages - 1) {
      keyboard.text("Далі ▶️", makeAchievementListCallbackData(view.page + 1, view.filter));
    }

    keyboard.row();
  }

  return keyboard.text("↩️ До персонажа", "v1:ach:hero");
}

function formatFilterLabel(filter: AchievementListView["filter"], active: AchievementListView["filter"]): string {
  const label = filter === "earned"
    ? "✅ Отримані"
    : filter === "locked"
      ? "🔒 Не отримані"
      : "📚 Усі";

  return filter === active ? `• ${label}` : label;
}
