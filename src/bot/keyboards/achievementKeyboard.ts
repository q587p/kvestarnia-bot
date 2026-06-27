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

  keyboard.text("🔎 Перевірити", makeAchievementCheckCallbackData()).row();

  if (view.totalPages > 1) {
    if (view.page > 0) {
      keyboard.text("◀️ Назад", makeAchievementListCallbackData(view.page - 1));
    }

    keyboard.text(`${view.page + 1}/${view.totalPages}`, makeAchievementListCallbackData(view.page));

    if (view.page < view.totalPages - 1) {
      keyboard.text("Далі ▶️", makeAchievementListCallbackData(view.page + 1));
    }

    keyboard.row();
  }

  return keyboard.text("↩️ До персонажа", "v1:ach:hero");
}
