import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
  sendLoreCategory,
  sendLoreEntry,
  sendLoreMenu,
  sendRandomLoreEntry,
  sendRandomLoreEntryForCategory
} from "../../src/bot/commands/loreBoardCommand";
import { makeLoreCategoryRandomCallbackData } from "../../src/bot/callbacks/loreBoardCallbackData";
import { makePlaceCallbackData } from "../../src/bot/callbacks/placeCallbackData";

describe("lore board command helpers", () => {
  it("replies with the lore menu in Telegram HTML", async () => {
    const replies: Array<{ text: string; options: unknown }> = [];

    await sendLoreMenu(makeReplyContext(replies), "reply");

    expect(replies[0]?.text).toContain("📖 Перекази Квестарні");
    expect(replies[0]?.options).toMatchObject({ parse_mode: "HTML" });
    expect(JSON.stringify(replies[0]?.options)).toContain(makePlaceCallbackData("news-corner"));
  });

  it("edits category, entry, random and stale fallback screens", async () => {
    const edits: Array<{ text: string; options: unknown }> = [];
    const ctx = makeEditContext(edits);

    await sendLoreCategory(ctx, "places");
    await sendLoreEntry(ctx, "place-bar");
    await sendRandomLoreEntry(ctx, () => 0);
    await sendRandomLoreEntryForCategory(ctx, "classes", () => 0);
    await sendLoreCategory(ctx, "stale-category");
    await sendLoreEntry(ctx, "stale-entry");

    expect(edits.map((edit) => edit.text)).toEqual(expect.arrayContaining([
      expect.stringContaining("🪧 Місцини корчми"),
      expect.stringContaining("📖 <b>Шинок</b>"),
      expect.stringContaining("📖 <b>Квестарня, що стоїть на порозі</b>"),
      expect.stringContaining("📖 <b>Воїн</b>"),
      expect.stringContaining("Цю теку переклали"),
      expect.stringContaining("дірка від цвяха")
    ]));
    for (const edit of edits) {
      expect(edit.options).toMatchObject({ parse_mode: "HTML" });
    }
    expect(JSON.stringify(edits[0]?.options)).toContain(makeLoreCategoryRandomCallbackData("places"));
  });
});

function makeReplyContext(replies: Array<{ text: string; options: unknown }>): Context {
  return {
    reply: (text: string, options: unknown) => {
      replies.push({ text, options });
      return Promise.resolve({});
    }
  } as unknown as Context;
}

function makeEditContext(edits: Array<{ text: string; options: unknown }>): Context {
  return {
    callbackQuery: {
      message: {
        message_id: 10,
        chat: {
          id: 42
        }
      }
    },
    editMessageText: vi.fn((text: string, options: unknown) => {
      edits.push({ text, options });
      return Promise.resolve(true);
    }),
    reply: vi.fn()
  } as unknown as Context;
}
