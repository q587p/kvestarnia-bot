import type { Context } from "grammy";
import type { ActivityEventService, LatestEventFilter } from "../../services/activityEventService";
import type { AchievementUnlock } from "../../services/achievementService";
import { buildLatestEventsKeyboard } from "../keyboards/latestEventsKeyboard";
import { playerFromContext } from "../context";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import {
  presentLatestEventsError,
  presentLatestEventsPage
} from "../presenters/latestEventsPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export interface LatestEventsAchievementTracker {
  trackLatestEventsOpenedByTelegramUserId(telegramUserId: bigint): Promise<AchievementUnlock[]>;
}

export async function sendLatestEvents(
  ctx: Context,
  activityEvents: ActivityEventService,
  mode: "reply" | "edit" = "edit",
  options: {
    filter?: LatestEventFilter;
    page?: number;
    achievementTracker?: LatestEventsAchievementTracker;
  } = {}
): Promise<void> {
  const filter = options.filter ?? "all";
  const page = Math.max(0, Math.floor(options.page ?? 0));

  try {
    const eventPage = await activityEvents.listRecent(filter, { page });
    const text = presentLatestEventsPage({ page: eventPage, filter });
    const replyOptions = {
      parse_mode: "HTML" as const,
      reply_markup: buildLatestEventsKeyboard({
        filter,
        page: eventPage.page,
        hasNextPage: eventPage.hasNextPage
      })
    };

    if (mode === "reply") {
      await ctx.reply(text, replyOptions);
      await sendLatestEventsAchievementNotification(ctx, options.achievementTracker);
      return;
    }

    await safeEditMessageText(ctx, text, replyOptions);
    await sendLatestEventsAchievementNotification(ctx, options.achievementTracker);
  } catch {
    const replyOptions = {
      parse_mode: "HTML" as const,
      reply_markup: buildLatestEventsKeyboard({
        filter,
        page,
        hasNextPage: false
      })
    };

    if (mode === "reply") {
      await ctx.reply(presentLatestEventsError(), replyOptions);
      return;
    }

    await safeEditMessageText(ctx, presentLatestEventsError(), replyOptions);
  }
}

async function sendLatestEventsAchievementNotification(
  ctx: Context,
  tracker: LatestEventsAchievementTracker | undefined
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;

  if (!telegramUserId || !tracker) {
    return;
  }

  const unlocks = await tracker.trackLatestEventsOpenedByTelegramUserId(telegramUserId).catch(() => []);
  const text = presentAchievementUnlockNotification(unlocks);

  if (text) {
    await ctx.reply(text, HTML_MESSAGE_OPTIONS);
  }
}
