import type { Bot, Context } from "grammy";
import { readNewsEntries } from "../../news/newsMarkdown";
import type { NewsCallbackSource } from "../callbacks/newsCallbackData";
import { presentNewsEntry, presentNewsIndex, type NewsPage } from "../presenters/newsPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

export function registerNewsCommand(bot: Bot): void {
  bot.command("news", async (ctx) => {
    await sendNewsList(ctx, 0, "reply");
  });
}

export async function sendNewsList(
  ctx: Context,
  page: number,
  mode: "reply" | "edit" = "edit",
  options: { source?: NewsCallbackSource } = {}
): Promise<void> {
  const newsPage = await buildNewsIndexPage(page, options.source ?? "hall");

  if (mode === "reply") {
    await ctx.reply(newsPage.text, keyboardOptions(newsPage));
    return;
  }

  await safeEditMessageText(ctx, newsPage.text, keyboardOptions(newsPage));
}

export async function sendNewsEntry(
  ctx: Context,
  entryIndex: number,
  listPage: number,
  options: { source?: NewsCallbackSource } = {}
): Promise<void> {
  const entries = await readNewsEntriesSafe();
  const newsPage = presentNewsEntry(entries, entryIndex, listPage, options.source ?? "hall");
  await safeEditMessageText(ctx, newsPage.text, keyboardOptions(newsPage));
}

async function buildNewsIndexPage(page = 0, source: NewsCallbackSource = "hall"): Promise<NewsPage> {
  const entries = await readNewsEntriesSafe();
  return presentNewsIndex(entries, page, source);
}

async function readNewsEntriesSafe() {
  try {
    return await readNewsEntries();
  } catch {
    return [];
  }
}

function keyboardOptions(page: NewsPage) {
  return {
    parse_mode: "HTML" as const,
    ...(page.keyboard ? { reply_markup: page.keyboard } : {})
  };
}
