import { InlineKeyboard } from "grammy";
import type { AchievementListView, CosmeticTitleListView } from "../../services/achievementService";
import {
  makeAchievementCheckCallbackData,
  makeAchievementListCallbackData,
  makeCosmeticTitleClearCallbackData,
  makeCosmeticTitleListCallbackData,
  makeCosmeticTitleSetCallbackData
} from "../callbacks/achievementCallbackData";

export function buildHeroAchievementsKeyboard(
  options: {
    priestSelfHealCallbackData?: string | null;
    restoreCallbackData?: string | null;
  } = {}
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("🏅 Ачівки", makeAchievementListCallbackData(0))
    .text("🏷️ Титули", makeCosmeticTitleListCallbackData());

  if (options.priestSelfHealCallbackData) {
    keyboard.row().text("⚕️ Полікувати себе", options.priestSelfHealCallbackData);
  }

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

export function buildCosmeticTitlesKeyboard(view: CosmeticTitleListView): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  view.entries.forEach((entry, index) => {
    keyboard.text(
      entry.active ? `✅ ${index + 1}` : `🏷️ ${index + 1}`,
      makeCosmeticTitleSetCallbackData(entry.grantRowId, view.remortCount)
    );

    if ((index + 1) % 3 === 0) {
      keyboard.row();
    }
  });

  if (view.entries.length > 0) {
    keyboard.row();
  }

  if (view.activeTitleGrantId || view.activeTitleMissing) {
    keyboard.text("🧹 Зняти титул", makeCosmeticTitleClearCallbackData(view.remortCount)).row();
  }

  return keyboard
    .text("🏅 Ачівки", makeAchievementListCallbackData(0, "earned"))
    .row()
    .text("↩️ До персонажа", "v1:ach:hero");
}

function formatFilterLabel(filter: AchievementListView["filter"], active: AchievementListView["filter"]): string {
  const label = filter === "earned"
    ? "✅ Отримані"
    : filter === "locked"
      ? "🔒 Не отримані"
      : "📚 Усі";

  return filter === active ? `• ${label}` : label;
}
