import "dotenv/config";

import { Bot } from "grammy";
import { loadConfig } from "./config/env";
import { presentStart } from "./bot/presenters/startPresenter";

const config = loadConfig();

if (!config.botToken) {
  console.log("Квестарня: BOT_TOKEN не задано, Telegram polling не запускається.");
} else {
  const bot = new Bot(config.botToken);

  bot.command("start", async (ctx) => {
    await ctx.reply(presentStart());
  });

  process.once("SIGINT", () => {
    void bot.stop();
  });
  process.once("SIGTERM", () => {
    void bot.stop();
  });

  console.log("Квестарня: бот запускається в polling-режимі.");
  void bot.start();
}
