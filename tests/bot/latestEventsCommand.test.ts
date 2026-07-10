import type { Context } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerLatestEventsCommand,
  sendLatestEvents
} from "../../src/bot/commands/latestEventsCommand";
import {
  clearMessageFreshnessTracking,
  rememberLatestMessageForChat
} from "../../src/bot/messageFreshness";
import type { ActivityEventService } from "../../src/services/activityEventService";

describe("latest events command", () => {
  afterEach(() => {
    clearMessageFreshnessTracking();
  });

  it("does not show an error card when the achievement notice reply fails after a feed reply", async () => {
    const ctx = makeContext();
    const listRecent = makeListRecent();
    const activityEvents = makeActivityEvents(listRecent);
    const feedReply = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("notice failed"));
    ctx.reply = feedReply;

    await sendLatestEvents(ctx, activityEvents, "reply", {
      achievementTracker: makeAchievementTracker()
    });

    expect(listRecent).toHaveBeenCalledWith("imp", { page: 0 });
    expect(feedReply).toHaveBeenCalledTimes(2);
    expect(feedReply.mock.calls[0]?.[0]).toContain("Хроніки Квестарні");
    expect(feedReply.mock.calls[1]?.[0]).toContain("Нова ачівка");
    expect(feedReply.mock.calls.some(([text]) => String(text).includes("упустив перо в суп"))).toBe(false);
  });

  it("routes /chronicles to the latest events feed", async () => {
    const handlers = new Map<string, CommandHandler>();
    const achievementTracker = makeAchievementTracker();
    registerLatestEventsCommand(makeCommandBot(handlers), makeActivityEvents(), achievementTracker);
    const handler = handlers.get("chronicles");
    const ctx = makeContext();
    const reply = vi.fn().mockResolvedValue({});
    ctx.reply = reply;

    await handler?.(ctx);

    expect(handler).toBeDefined();
    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls[0]?.[0]).toContain("Хроніки Квестарні");
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).toContain('"parse_mode":"HTML"');
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).toContain("🔘 ⭐ Важливе");
    expect(JSON.stringify(reply.mock.calls[0]?.[1])).toContain("🎒 Манатки");
    expect(achievementTracker.trackLatestEventsOpenedByTelegramUserId).toHaveBeenCalledWith(42n);
  });

  it("does not replace an edited feed with an error card when the achievement notice reply fails", async () => {
    const ctx = makeContext();
    const editMessageText = vi.fn().mockResolvedValue({});
    const noticeReply = vi.fn().mockRejectedValue(new Error("notice failed"));
    ctx.editMessageText = editMessageText;
    ctx.reply = noticeReply;

    await sendLatestEvents(ctx, makeActivityEvents(), "edit", {
      achievementTracker: makeAchievementTracker()
    });

    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(editMessageText.mock.calls[0]?.[0]).toContain("Хроніки Квестарні");
    expect(noticeReply).toHaveBeenCalledTimes(1);
    expect(noticeReply.mock.calls[0]?.[0]).toContain("Нова ачівка");
    expect(editMessageText.mock.calls.some(([text]) => String(text).includes("упустив перо в суп"))).toBe(false);
  });

  it("does not show an error card when stale edit fallback reply succeeds before achievement notice reply fails", async () => {
    rememberLatestMessageForChat(42, 100);
    const ctx = makeContext({
      callbackQuery: {
        message: {
          message_id: 99,
          chat: { id: 42 }
        }
      }
    });
    const editMessageText = vi.fn().mockResolvedValue({});
    const reply = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("notice failed"));
    ctx.editMessageText = editMessageText;
    ctx.reply = reply;

    await sendLatestEvents(ctx, makeActivityEvents(), "edit", {
      achievementTracker: makeAchievementTracker()
    });

    expect(editMessageText).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls[0]?.[0]).toContain("Хроніки Квестарні");
    expect(reply.mock.calls[1]?.[0]).toContain("Нова ачівка");
    expect(reply.mock.calls.some(([text]) => String(text).includes("упустив перо в суп"))).toBe(false);
  });
});

type CommandHandler = (ctx: Context) => Promise<void>;

function makeCommandBot(handlers: Map<string, CommandHandler>): Parameters<typeof registerLatestEventsCommand>[0] {
  return {
    command(command: string | string[], handler: CommandHandler) {
      for (const key of Array.isArray(command) ? command : [command]) {
        handlers.set(key, handler);
      }
    }
  } as unknown as Parameters<typeof registerLatestEventsCommand>[0];
}

function makeContext(overrides: Partial<Context> = {}): Context {
  return {
    from: {
      id: 42,
      is_bot: false,
      first_name: "Тестовий"
    },
    ...overrides
  } as Context;
}

function makeListRecent() {
  return vi.fn().mockResolvedValue({
    events: [],
    page: 0,
    pageSize: 15,
    hasNextPage: false
  });
}

function makeActivityEvents(listRecent = makeListRecent()): ActivityEventService {
  return {
    listRecent
  } as unknown as ActivityEventService;
}

function makeAchievementTracker() {
  return {
    trackLatestEventsOpenedByTelegramUserId: vi.fn().mockResolvedValue([
      {
        id: "achievement.journey.latest-events-opened",
        title: "Читач дрібного шрифту",
        cosmeticTitleGrantId: null,
        unlockedAt: new Date("2026-07-02T12:00:00.000Z")
      }
    ])
  };
}
