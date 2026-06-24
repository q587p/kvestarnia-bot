import type { Context } from "grammy";
import type { ItemGiftCallback } from "../callbacks/itemGiftCallbackData";
import type { ItemTransferService } from "../../services/itemTransferService";
import {
  buildItemGiftCandidatesKeyboard,
  buildItemGiftCreateKeyboard,
  buildItemGiftOfferKeyboard,
  buildItemGiftResultKeyboard,
  buildItemGiftSelectionKeyboard
} from "../keyboards/itemGiftKeyboard";
import {
  presentItemGiftCandidates,
  presentItemGiftCreate,
  presentItemGiftNotification,
  presentItemGiftRespond,
  presentItemGiftSelection
} from "../presenters/itemGiftPresenter";
import { safeAnswerCallbackQuery } from "../safeAnswerCallbackQuery";
import { safeEditMessageText } from "../safeEditMessageText";
import { telegramUserIdFromContext } from "../context";

const HTML_MESSAGE_OPTIONS = {
  parse_mode: "HTML" as const
};

export async function handleItemGiftCallback(
  ctx: Context,
  callback: ItemGiftCallback,
  service: ItemTransferService
): Promise<void> {
  const telegramUserId = telegramUserIdFromContext(ctx.from);
  if (!telegramUserId) {
    await safeAnswerCallbackQuery(ctx, { text: "Квестарня не впізнала мандрівника.", show_alert: true });
    return;
  }

  if (callback.type === "open") {
    const result = await service.getCandidatesForTelegramUser(telegramUserId, callback.page);
    await safeAnswerCallbackQuery(ctx);
    await safeEditMessageText(ctx, presentItemGiftCandidates(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemGiftCandidatesKeyboard(result)
    });
    return;
  }

  if (callback.type === "select-target" || callback.type === "select-page") {
    const result = await service.getSelectionForTelegramUser(
      telegramUserId,
      callback.targetTelegramUserId,
      callback.page
    );
    await safeAnswerCallbackQuery(ctx, { show_alert: result.state !== "selection" });
    await safeEditMessageText(ctx, presentItemGiftSelection(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemGiftSelectionKeyboard(result)
    });
    return;
  }

  if (callback.type === "create") {
    const result = await service.createGiftForTelegramUser(
      telegramUserId,
      callback.targetTelegramUserId,
      callback.index,
      callback.page
    );
    await safeAnswerCallbackQuery(ctx, result.state === "created"
      ? { text: "Подарунок запропоновано.", show_alert: false }
      : { show_alert: true });
    await safeEditMessageText(ctx, presentItemGiftCreate(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemGiftCreateKeyboard(result)
    });

    if (result.state === "created") {
      await notifyGiftRecipient(ctx, result);
    }
    return;
  }

  const result =
    callback.type === "accept"
      ? await service.acceptGiftForTelegramUser(telegramUserId, callback.token)
      : callback.type === "decline"
        ? await service.declineGiftForTelegramUser(telegramUserId, callback.token)
        : await service.cancelGiftForTelegramUser(telegramUserId, callback.token);

  await safeAnswerCallbackQuery(ctx, result.state === "completed"
    ? { text: "Подарунок прийнято.", show_alert: false }
    : { show_alert: result.state !== "replayed" && result.state !== "declined" && result.state !== "cancelled" });
  await safeEditMessageText(ctx, presentItemGiftRespond(result), {
    ...HTML_MESSAGE_OPTIONS,
    reply_markup: buildItemGiftResultKeyboard(result)
  });
}

async function notifyGiftRecipient(
  ctx: Context,
  result: Extract<Awaited<ReturnType<ItemTransferService["createGiftForTelegramUser"]>>, { state: "created" }>
): Promise<void> {
  try {
    await ctx.api.sendMessage(Number(result.transfer.receiverTelegramUserId), presentItemGiftNotification(result), {
      ...HTML_MESSAGE_OPTIONS,
      reply_markup: buildItemGiftOfferKeyboard(result)
    });
  } catch {
    // Delivery is best-effort; the stored gift remains canonical.
  }
}
