import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import type { BotServices } from "../../src/bot/botServices";
import { showActivePassageSearchIfNeeded } from "../../src/bot/modules/passageSearchGuard";

describe("showActivePassageSearchIfNeeded", () => {
  it.each(["reply", "edit"] as const)(
    "delivers a fresh due-search achievement after the %s result card",
    async (mode) => {
      const calls: string[] = [];
      const ctx = contextWithCalls(calls);
      const result = completedResult([{
        id: "achievement.iskrokamin.first-owned",
        title: "Іскра в кишені",
        cosmeticTitleGrantId: null,
        unlockedAt: new Date("2026-07-17T12:00:00.000Z")
      }]);

      const shown = await showActivePassageSearchIfNeeded(
        ctx,
        servicesWithResult(result),
        42n,
        mode
      );

      expect(shown).toBe(true);
      expect(calls).toEqual(mode === "edit"
        ? ["answer", "edit:🎒", "reply:🏅"]
        : ["reply:🎒", "reply:🏅"]);
    }
  );

  it.each(["reply", "edit"] as const)(
    "does not redeliver achievements for a stored replay in %s mode",
    async (mode) => {
      const calls: string[] = [];
      const ctx = contextWithCalls(calls);

      const shown = await showActivePassageSearchIfNeeded(
        ctx,
        servicesWithResult(completedResult([])),
        42n,
        mode
      );

      expect(shown).toBe(true);
      expect(calls).toEqual(mode === "edit"
        ? ["answer", "edit:🎒"]
        : ["reply:🎒"]);
    }
  );
});

function contextWithCalls(calls: string[]): Context {
  return {
    callbackQuery: {
      id: "callback-1",
      message: {
        message_id: 10,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 42, type: "private" }
      }
    },
    answerCallbackQuery: vi.fn(() => {
      calls.push("answer");
      return Promise.resolve(true);
    }),
    editMessageText: vi.fn((text: string) => {
      calls.push(`edit:${text.slice(0, 2)}`);
      return Promise.resolve(true);
    }),
    reply: vi.fn((text: string) => {
      calls.push(`reply:${text.slice(0, 2)}`);
      return Promise.resolve({ message_id: 11 });
    })
  } as unknown as Context;
}

function servicesWithResult(result: ReturnType<typeof completedResult>): BotServices {
  return {
    passageSearch: {
      getActiveSearch: vi.fn().mockResolvedValue(result)
    }
  } as unknown as BotServices;
}

function completedResult(achievementUnlocks: Array<{
  id: string;
  title: string;
  cosmeticTitleGrantId: string | null;
  unlockedAt: Date;
}>) {
  return {
    state: "completed" as const,
    loot: {
      gold: 3,
      itemGrants: []
    },
    achievementUnlocks
  };
}
