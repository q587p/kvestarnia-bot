import type { Bot } from "grammy";
import type { PresenceService } from "../../services/presenceService";
import { playerFromContext } from "../context";
import { getPresenceContext } from "../presence/presenceRouting";
import { measureUpdateComponent } from "../updatePerformanceTrace";

export function registerPresenceMiddleware(bot: Bot, presenceService: PresenceService): void {
  bot.use(async (ctx, next) => {
    const player = playerFromContext(ctx.from);
    const presenceContext = getPresenceContext(ctx);

    if (player && presenceContext) {
      try {
        await measureUpdateComponent("presence", () => presenceService.markAction({
          user: player,
          ...presenceContext
        }));
      } catch (error) {
        console.error("Квестарня: присутність гравця не оновилась.", error);
      }
    }

    await next();
  });
}
