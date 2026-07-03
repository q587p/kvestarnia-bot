import type { Context } from "grammy";
import type { ClassNoncombatCallback } from "../callbacks/classNoncombatCallbackData";
import type { ClassNoncombatService } from "../../services/classNoncombatService";
import { telegramUserIdFromContext } from "../context";
import { buildClassNoncombatKeyboard } from "../keyboards/classNoncombatKeyboard";
import {
  presentClassNoncombatOpen,
  presentPriestBlessResult,
  presentPriestBlessTargetNotification,
  presentPriestHealResult,
  presentPriestHealTargetNotification,
  presentRoguePickpocketResult,
  presentRoguePickpocketTargetNotification
} from "../presenters/classNoncombatPresenter";
import { presentAchievementUnlockNotification } from "../presenters/achievementPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export async function handleClassNoncombatCallback(
  ctx: Context,
  callback: ClassNoncombatCallback,
  service: ClassNoncombatService
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Квестарня не впізнала пригодника.", show_alert: true });
    return;
  }

  await safeAnswerCallbackQuery(ctx);

  if (callback.type === "open") {
    await editOpen(ctx, service, telegramUserId, callback.mode, callback.page);
    return;
  }

  if (callback.type === "priest-heal") {
    const result = await service.healForTelegramUser(telegramUserId, {
      targetTelegramUserId: callback.targetTelegramUserId,
      expectedActorRemortCount: callback.actorRemortCount,
      expectedTargetRemortCount: callback.targetRemortCount
    });
    await safeEditMessageText(ctx, presentPriestHealResult(result), HTML_MESSAGE_OPTIONS);
    if (result.state === "completed" && result.action.actorTelegramUserId !== result.action.targetTelegramUserId) {
      await notifyTarget(ctx, result.action.targetTelegramUserId, presentPriestHealTargetNotification(result));
    }
    await notifyActorAchievements(ctx, result.state === "completed" ? result.unlocks : []);
    return;
  }

  if (callback.type === "priest-bless") {
    const result = await service.blessForTelegramUser(telegramUserId, {
      targetTelegramUserId: callback.targetTelegramUserId,
      expectedActorRemortCount: callback.actorRemortCount,
      expectedTargetRemortCount: callback.targetRemortCount
    });
    await safeEditMessageText(ctx, presentPriestBlessResult(result), HTML_MESSAGE_OPTIONS);
    if (result.state === "completed" && result.action.actorTelegramUserId !== result.action.targetTelegramUserId) {
      await notifyTarget(ctx, result.action.targetTelegramUserId, presentPriestBlessTargetNotification(result));
    }
    await notifyActorAchievements(ctx, result.state === "completed" ? result.unlocks : []);
    return;
  }

  const result = await service.pickpocketForTelegramUser(telegramUserId, {
    targetTelegramUserId: callback.targetTelegramUserId,
    expectedActorRemortCount: callback.actorRemortCount,
    expectedTargetRemortCount: callback.targetRemortCount
  });
  await safeEditMessageText(ctx, presentRoguePickpocketResult(result), HTML_MESSAGE_OPTIONS);

  if (result.state === "completed") {
    const notification = presentRoguePickpocketTargetNotification(result);
    if (notification) {
      await notifyTarget(ctx, result.attempt.targetTelegramUserId, notification);
    }
  }
  await notifyActorAchievements(ctx, result.state === "completed" ? result.unlocks : []);
}

async function editOpen(
  ctx: Context,
  service: ClassNoncombatService,
  telegramUserId: bigint,
  mode: "priest" | "rogue",
  page: number
): Promise<void> {
  const result = await service.openForTelegramUser(telegramUserId, mode, page);
  const keyboard = result.state === "ready" ? buildClassNoncombatKeyboard(result, page) : undefined;
  await safeEditMessageText(ctx, presentClassNoncombatOpen(result), keyboard
    ? { ...HTML_MESSAGE_OPTIONS, reply_markup: keyboard }
    : HTML_MESSAGE_OPTIONS);
}

async function notifyTarget(ctx: Context, telegramUserId: bigint, text: string): Promise<void> {
  try {
    await ctx.api.sendMessage(Number(telegramUserId), text, HTML_MESSAGE_OPTIONS);
  } catch {
    // Private class-action notifications are best-effort after the durable mutation.
  }
}

async function notifyActorAchievements(
  ctx: Context,
  unlocks: Parameters<typeof presentAchievementUnlockNotification>[0]
): Promise<void> {
  const text = presentAchievementUnlockNotification(unlocks);
  if (text) {
    await ctx.reply(text, HTML_MESSAGE_OPTIONS);
  }
}
