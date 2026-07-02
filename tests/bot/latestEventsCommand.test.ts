import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { sendLatestEvents } from "../../src/bot/commands/latestEventsCommand";
import type { ActivityEventService } from "../../src/services/activityEventService";

describe("latest events command", () => {
  it("does not show an error card when the achievement notice reply fails after a feed reply", async () => {
    const ctx = makeContext();
    const feedReply = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("notice failed"));
    ctx.reply = feedReply;

    await sendLatestEvents(ctx, makeActivityEvents(), "reply", {
      achievementTracker: makeAchievementTracker()
    });

    expect(feedReply).toHaveBeenCalledTimes(2);
    expect(feedReply.mock.calls[0]?.[0]).toContain("Хроніки Квестарні");
    expect(feedReply.mock.calls[1]?.[0]).toContain("Нова ачівка");
    expect(feedReply.mock.calls.some(([text]) => String(text).includes("упустив перо в суп"))).toBe(false);
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
});

function makeContext(): Context {
  return {
    from: {
      id: 42,
      is_bot: false,
      first_name: "Тестовий"
    }
  } as Context;
}

function makeActivityEvents(): ActivityEventService {
  return {
    listRecent: vi.fn().mockResolvedValue({
      events: [],
      page: 0,
      pageSize: 15,
      hasNextPage: false
    })
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
