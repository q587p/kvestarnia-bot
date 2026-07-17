import type { Context } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearMessageFreshnessTracking,
  rememberLatestMessageForChat
} from "../../src/bot/messageFreshness";
import {
  isMessageNotModifiedError,
  isMessageUnavailableForEditError,
  safeEditMessageText
} from "../../src/bot/safeEditMessageText";

describe("safeEditMessageText", () => {
  afterEach(() => {
    clearMessageFreshnessTracking();
  });

  it("treats Telegram message-not-modified errors as unchanged", async () => {
    const ctx = {
      editMessageText: () =>
        Promise.reject(
          new Error(
            "Call to 'editMessageText' failed! (400: Bad Request: message is not modified)"
          )
        )
    } as unknown as Pick<Context, "editMessageText">;

    await expect(safeEditMessageText(ctx, "same")).resolves.toBe("unchanged");
  });

  it("edits a callback message when it is still the latest known chat message", async () => {
    rememberLatestMessageForChat(42, 10);
    const editMessageText = vi.fn(() => Promise.resolve(true));
    const reply = vi.fn(() => Promise.resolve(true));
    const ctx = {
      callbackQuery: {
        message: {
          message_id: 10,
          chat: { id: 42 }
        }
      },
      editMessageText,
      reply
    } as unknown as Pick<Context, "callbackQuery" | "editMessageText" | "reply">;

    await expect(safeEditMessageText(ctx, "new")).resolves.toBe("edited");
    expect(editMessageText).toHaveBeenCalledTimes(1);
    expect(reply).not.toHaveBeenCalled();
  });

  it("sends a new message when a callback tries to edit an older chat message", async () => {
    rememberLatestMessageForChat(42, 12);
    const editMessageText = vi.fn(() => Promise.resolve(true));
    const reply = vi.fn(() => Promise.resolve(true));
    const ctx = {
      callbackQuery: {
        message: {
          message_id: 10,
          chat: { id: 42 }
        }
      },
      editMessageText,
      reply
    } as unknown as Pick<Context, "callbackQuery" | "editMessageText" | "reply">;

    await expect(safeEditMessageText(ctx, "new")).resolves.toBe("sent");
    expect(reply).toHaveBeenCalledTimes(1);
    expect(editMessageText).not.toHaveBeenCalled();
  });

  it("rethrows other edit errors", async () => {
    const ctx = {
      editMessageText: () => Promise.reject(new Error("network is having a moment"))
    } as unknown as Pick<Context, "editMessageText">;

    await expect(safeEditMessageText(ctx, "new")).rejects.toThrow("network");
  });

  it("recognizes message-not-modified errors by message", () => {
    expect(isMessageNotModifiedError(new Error("message is not modified"))).toBe(true);
    expect(isMessageNotModifiedError(new Error("message to edit not found"))).toBe(false);
  });

  it("distinguishes deleted or invalid message references from retryable edit failures", () => {
    expect(isMessageUnavailableForEditError(new Error("message to edit not found"))).toBe(true);
    expect(isMessageUnavailableForEditError(new Error("Bad Request: MESSAGE_ID_INVALID"))).toBe(true);
    expect(isMessageUnavailableForEditError(new Error("Telegram gateway timeout"))).toBe(false);
    expect(isMessageUnavailableForEditError(new Error("message can't be edited"))).toBe(false);
  });
});
