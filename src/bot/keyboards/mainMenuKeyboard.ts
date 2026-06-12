import { InlineKeyboard } from "grammy";
import { makeDevResetCallbackData } from "../callbacks/devResetCallbackData";
import { makeMenuCallbackData } from "../callbacks/menuCallbackData";
import { makeRestartCallbackData } from "../callbacks/restartCallbackData";

export function buildMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👤 Герой", makeMenuCallbackData("hero"))
    .text("🎒 Манатки", makeMenuCallbackData("inventory"))
    .row()
    .text("🍺 До таверни", makeMenuCallbackData("tavern"))
    .row()
    .text("❔ Допомога", makeMenuCallbackData("help"));
}

export function buildDevResetKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Так, скинути", makeDevResetCallbackData("confirm"))
    .text("Ні, лишити", makeDevResetCallbackData("cancel"));
}

export function buildRestartKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Так, почати з початку", makeRestartCallbackData("confirm"))
    .row()
    .text("Ні, лишити героя", makeRestartCallbackData("cancel"));
}
