import type { Bot, Context } from "grammy";
import type { ReferralService } from "../../services/referralService";
import { registerParsedCallbackRoute } from "../callbackRoute";
import {
  parseReferralCallbackData,
  type ReferralCallback
} from "../callbacks/referralCallbackData";
import { playerFromContext } from "../context";
import {
  buildReferralConsentKeyboard,
  buildReferralDashboardKeyboard,
  buildReferralInviteeListKeyboard,
  buildReferralShareKeyboard
} from "../keyboards/referralKeyboard";
import { buildGenderKeyboard } from "../keyboards/onboardingKeyboard";
import {
  presentReferralAccepted,
  presentReferralConsent,
  presentReferralDashboard,
  presentReferralDeclined,
  presentReferralInvitees,
  presentReferralShareDraft
} from "../presenters/referralPresenter";
import { presentWelcome } from "../presenters/onboardingPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

const HTML_OPTIONS = { parse_mode: "HTML" as const };

export function registerReferralBotModule(bot: Bot, service: ReferralService): void {
  bot.command("invite", async (ctx) => {
    const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
    if (!telegramUserId) {
      return;
    }
    const result = await service.getDashboard(telegramUserId);
    await ctx.reply(presentReferralDashboard(result), {
      ...HTML_OPTIONS,
      reply_markup: buildReferralDashboardKeyboard(result)
    });
  });

  if (service.areDevHelpersEnabled()) {
    bot.command("dev_referral_reconcile", async (ctx) => {
      const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
      if (!telegramUserId) {
        return;
      }
      const result = await service.reconcileForTelegramUser(telegramUserId);
      await ctx.reply(
        `Поклики звірено. Нових виплат: ${result.granted}. Ще в черзі: ${result.pending}.`
      );
    });
  }

  registerParsedCallbackRoute(bot, /^v1:ref:/, parseReferralCallbackData, async (ctx, action) => {
    await handleReferralCallback(ctx, action, service);
  });
}

async function handleReferralCallback(
  ctx: Context,
  action: ReferralCallback,
  service: ReferralService
): Promise<void> {
  const telegramUserId = playerFromContext(ctx.from)?.telegramUserId;
  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Квестарня не впізнала пригодника.", show_alert: true });
    return;
  }
  if (action.type === "accept" || action.type === "decline") {
    const result = await service.respondToConsent(telegramUserId, action.type);
    if (result.state === "disabled") {
      await safeAnswerCallbackQuery(ctx, {
        text: "Нові поклики тимчасово не записують. Продовж без поклику.",
        show_alert: true
      });
      await safeEditMessageText(ctx, presentReferralConsent(result.consent.inviterName), {
        ...HTML_OPTIONS,
        reply_markup: buildReferralConsentKeyboard(false)
      });
      return;
    }
    if (result.state === "not-found") {
      await safeAnswerCallbackQuery(ctx, {
        text: "Цей запис уже змінився. Онови сторінку.",
        show_alert: true
      });
      return;
    }
    if (result.state === "legacy-character") {
      await safeAnswerCallbackQuery(ctx, {
        text: "Пригодник уже існує, тому цей поклик не можна прийняти. Продовжуй без нього.",
        show_alert: true
      });
      await safeEditMessageText(ctx, presentReferralDeclined(), HTML_OPTIONS);
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(
      ctx,
      result.state === "accepted" || result.state === "already-accepted"
        ? presentReferralAccepted()
        : presentReferralDeclined(),
      { ...HTML_OPTIONS, reply_markup: buildGenderKeyboard() }
    );
    return;
  }
  if (action.type === "create") {
    const pending = await service.getPendingConsent(telegramUserId);
    await safeAnswerCallbackQuery(ctx);
    if (pending) {
      await safeEditMessageText(ctx, presentReferralConsent(pending.inviterName), {
        ...HTML_OPTIONS,
        reply_markup: buildReferralConsentKeyboard(service.isFoundationEnabled())
      });
      return;
    }
    await safeEditMessageText(ctx, presentWelcome(), {
      ...HTML_OPTIONS,
      reply_markup: buildGenderKeyboard()
    });
    return;
  }
  if (action.type === "list") {
    const page = await service.listInvitees(telegramUserId, action.page);
    if (!page) {
      await safeAnswerCallbackQuery(ctx, {
        text: "Цей запис уже змінився. Онови сторінку.",
        show_alert: true
      });
      return;
    }
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentReferralInvitees(page), {
      ...HTML_OPTIONS,
      reply_markup: buildReferralInviteeListKeyboard(page)
    });
    return;
  }
  if (action.type === "share") {
    const dashboard = await service.getDashboard(telegramUserId);
    if (dashboard.state !== "ready") {
      await safeAnswerCallbackQuery(ctx, {
        text: "Посилання зараз недоступне. Повернися до поклику й онови сторінку.",
        show_alert: true
      });
      return;
    }
    await safeAnswerCallbackQuery(ctx, {
      text: action.variant === 0
        ? "Текст запрошення готовий."
        : "Інший текст готовий; посилання не змінилося."
    });
    await safeEditMessageText(ctx, presentReferralShareDraft(dashboard, action.variant), {
      ...HTML_OPTIONS,
      reply_markup: buildReferralShareKeyboard(dashboard, action.variant)
    });
    return;
  }
  const dashboard = await service.getDashboard(telegramUserId);
  await safeAnswerCallbackQuery(ctx);
  await safeEditMessageText(ctx, presentReferralDashboard(dashboard), {
    ...HTML_OPTIONS,
    reply_markup: buildReferralDashboardKeyboard(dashboard)
  });
}
