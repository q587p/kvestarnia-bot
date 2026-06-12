import { InlineKeyboard } from "grammy";
import { makeDevResetCallbackData } from "../callbacks/devResetCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";

export function buildMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👤 Герой", makeMenuCallbackData("hero"))
    .text("🍺 До таверни", makeMenuCallbackData("tavern"))
    .row()
    .text("❔ Допомога", makeMenuCallbackData("help"));
}

export function buildDevResetKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Так, скинути", makeDevResetCallbackData("confirm"))
    .text("Ні, лишити", makeDevResetCallbackData("cancel"));
}
