import type { Bot, Context } from "grammy";
import type { PartyRaidChatService, PartyRaidChatSubmitResult } from "../../services/partyRaidChatService";
import { telegramUserIdFromContext } from "../context";
import { isMainMenuLocationButtonText, mainMenuQuestButtonTexts } from "../keyboards/mainMenuKeyboard";
import { buildPartyRaidChatKeyboard } from "../keyboards/partySessionKeyboard";
import {
  presentPartyRaidChatCard,
  presentPartyRaidChatComposerPrompt,
  presentPartyRaidChatInputError,
  presentPartyRaidChatPlayerNotification
} from "../presenters/partyRaidChatPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { partyRaidChatTelegramGate } from "../partyRaidChatTelegramGate";

const HTML_OPTIONS = { parse_mode: "HTML" as const };
const FORCE_REPLY = {
  force_reply: true as const,
  input_field_placeholder: "До 93 символів…"
};

export function registerPartyRaidChatInput(bot: Bot, service: PartyRaidChatService): void {
  bot.command("cancel_raid_chat", async (ctx) => {
    const telegramUserId = telegramUserIdFromContext(ctx.from);
    const cancelled = telegramUserId ? await service.cancelCompose(telegramUserId) : false;
    await replyThroughRaidChatGate(ctx, cancelled
      ? "Рейдове повідомлення скасовано. Сам рейд нікуди не подівся."
      : "Активного рейдового повідомлення немає.");
  });

  if (service.areDevHelpersEnabled()) {
    bot.command("dev_raid_chat", async (ctx) => {
      await handleDevRaidChat(ctx, service);
    });
  }

  bot.on("message", async (ctx, next) => {
    const message = ctx.message;
    const text = "text" in message ? message.text : undefined;
    const telegramUserId = telegramUserIdFromContext(ctx.from);
    const replyTo = message.reply_to_message;
    if (
      !telegramUserId ||
      ctx.chat.type !== "private" ||
      !replyTo?.from?.is_bot ||
      text === undefined ||
      "forward_origin" in message ||
      hasOffsetZeroCommand("entities" in message ? message.entities : undefined) ||
      isPersistentMenuText(text)
    ) {
      await next();
      return;
    }

    const intent = await service.findBoundIntent(
      telegramUserId,
      BigInt(ctx.chat.id),
      replyTo.message_id
    );
    if (!intent) {
      await next();
      return;
    }

    let result: PartyRaidChatSubmitResult;
    try {
      result = await service.submitInput({
        telegramUserId,
        privateChatId: BigInt(ctx.chat.id),
        promptMessageId: replyTo.message_id,
        sourceMessageId: message.message_id,
        text,
        entityTypes: "entities" in message ? message.entities?.map((entity) => entity.type) : undefined
      });
    } catch (error) {
      console.error("Квестарня: тимчасовий збій рейд-чату.", { code: getSafeErrorCode(error) });
      await replyThroughRaidChatGate(ctx, "Рейдова канцелярія не відповіла. Спробуйте новий бланк.");
      await issueComposer(ctx, service, telegramUserId, intent.inviteToken);
      return;
    }
    await handleSubmitResult(ctx, service, telegramUserId, intent.inviteToken, replyTo.message_id, result);
  });
}

export async function handlePartyRaidChatOpen(
  ctx: Context,
  service: PartyRaidChatService,
  inviteToken: string
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);
  const view = telegramUserId ? await service.getAuthorizedView(telegramUserId, inviteToken) : null;
  if (!view) {
    await answerThroughRaidChatGate(ctx, {
      text: "Рейд-чат доступний лише учасникам цього рейду.",
      show_alert: true
    });
    return;
  }
  await answerThroughRaidChatGate(ctx);
  await partyRaidChatTelegramGate.enqueue(ctx.chat?.id ?? 0, () => safeEditMessageText(
    ctx,
    presentPartyRaidChatCard(view),
    {
      ...HTML_OPTIONS,
      reply_markup: buildPartyRaidChatKeyboard({
        token: view.inviteToken,
        writable: view.writable,
        active: view.lifecycle === "active",
        terminal: view.lifecycle === "terminal"
      })
    }
  ));
}

export async function handlePartyRaidChatCompose(
  ctx: Context,
  service: PartyRaidChatService,
  inviteToken: string
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);
  if (!telegramUserId || ctx.chat?.type !== "private") {
    await answerThroughRaidChatGate(ctx, {
      text: "Писати в рейд-чат можна лише в особистому чаті з Квестарнею.",
      show_alert: true
    });
    return;
  }
  const result = await issueComposer(ctx, service, telegramUserId, inviteToken);
  await answerThroughRaidChatGate(ctx, result
    ? undefined
    : { text: "Рейд-чат зараз не приймає повідомлення.", show_alert: true });
}

async function issueComposer(
  ctx: Context,
  service: PartyRaidChatService,
  telegramUserId: bigint,
  inviteToken: string
): Promise<boolean> {
  if (ctx.chat?.type !== "private") {
    return false;
  }
  const begun = await service.beginCompose(telegramUserId, inviteToken, BigInt(ctx.chat.id));
  if (begun.state !== "created") {
    return false;
  }
  const prompt = await partyRaidChatTelegramGate.enqueue(ctx.chat.id, () => ctx.reply(
    presentPartyRaidChatComposerPrompt(),
    { reply_markup: FORCE_REPLY }
  ));
  const bound = await service.bindComposePrompt(begun.intentId, begun.version, prompt.message_id);
  if (bound.state !== "bound") {
    await partyRaidChatTelegramGate.enqueue(ctx.chat.id, () => ctx.api.editMessageText(
      ctx.chat!.id,
      prompt.message_id,
      "Цей бланк уже застарів. Відкрийте новий із картки рейду."
    )).catch(() => undefined);
    return false;
  }
  return true;
}

async function handleSubmitResult(
  ctx: Context,
  service: PartyRaidChatService,
  telegramUserId: bigint,
  inviteToken: string,
  promptMessageId: number,
  result: PartyRaidChatSubmitResult
): Promise<void> {
  if (result.state === "accepted" || result.state === "duplicate-body") {
    const confirmation = result.state === "accepted"
      ? "✅ Повідомлення надіслано в рейд-чат."
      : "Таке повідомлення вже є в чаті.";
    await replyThroughRaidChatGate(ctx, confirmation);
    if (result.state === "accepted") {
      await notifyOtherRaidParticipants(ctx, result.notification);
    }
    await editComposerPromptBestEffort(ctx, promptMessageId, "Цей бланк уже використано.");
    return;
  }
  if (result.state === "invalid") {
    await replyThroughRaidChatGate(ctx, presentPartyRaidChatInputError(result.reason));
    await issueComposer(ctx, service, telegramUserId, inviteToken);
    return;
  }
  if (result.state === "rate-limited") {
    await replyThroughRaidChatGate(
      ctx,
      `Зачекайте ще ${formatPartyRaidChatWait(result.availableAt, result.now)}, тоді рейдова канцелярія прийме новий рядок.`
    );
    await issueComposer(ctx, service, telegramUserId, inviteToken);
    return;
  }
  if (result.state !== "already-consumed") {
    await editComposerPromptBestEffort(ctx, promptMessageId, "Рейд-чат уже не приймає цей бланк.");
  }
}

async function notifyOtherRaidParticipants(
  ctx: Context,
  notification: Extract<PartyRaidChatSubmitResult, { state: "accepted" }>["notification"]
): Promise<void> {
  const text = presentPartyRaidChatPlayerNotification(notification);
  await Promise.allSettled(notification.recipientTelegramUserIds.map((telegramUserId) =>
    partyRaidChatTelegramGate.enqueue(telegramUserId, () => ctx.api.sendMessage(
      Number(telegramUserId),
      text,
      HTML_OPTIONS
    ))
  ));
}

async function editComposerPromptBestEffort(ctx: Context, messageId: number, text: string): Promise<void> {
  if (!ctx.chat) {
    return;
  }
  await partyRaidChatTelegramGate.enqueue(ctx.chat.id, () =>
    ctx.api.editMessageText(ctx.chat!.id, messageId, text)
  ).catch(() => undefined);
}

async function handleDevRaidChat(ctx: Context, service: PartyRaidChatService): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);
  if (!telegramUserId || !service.areDevHelpersEnabled()) {
    return;
  }
  const [, action, target] = ctx.message?.text?.trim().split(/\s+/) ?? [];
  if (action === "fill") {
    const count = Math.max(1, Math.min(131, Number.parseInt(target ?? "14", 10) || 14));
    await replyThroughRaidChatGate(ctx, `Додано тестових рядків: ${await service.devFill(telegramUserId, count)}.`);
    return;
  }
  if (action === "clear") {
    await replyThroughRaidChatGate(
      ctx,
      await service.devClear(telegramUserId) ? "Рейд-чат очищено." : "Активний рейд-чат не знайдено."
    );
    return;
  }
  if (action === "expire" && (target === "composer" || target === "retention")) {
    await replyThroughRaidChatGate(
      ctx,
      await service.devExpire(telegramUserId, target) ? "Строк пересунуто для перевірки." : "Нічого не змінилося."
    );
    return;
  }
  await replyThroughRaidChatGate(ctx, "Вжиток: /dev_raid_chat fill [14..131] | clear | expire composer|retention");
}

async function replyThroughRaidChatGate(ctx: Context, text: string): Promise<void> {
  await partyRaidChatTelegramGate.enqueue(ctx.chat?.id ?? 0, () => ctx.reply(text));
}

async function answerThroughRaidChatGate(
  ctx: Context,
  options?: Parameters<typeof safeAnswerCallbackQuery>[1]
): Promise<void> {
  await partyRaidChatTelegramGate.enqueue(ctx.chat?.id ?? 0, () => safeAnswerCallbackQuery(ctx, options));
}

function getSafeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "unknown";
}

function hasOffsetZeroCommand(entities: readonly { type: string; offset: number }[] | undefined): boolean {
  return entities?.some((entity) => entity.type === "bot_command" && entity.offset === 0) === true;
}

function isPersistentMenuText(text: string): boolean {
  return isMainMenuLocationButtonText(text) || mainMenuQuestButtonTexts.includes(text);
}

export function formatPartyRaidChatWait(availableAt: Date, now: Date): string {
  const seconds = Math.max(1, Math.ceil((availableAt.getTime() - now.getTime()) / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) {
    return `${remainingSeconds} с`;
  }
  return remainingSeconds === 0
    ? `${minutes} хв`
    : `${minutes} хв ${remainingSeconds} с`;
}
