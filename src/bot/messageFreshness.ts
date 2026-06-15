import type { Bot, Context } from "grammy";

type ChatId = string | number | bigint;

const latestMessageIdsByChat = new Map<string, number>();

export type CallbackMessageFreshness = "fresh" | "stale" | "unknown";

export function installMessageFreshnessTracking(bot: Bot): void {
  bot.use(async (ctx, next) => {
    rememberContextMessage(ctx);
    await next();
  });

  bot.api.config.use(async (prev, method, payload, signal) => {
    const result = await prev(method, payload, signal);

    if (method === "sendMessage") {
      rememberTelegramApiMessage(result);
    }

    return result;
  });
}

export function getCallbackMessageFreshness(
  ctx: Partial<Pick<Context, "callbackQuery">>
): CallbackMessageFreshness {
  const message = ctx.callbackQuery?.message;
  const chatId = message?.chat.id;
  const messageId = message?.message_id;

  if (chatId === undefined || messageId === undefined) {
    return "unknown";
  }

  const latestMessageId = latestMessageIdsByChat.get(toChatKey(chatId));

  if (latestMessageId === undefined) {
    return "unknown";
  }

  return messageId >= latestMessageId ? "fresh" : "stale";
}

export function rememberLatestMessageForChat(chatId: ChatId, messageId: number): void {
  const key = toChatKey(chatId);
  const current = latestMessageIdsByChat.get(key);

  if (current === undefined || messageId > current) {
    latestMessageIdsByChat.set(key, messageId);
  }
}

export function clearMessageFreshnessTracking(): void {
  latestMessageIdsByChat.clear();
}

function rememberContextMessage(ctx: Context): void {
  const message = ctx.message;

  if (message?.chat.id !== undefined && message.message_id !== undefined) {
    rememberLatestMessageForChat(message.chat.id, message.message_id);
  }
}

function rememberTelegramApiMessage(result: unknown): void {
  const maybeRawResult = result as { result?: unknown };
  const message = isTelegramMessage(maybeRawResult.result) ? maybeRawResult.result : result;

  if (isTelegramMessage(message)) {
    rememberLatestMessageForChat(message.chat.id, message.message_id);
  }
}

function isTelegramMessage(value: unknown): value is { chat: { id: ChatId }; message_id: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeMessage = value as {
    chat?: { id?: ChatId };
    message_id?: unknown;
  };

  return maybeMessage.chat?.id !== undefined && typeof maybeMessage.message_id === "number";
}

function toChatKey(chatId: ChatId): string {
  return chatId.toString();
}
