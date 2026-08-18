import type { Bot, Context } from "grammy";
import type { CaptureReferralResult } from "../../db/repositories/referralRepository";
import type { ReferralService } from "../../services/referralService";
import { playerFromContext } from "../context";
import { parseStartPayload } from "../startPayload";

const captureResults = new WeakMap<Context, CaptureReferralResult>();

export function registerReferralMiddleware(bot: Bot, service: ReferralService): void {
  bot.use(async (ctx, next) => {
    const rawPayload = ctx.message?.text?.match(/^\/start(?:@\w+)?(?:\s+([^\s]+))?$/i)?.[1];
    const payload = parseStartPayload(rawPayload);
    const player = playerFromContext(ctx.from);
    if (player && payload.type === "referral") {
      try {
        captureResults.set(ctx, await service.captureFromStart(player, payload.token));
      } catch (error) {
        console.error("Квестарня: поклик не вдалося перевірити до оновлення присутности.", {
          errorName: error instanceof Error ? error.name : "unknown"
        });
      }
    }

    await next();

    if (player && service.arePayoutsEnabled()) {
      void service.reconcileForTelegramUser(player.telegramUserId).catch((error) => {
        console.error("Квестарня: автоматична виплата за поклик не завершилась.", {
          errorName: error instanceof Error ? error.name : "unknown"
        });
      });
    }
  });
}

export function getReferralCaptureResult(ctx: Context): CaptureReferralResult | null {
  return captureResults.get(ctx) ?? null;
}
