import type { Context } from "grammy";
import type { ItemPostalCallback } from "../callbacks/itemPostalCallbackData";
import type { ItemTransferService } from "../../services/itemTransferService";
import {
  buildItemPostalConfirmKeyboard,
  buildItemPostalDraftKeyboard,
  buildItemPostalOfferKeyboard,
  buildItemPostalRecipientsKeyboard,
  buildItemPostalResultKeyboard
} from "../keyboards/itemPostalKeyboard";
import {
  presentItemPostalConfirm,
  presentItemPostalDraft,
  presentItemPostalNotification,
  presentItemPostalRecipients,
  presentItemPostalRespond
} from "../presenters/itemPostalPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { telegramUserIdFromContext } from "../context";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export async function handleItemPostalCallback(
  ctx: Context,
  callback: ItemPostalCallback,
  service: ItemTransferService
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);
  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Квестарня не впізнала мандрівника.", show_alert: true });
    return;
  }

  if (callback.type === "open") {
    const result = await service.getPostalRecipientsForTelegramUser(telegramUserId, callback.page);
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentItemPostalRecipients(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemPostalRecipientsKeyboard(result)
    });
    return;
  }

  if (callback.type === "recipient") {
    const result = await service.createPostalDraftForTelegramUser(
      telegramUserId,
      callback.receiverTelegramUserId,
      callback.page
    );
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "draft" });
    await safeEditMessageText(ctx, presentItemPostalDraft(result), {
      ...HTML_MESSAGE_OPTIONS,
      ...(result.state === "draft" ? { reply_markup: buildItemPostalDraftKeyboard(result) } : {})
    });
    return;
  }

  if (callback.type === "page") {
    const result = await service.getPostalDraftForTelegramUser(telegramUserId, callback.token, callback.page);
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "draft" });
    await safeEditMessageText(ctx, presentItemPostalDraft(result), {
      ...HTML_MESSAGE_OPTIONS,
      ...(result.state === "draft" ? { reply_markup: buildItemPostalDraftKeyboard(result) } : {})
    });
    return;
  }

  if (callback.type === "add" || callback.type === "quantity" || callback.type === "remove") {
    const result = callback.type === "add"
      ? await service.addPostalDraftLineForTelegramUser(
          telegramUserId,
          callback.token,
          callback.index,
          callback.selectionGuard,
          callback.page
        )
      : callback.type === "quantity"
        ? await service.changePostalDraftLineQuantityForTelegramUser(
            telegramUserId,
            callback.token,
            callback.lineIndex,
            callback.quantity,
            callback.page
          )
        : await service.removePostalDraftLineForTelegramUser(
            telegramUserId,
            callback.token,
            callback.lineIndex,
            callback.page
          );
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "draft" });
    await safeEditMessageText(ctx, presentItemPostalDraft(result), {
      ...HTML_MESSAGE_OPTIONS,
      ...(result.state === "draft" ? { reply_markup: buildItemPostalDraftKeyboard(result) } : {})
    });
    return;
  }

  if (callback.type === "confirm") {
    const result = await service.confirmPostalDraftForTelegramUser(telegramUserId, callback.token);
    await safeAnswerCallbackQuery(ctx, result.state === "created"
      ? { text: "Гонець прийняв пакунок.", show_alert: false }
      : { show_alert: true });
    await safeEditMessageText(ctx, presentItemPostalConfirm(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemPostalConfirmKeyboard(result)
    });

    if (result.state === "created") {
      await notifyPostalRecipient(ctx, result);
    }
    return;
  }

  const result =
    callback.type === "accept"
      ? await service.acceptPostalForTelegramUser(telegramUserId, callback.token)
      : callback.type === "decline"
        ? await service.declinePostalForTelegramUser(telegramUserId, callback.token)
        : await service.cancelPostalForTelegramUser(telegramUserId, callback.token);

  await safeAnswerCallbackQuery(ctx, result.state === "completed"
    ? { text: "Пакунок прийнято.", show_alert: false }
    : { show_alert: result.state !== "replayed" && result.state !== "declined" && result.state !== "cancelled" });
  await safeEditMessageText(ctx, presentItemPostalRespond(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemPostalResultKeyboard(result)
  });

  if (result.state === "cancelled" && result.transitioned) {
    await notifyPostalReceiverTerminal(ctx, result);
  } else if (result.state === "declined" && result.transitioned) {
    await notifyPostalSenderTerminal(ctx, result);
  }
}

async function notifyPostalRecipient(
  ctx: Context,
  result: Extract<Awaited<ReturnType<ItemTransferService["confirmPostalDraftForTelegramUser"]>>, { state: "created" }>
): Promise<void> {
  try {
    await ctx.api.sendMessage(Number(result.transfer.receiverTelegramUserId), presentItemPostalNotification(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemPostalOfferKeyboard(result)
    });
  } catch {
    // Delivery notice is best-effort; the stored postal order remains canonical.
  }
}

async function notifyPostalReceiverTerminal(
  ctx: Context,
  result: Extract<Awaited<ReturnType<ItemTransferService["cancelPostalForTelegramUser"]>>, { state: "cancelled" }>
): Promise<void> {
  try {
    await ctx.api.sendMessage(Number(result.transfer.receiverTelegramUserId), presentItemPostalRespond(result), {
      ...HTML_MESSAGE_OPTIONS
    });
  } catch {
    // Terminal notice is best-effort; the stored postal order remains canonical.
  }
}

async function notifyPostalSenderTerminal(
  ctx: Context,
  result: Extract<Awaited<ReturnType<ItemTransferService["declinePostalForTelegramUser"]>>, { state: "declined" }>
): Promise<void> {
  try {
    await ctx.api.sendMessage(Number(result.transfer.senderTelegramUserId), presentItemPostalRespond(result), {
      ...HTML_MESSAGE_OPTIONS
    });
  } catch {
    // Terminal notice is best-effort; the stored postal order remains canonical.
  }
}
