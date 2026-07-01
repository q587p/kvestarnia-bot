import type { Context } from "grammy";
import {
  getLoreEntriesForCategory,
  selectRandomLoreEntry,
  selectRandomLoreEntryForCategory
} from "../../content/loreBoard";
import {
  presentLoreCategory,
  presentLoreEmptyRandom,
  presentLoreEntry,
  presentLoreEntryPage,
  presentLoreMenu,
  type LoreBoardPage
} from "../presenters/loreBoardPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

export async function sendLoreMenu(
  ctx: Context,
  mode: "reply" | "edit" = "edit"
): Promise<void> {
  await sendLorePage(ctx, presentLoreMenu(), mode);
}

export async function sendLoreCategory(
  ctx: Context,
  categoryId: string
): Promise<void> {
  await sendLorePage(ctx, presentLoreCategory(categoryId), "edit");
}

export async function sendLoreEntry(
  ctx: Context,
  entryId: string
): Promise<void> {
  await sendLorePage(ctx, presentLoreEntry(entryId), "edit");
}

export async function sendRandomLoreEntry(
  ctx: Context,
  rng: () => number = Math.random
): Promise<void> {
  const entry = selectRandomLoreEntry(undefined, rng);
  await sendLorePage(ctx, entry ? presentLoreEntryPage(entry) : presentLoreEmptyRandom(), "edit");
}

export async function sendRandomLoreEntryForCategory(
  ctx: Context,
  categoryId: string,
  rng: () => number = Math.random
): Promise<void> {
  const entries = getLoreEntriesForCategory(categoryId);
  const entry = selectRandomLoreEntryForCategory(categoryId, rng);
  const page = entry
    ? presentLoreEntryPage(entry)
    : entries.length === 0
      ? presentLoreCategory(categoryId)
      : presentLoreEmptyRandom();

  await sendLorePage(
    ctx,
    page,
    "edit"
  );
}

async function sendLorePage(
  ctx: Context,
  page: LoreBoardPage,
  mode: "reply" | "edit"
): Promise<void> {
  const options = {
    parse_mode: "HTML" as const,
    reply_markup: page.keyboard
  };

  if (mode === "reply") {
    await ctx.reply(page.text, options);
    return;
  }

  await safeEditMessageText(ctx, page.text, options);
}
