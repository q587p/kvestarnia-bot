import type { Bot, Context } from "grammy";
import { readNewsEntries } from "../../news/newsMarkdown";
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
  mode: "reply" | "edit" = "edit"
): Promise<void> {
  const newsPage = await buildNewsIndexPage(page);

  if (mode === "reply") {
    await ctx.reply(newsPage.text, keyboardOptions(newsPage));
    return;
  }

  await safeEditMessageText(ctx, newsPage.text, keyboardOptions(newsPage));
}

export async function sendNewsEntry(
  ctx: Context,
  entryIndex: number,
  listPage: number
): Promise<void> {
  const entries = await readNewsEntriesSafe();
  const newsPage = presentNewsEntry(entries, entryIndex, listPage);
  await safeEditMessageText(ctx, newsPage.text, keyboardOptions(newsPage));
}

async function buildNewsIndexPage(page = 0): Promise<NewsPage> {
  const entries = await readNewsEntriesSafe();
  return presentNewsIndex(entries, page);
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
