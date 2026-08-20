import type { Bot, Context } from "grammy";
import type { CaptureReferralResult } from "../../db/repositories/referralRepository";
import type { ReferralService } from "../../services/referralService";
import { playerFromContext } from "../context";
import { parseStartPayload } from "../startPayload";
import { presentReferralCaptureRetry } from "../presenters/referralPresenter";

const captureResults = new WeakMap<Context, CaptureReferralResult>();

export function registerReferralMiddleware(bot: Bot, service: ReferralService): void {
  bot.use(async (ctx, next) => {
    const rawPayload = ctx.message?.text?.match(/^\/start(?:@\w+)?(?:\s+([^\s]+))?$/i)?.[1];
    const payload = parseStartPayload(rawPayload);
    const player = playerFromContext(ctx.from);
    if (player && payload.type === "referral") {
      try {
        const result = await service.captureFromStart(player, payload.token);
        if (result.state === "retry") {
          await ctx.reply(presentReferralCaptureRetry());
          return;
        }
        captureResults.set(ctx, result);
      } catch (error) {
        console.error("Квестарня: поклик не вдалося перевірити до оновлення присутности.", {
          errorName: error instanceof Error ? error.name : "unknown"
        });
        await ctx.reply(presentReferralCaptureRetry());
        return;
      }
    }

    await next();

    if (player) {
      service.requestReconciliation?.();
    }
  });
}

export function getReferralCaptureResult(ctx: Context): CaptureReferralResult | null {
  return captureResults.get(ctx) ?? null;
}
