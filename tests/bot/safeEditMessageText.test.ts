import type { Context } from "grammy";
import { describe, expect, it } from "vitest";
import {
  isMessageNotModifiedError,
  safeEditMessageText
} from "../../src/bot/safeEditMessageText";

describe("safeEditMessageText", () => {
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
});
