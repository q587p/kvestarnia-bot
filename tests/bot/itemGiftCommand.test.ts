import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handleItemGiftCallback } from "../../src/bot/commands/itemGiftCommand";
import type { ItemTransferRecord } from "../../src/db/repositories/itemTransferRepository";
import type { ItemTransferService } from "../../src/services/itemTransferService";

const TOKEN = "gift-token-1";

describe("handleItemGiftCallback", () => {
  it("notifies the receiver when the sender cancels a pending gift", async () => {
    const transfer = makeTransfer("cancelled");
    const service = {
      cancelGiftForTelegramUser: vi.fn().mockResolvedValue({
        state: "cancelled",
        transitioned: true,
        transfer
      })
    } as unknown as ItemTransferService;
    const { ctx, editMessageText, sendMessage } = createCallbackContext(1);

    await handleItemGiftCallback(ctx, { type: "cancel", token: TOKEN }, service);

    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(editMessageText.mock.calls[0]?.[1])).toContain("v1:place:current");
    expect(JSON.stringify(editMessageText.mock.calls[0]?.[1])).not.toContain("v1:place:bar");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(2);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("🎁 <b>Подарунок скасовано</b>");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Від: <b>Kyjivan BooksDragon</b>");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Кому: <b>Shannar de Kassal</b>");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Манатка: <b>Медаль «Не Помер Першим»</b> ×1");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).not.toContain("v1:gift:a");
  });

  it("does not notify the receiver again on replayed cancel", async () => {
    const service = {
      cancelGiftForTelegramUser: vi.fn().mockResolvedValue({
        state: "cancelled",
        transfer: makeTransfer("cancelled")
      })
    } as unknown as ItemTransferService;
    const { ctx, sendMessage } = createCallbackContext(1);

    await handleItemGiftCallback(ctx, { type: "cancel", token: TOKEN }, service);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("notifies the sender when the receiver declines a pending gift", async () => {
    const service = {
      declineGiftForTelegramUser: vi.fn().mockResolvedValue({
        state: "declined",
        transitioned: true,
        transfer: makeTransfer("declined")
      })
    } as unknown as ItemTransferService;
    const { ctx, sendMessage } = createCallbackContext(2);

    await handleItemGiftCallback(ctx, { type: "decline", token: TOKEN }, service);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("🎁 <b>Подарунок відхилено</b>");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Від: <b>Kyjivan BooksDragon</b>");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Кому: <b>Shannar de Kassal</b>");
    expect(JSON.stringify(sendMessage.mock.calls[0]?.[2])).not.toContain("v1:gift:c");
  });
});

function createCallbackContext(userId: number): {
  ctx: Context;
  editMessageText: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
} {
  const editMessageText = vi.fn().mockResolvedValue(true);
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 22 });
  const ctx = {
    from: {
      id: userId,
      is_bot: false,
      first_name: "Тест"
    },
    callbackQuery: {
      id: "callback-1",
      message: {
        message_id: 10,
        chat: {
          id: userId,
          type: "private"
        }
      }
    },
    answerCallbackQuery: vi.fn().mockResolvedValue(true),
    editMessageText,
    api: {
      sendMessage
    }
  } as unknown as Context;

  return { ctx, editMessageText, sendMessage };
}

function makeTransfer(status: "cancelled" | "declined"): ItemTransferRecord {
  const now = new Date("2026-06-24T12:00:00.000Z");

  return {
    id: "transfer-1",
    token: TOKEN,
    senderCharacterId: "sender",
    receiverCharacterId: "receiver",
    senderTelegramUserId: 1n,
    receiverTelegramUserId: 2n,
    senderName: "Kyjivan BooksDragon",
    receiverName: "Shannar de Kassal",
    senderRemortCount: 0,
    receiverRemortCount: 0,
    locationId: "location.korchma.hall",
    itemId: "item.medal-not-first-to-die",
    itemName: "Медаль «Не Помер Першим»",
    itemFingerprint: "abcdef1234567890",
    quantity: 1,
    status,
    result: { kind: status },
    expiresAt: new Date("2026-06-24T12:23:00.000Z"),
    completedAt: null,
    respondedAt: now,
    createdAt: now,
    updatedAt: now
  };
}
