import { InlineKeyboard } from "grammy";
import {
  makeDevHelpCallbackData,
  type DevHelpPage
} from "../callbacks/devHelpCallbackData";
import type { DevCommandVisibility } from "../botCommandCatalog";
import { getDevHelpSections } from "../devHelpSections";

export function buildDevHelpKeyboard(
  visibility: boolean | DevCommandVisibility,
  page: DevHelpPage = "menu"
): InlineKeyboard {
  const sections = getDevHelpSections(visibility);
  const keyboard = new InlineKeyboard();

  if (page === "menu") {
    for (const [index, section] of sections.entries()) {
      keyboard.text(section.title, makeDevHelpCallbackData(section.page));
      if (index % 2 === 1 || index === sections.length - 1) {
        keyboard.row();
      }
    }

    return keyboard;
  }

  const pageIndex = sections.findIndex((section) => section.page === page);
  if (pageIndex < 0) {
    return keyboard.text("🧰 Розділи", makeDevHelpCallbackData("menu"));
  }

  const previous = sections[pageIndex - 1];
  const next = sections[pageIndex + 1];
  if (previous) {
    keyboard.text("⬅️", makeDevHelpCallbackData(previous.page));
  }
  keyboard.text("🧰 Розділи", makeDevHelpCallbackData("menu"));
  if (next) {
    keyboard.text("➡️", makeDevHelpCallbackData(next.page));
  }

  return keyboard;
}
