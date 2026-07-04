import { InlineKeyboard, type Context } from "grammy";
import {
  makeClassNoncombatOpenCallbackData,
  makeRogueRetaliationDuelCallbackData,
  type ClassNoncombatCallback
} from "../callbacks/classNoncombatCallbackData";
import type {
  ClassNoncombatService,
  RoguePickpocketResult,
  RogueRetaliationResult
} from "../../services/classNoncombatService";
import type {
  DuelAcceptResult,
  DuelChallengeService,
  DuelTargetedCreateResult
} from "../../services/duelChallengeService";
import { telegramUserIdFromContext } from "../context";
import { buildClassNoncombatKeyboard } from "../keyboards/classNoncombatKeyboard";
import { buildDuelResultKeyboard } from "../keyboards/duelKeyboard";
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
import { presentDuelAccept } from "../presenters/duelPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export async function handleClassNoncombatCallback(
  ctx: Context,
  callback: ClassNoncombatCallback,
  service: ClassNoncombatService,
  duelService?: DuelChallengeService
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);

  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Квестарня не впізнала пригодника.", show_alert: true });
    return;
  }

  if (callback.type === "rogue-retaliation-duel") {
    await handleRogueRetaliationDuel(ctx, telegramUserId, callback, service, duelService);
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
    await editPriestResult(ctx, service, telegramUserId, callback.page, presentPriestHealResult(result), result.state);
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
    await editPriestResult(ctx, service, telegramUserId, callback.page, presentPriestBlessResult(result), result.state);
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
  await safeEditMessageText(ctx, presentRoguePickpocketResult(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildClassNoncombatRefreshKeyboard("rogue", callback.page)
  });

  if (result.state === "completed") {
    const notification = presentRoguePickpocketTargetNotification(result);
    if (notification) {
      await notifyTarget(
        ctx,
        result.attempt.targetTelegramUserId,
        notification,
        buildRogueRetaliationKeyboard(result)
      );
    }
  }
  await notifyActorAchievements(ctx, result.state === "completed" ? result.unlocks : []);
}

function buildClassNoncombatRefreshKeyboard(mode: "priest" | "rogue", page: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Оновити", makeClassNoncombatOpenCallbackData(mode, page));
}

async function editOpen(
  ctx: Context,
  service: ClassNoncombatService,
  telegramUserId: bigint,
  mode: "priest" | "rogue",
  page: number
): Promise<void> {
  const result = await service.openForTelegramUser(telegramUserId, mode, page);
  const keyboard = result.state === "ready" ? buildClassNoncombatKeyboard(result) : undefined;
  await safeEditMessageText(ctx, presentClassNoncombatOpen(result), keyboard
    ? { ...HTML_MESSAGE_OPTIONS, reply_markup: keyboard }
    : HTML_MESSAGE_OPTIONS);
}

async function editPriestResult(
  ctx: Context,
  service: ClassNoncombatService,
  telegramUserId: bigint,
  page: number,
  text: string,
  state: "completed" | "blocked"
): Promise<void> {
  if (state === "completed") {
    await safeEditMessageText(ctx, text, HTML_MESSAGE_OPTIONS);
    return;
  }

  const openResult = await service.openForTelegramUser(telegramUserId, "priest", page);
  const keyboard = openResult.state === "ready" ? buildClassNoncombatKeyboard(openResult) : undefined;
  await safeEditMessageText(ctx, text, keyboard
    ? { ...HTML_MESSAGE_OPTIONS, reply_markup: keyboard }
    : HTML_MESSAGE_OPTIONS);
}

async function handleRogueRetaliationDuel(
  ctx: Context,
  telegramUserId: bigint,
  callback: Extract<ClassNoncombatCallback, { type: "rogue-retaliation-duel" }>,
  service: ClassNoncombatService,
  duelService?: DuelChallengeService
): Promise<void> {
  if (!duelService) {
    await safeAnswerCallbackQuery(ctx, { text: "Бійцівський куток зараз не відповідає.", show_alert: true });
    return;
  }

  const claim = await service.claimRogueRetaliationForTelegramUser(telegramUserId, callback.retaliationToken);
  if (claim.state === "blocked") {
    if (claim.reason === "not-target") {
      await safeAnswerCallbackQuery(ctx, { text: "Це не ваша кишеня подала скаргу.", show_alert: true });
      return;
    }
    await safeAnswerCallbackQuery(ctx, { text: presentRogueRetaliationBlockedAnswer(claim) });
    await safeEditMessageText(ctx, presentRogueRetaliationBlocked(claim), HTML_MESSAGE_OPTIONS);
    return;
  }

  await safeAnswerCallbackQuery(ctx, { text: "Корчмар ставить відплату в дуельний протокол." });

  const created = await duelService.createTargetedChallengeForTelegramUser(
    claim.attempt.targetTelegramUserId,
    claim.attempt.actorTelegramUserId,
    {
      ignoreResourceWarning: true,
      mode: "quick"
    }
  );

  if (created.state !== "pending") {
    await safeEditMessageText(ctx, presentRogueRetaliationCreateBlocked(created), HTML_MESSAGE_OPTIONS);
    return;
  }

  await service.recordRogueRetaliationDuel(callback.retaliationToken, created.challenge.inviteToken);

  const accepted = await duelService.acceptForTelegramUser(
    claim.attempt.actorTelegramUserId,
    created.challenge.inviteToken,
    {
      confirmed: true,
      ignoreResourceWarning: true,
      expectedMode: "quick"
    }
  );
  const resultOptions = buildDuelResultMessageOptions(accepted);
  const text = [
    "⚡ <b>Кишенькова відплата</b>",
    "",
    presentDuelAccept(accepted)
  ].join("\n");

  await safeEditMessageText(ctx, text, resultOptions);

  if (accepted.state === "resolved") {
    await notifyTarget(
      ctx,
      claim.attempt.actorTelegramUserId,
      text,
      buildDuelResultKeyboard(accepted.challenge.inviteToken)
    );
  }
}

async function notifyTarget(
  ctx: Context,
  telegramUserId: bigint,
  text: string,
  replyMarkup?: InlineKeyboard
): Promise<void> {
  try {
    await ctx.api.sendMessage(Number(telegramUserId), text, replyMarkup
      ? { ...HTML_MESSAGE_OPTIONS, reply_markup: replyMarkup }
      : HTML_MESSAGE_OPTIONS);
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

function buildRogueRetaliationKeyboard(
  result: Extract<RoguePickpocketResult, { state: "completed" }>
): InlineKeyboard | undefined {
  if (
    !result.created ||
    result.attempt.outcome !== "noticed-success" ||
    result.attempt.stolenGold <= 0 ||
    !result.attempt.retaliationToken
  ) {
    return undefined;
  }

  return new InlineKeyboard().text(
    "⚡ Відплатити дуеллю",
    makeRogueRetaliationDuelCallbackData({
      retaliationToken: result.attempt.retaliationToken
    })
  );
}

function buildDuelResultMessageOptions(result: DuelAcceptResult) {
  return result.state === "resolved"
    ? { ...HTML_MESSAGE_OPTIONS, reply_markup: buildDuelResultKeyboard(result.challenge.inviteToken) }
    : HTML_MESSAGE_OPTIONS;
}

function presentRogueRetaliationCreateBlocked(
  result: Exclude<DuelTargetedCreateResult, Extract<DuelTargetedCreateResult, { state: "pending" }>>
): string {
  if (result.state === "target-not-found") {
    return [
      "⚡ <b>Відплата не знайшла адресата</b>",
      "",
      "Злодій уже вислизнув із придатної дуельної відстані. Корчмар підкреслив це як «образа з таймером»."
    ].join("\n");
  }

  if (result.state === "self-challenge") {
    return [
      "⚡ <b>Самовідплата не пройшла</b>",
      "",
      "Кишеня й пальці раптом виявилися в одному пригоднику. Корчмар відмовився це протоколювати."
    ].join("\n");
  }

  if (result.state === "no-character") {
    return "Квестарня не знайшла пригодника для відплати.";
  }

  if (result.state === "level-gated") {
    return [
      "⚡ <b>Дуельна відплата ще не доросла</b>",
      "",
      `Бійцівський куток пускає до дружніх дуелей із <b>${result.minLevel} рівня</b>.`
    ].join("\n");
  }

  if (result.state === "resource-warning") {
    return [
      "⚡ <b>Відплата перечепилася об кухоль</b>",
      "",
      "Корчмар раптом згадав про попередження щодо ресурсів. Спробуйте через Бійцівський куток."
    ].join("\n");
  }

  return "Відплата не склалася: Корчма не знайшла чистого рядка в дуельному протоколі.";
}

function presentRogueRetaliationBlockedAnswer(
  result: Extract<RogueRetaliationResult, { state: "blocked" }>
): string {
  if (result.reason === "used") {
    return "Цю відплату вже вписано.";
  }
  if (result.reason === "expired") {
    return "Ця відплата вже видихлась.";
  }
  return "Корчма не прийняла цю скаргу.";
}

function presentRogueRetaliationBlocked(
  result: Extract<RogueRetaliationResult, { state: "blocked" }>
): string {
  if (result.reason === "used") {
    return [
      "⚡ <b>Відплату вже вписано</b>",
      "",
      "Ця скарга вже стала дуельним протоколом. Другий раз Корчма не підпалює той самий рядок."
    ].join("\n");
  }

  if (result.reason === "expired") {
    return [
      "⏳ <b>Відплата видихлась</b>",
      "",
      "Скарга мала короткий термін дії. Корчмар уже прибрав її з краю стола."
    ].join("\n");
  }

  if (result.reason === "invalid-attempt" || result.reason === "actor-not-rogue") {
    return [
      "⚡ <b>Відплата не має підпису</b>",
      "",
      "Корчма перечитала протокол: ця кишеня не дає права на дуельну відплату."
    ].join("\n");
  }

  return [
    "⚡ <b>Відплата загубила квитанцію</b>",
    "",
    "Ця кнопка вже не схожа на справжню скаргу Корчми."
  ].join("\n");
}
