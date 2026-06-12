import type { Bot } from "grammy";
import { readAppVersion } from "../../shared/appVersion";

export function registerVersionCommand(bot: Bot): void {
  bot.command("version", async (ctx) => {
    await ctx.reply(`⚙️ Квестарня v${readAppVersion()}`);
  });
}
