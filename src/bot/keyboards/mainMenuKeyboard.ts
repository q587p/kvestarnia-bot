import { InlineKeyboard, Keyboard } from "grammy";
import { makeDevResetCallbackData } from "../callbacks/devResetCallbackData";
import { makeRestartCallbackData } from "../callbacks/restartCallbackData";

export const mainMenuButtons = {
  hero: "👤 Герой",
  tavern: "🍺 Корчма",
  quest: "🗺️ Квест",
  inventory: "🎒 Манатки",
  guild: "🛡️ Ґільдія",
  help: "📖 Допомога"
} as const;

export function buildMainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(mainMenuButtons.hero)
    .text(mainMenuButtons.tavern)
    .row()
    .text(mainMenuButtons.quest)
    .text(mainMenuButtons.inventory)
    .row()
    .text(mainMenuButtons.guild)
    .text(mainMenuButtons.help)
    .resized()
    .persistent()
    .placeholder("Що робимо далі?");
}

export function buildDevResetKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Так, скинути", makeDevResetCallbackData("confirm"))
    .text("⬅️ Ні, лишити", makeDevResetCallbackData("cancel"));
}

export function buildRestartKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Так, почати з початку", makeRestartCallbackData("confirm"))
    .row()
    .text("⬅️ Ні, лишити героя", makeRestartCallbackData("cancel"));
}
