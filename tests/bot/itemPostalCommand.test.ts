import type { Context } from "grammy";
import { describe, expect, it, vi } from "vitest";
import { handleItemPostalCallback } from "../../src/bot/commands/itemPostalCommand";
import type { ItemTransferRecord, ItemTransferStatus } from "../../src/db/repositories/itemTransferRepository";
import type { ItemTransferService } from "../../src/services/itemTransferService";

const TOKEN = "postal-token-1";

describe("handleItemPostalCallback", () => {
  it("does not notify the receiver when the sender cancels a draft package", async () => {
    const service = serviceWith({
      cancelPostalForTelegramUser: vi.fn().mockResolvedValue({
        state: "cancelled",
        transitioned: true,
        transitionedFrom: "draft",
        transfer: makePostalTransfer("cancelled")
      })
    });
    const { ctx, sendMessage } = createCallbackContext(1);

    await handleItemPostalCallback(ctx, { type: "cancel", token: TOKEN }, service);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("notifies the receiver once when the sender cancels a sent pending package", async () => {
    const service = serviceWith({
      cancelPostalForTelegramUser: vi.fn().mockResolvedValue({
        state: "cancelled",
        transitioned: true,
        transitionedFrom: "pending",
        transfer: makePostalTransfer("cancelled")
      })
    });
    const { ctx, sendMessage } = createCallbackContext(1);

    await handleItemPostalCallback(ctx, { type: "cancel", token: TOKEN }, service);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(2);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("📮 <b>Пакунок скасовано</b>");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Кому: <b>Shannar de Kassal</b>");
  });

  it("notifies the sender once when the receiver declines a pending package", async () => {
    const service = serviceWith({
      declinePostalForTelegramUser: vi.fn().mockResolvedValue({
        state: "declined",
        transitioned: true,
        transitionedFrom: "pending",
        transfer: makePostalTransfer("declined")
      })
    });
    const { ctx, sendMessage } = createCallbackContext(2);

    await handleItemPostalCallback(ctx, { type: "decline", token: TOKEN }, service);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0]).toBe(1);
    expect(sendMessage.mock.calls[0]?.[1]).toContain("📮 <b>Пакунок відхилено</b>");
    expect(sendMessage.mock.calls[0]?.[1]).toContain("Від: <b>Kyjivan BooksDragon</b>");
  });

  it("does not send terminal notices again on replayed callbacks", async () => {
    const cancelService = serviceWith({
      cancelPostalForTelegramUser: vi.fn().mockResolvedValue({
        state: "cancelled",
        transfer: makePostalTransfer("cancelled")
      })
    });
    const declineService = serviceWith({
      declinePostalForTelegramUser: vi.fn().mockResolvedValue({
        state: "declined",
        transfer: makePostalTransfer("declined")
      })
    });
    const cancelContext = createCallbackContext(1);
    const declineContext = createCallbackContext(2);

    await handleItemPostalCallback(cancelContext.ctx, { type: "cancel", token: TOKEN }, cancelService);
    await handleItemPostalCallback(declineContext.ctx, { type: "decline", token: TOKEN }, declineService);

    expect(cancelContext.sendMessage).not.toHaveBeenCalled();
    expect(declineContext.sendMessage).not.toHaveBeenCalled();
  });
});

function serviceWith(overrides: Partial<ItemTransferService>): ItemTransferService {
  return overrides as ItemTransferService;
}

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

function makePostalTransfer(status: Extract<ItemTransferStatus, "cancelled" | "declined">): ItemTransferRecord {
  const now = new Date("2026-06-29T12:00:00.000Z");

  return {
    id: "postal-transfer-1",
    token: TOKEN,
    transferKind: "postal",
    senderCharacterId: "sender",
    receiverCharacterId: "receiver",
    senderTelegramUserId: 1n,
    receiverTelegramUserId: 2n,
    senderName: "Kyjivan BooksDragon",
    receiverName: "Shannar de Kassal",
    senderRemortCount: 0,
    receiverRemortCount: 0,
    locationId: null,
    itemId: "postal-package",
    itemName: "Поштовий пакунок",
    itemFingerprint: "postal-package",
    quantity: 1,
    packageLines: [{
      itemId: "item.lavash-proof",
      itemName: "Підозрілий лавашний доказ",
      quantity: 1,
      itemFingerprint: "lavash-proof-fingerprint",
      unitGoldValue: 4,
      observedQuantity: 1,
      tags: []
    }],
    deliveryFeeGold: 6,
    status,
    result: { kind: status },
    expiresAt: new Date("2026-07-06T12:00:00.000Z"),
    completedAt: null,
    respondedAt: now,
    createdAt: now,
    updatedAt: now
  };
}
