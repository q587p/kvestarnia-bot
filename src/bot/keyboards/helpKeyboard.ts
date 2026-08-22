import { InlineKeyboard } from "grammy";
import {
  HELP_CONTENT_PAGES,
  makeHelpCallbackData,
  type HelpPage
} from "../callbacks/helpCallbackData";

export function buildHelpKeyboard(page: HelpPage = "menu"): InlineKeyboard {
  if (page === "menu") {
    return new InlineKeyboard()
      .text("👤 Персонаж", makeHelpCallbackData("hero"))
      .text("⚔️ Пригоди й бої", makeHelpCallbackData("adventures"))
      .row()
      .text("🎒 Манатки", makeHelpCallbackData("items"))
      .text("🍺 Корчма й люди", makeHelpCallbackData("korchma"))
      .row()
      .text("🛡️ Ґільдії", makeHelpCallbackData("guild"))
      .text("📰 Довідки й вісті", makeHelpCallbackData("news"));
  }

  const pageIndex = HELP_CONTENT_PAGES.indexOf(page);
  const previous = HELP_CONTENT_PAGES[pageIndex - 1];
  const next = HELP_CONTENT_PAGES[pageIndex + 1];
  const keyboard = new InlineKeyboard();

  if (previous) {
    keyboard.text("⬅️", makeHelpCallbackData(previous));
  }

  keyboard.text("📖 Розділи", makeHelpCallbackData("menu"));

  if (next) {
    keyboard.text("➡️", makeHelpCallbackData(next));
  }

  return keyboard;
}
