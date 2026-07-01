import type { Context } from "grammy";
import type { ActivityEventService, LatestEventFilter } from "../../services/activityEventService";
import { buildLatestEventsKeyboard } from "../keyboards/latestEventsKeyboard";
import {
  presentLatestEventsError,
  presentLatestEventsPage
} from "../presenters/latestEventsPresenter";
import { safeEditMessageText } from "../safeEditMessageText";

export async function sendLatestEvents(
  ctx: Context,
  activityEvents: ActivityEventService,
  mode: "reply" | "edit" = "edit",
  options: { filter?: LatestEventFilter; page?: number } = {}
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
      return;
    }

    await safeEditMessageText(ctx, text, replyOptions);
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
