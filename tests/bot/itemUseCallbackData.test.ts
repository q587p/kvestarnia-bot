import { describe, expect, it } from "vitest";
import {
  makeItemUseCancelCallbackData,
  makeItemUseConfirmCallbackData,
  makeItemUsePreviewCallbackData,
  makeItemUseRestoreToFullCallbackData,
  parseItemUseCallbackData
} from "../../src/bot/callbacks/itemUseCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("item use callback data", () => {
  it("round-trips preview, confirm and cancel callbacks under Telegram limit", () => {
    const token = "123e4567-e89b-12d3-a456-426614174000";
    const callbacks = [
      makeItemUsePreviewCallbackData("item.responsible-panic-bandage"),
      makeItemUseRestoreToFullCallbackData("item.responsible-panic-bandage"),
      makeItemUseConfirmCallbackData(token),
      makeItemUseCancelCallbackData(token)
    ];

    for (const callback of callbacks) {
      expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
      expect(parseItemUseCallbackData(callback).ok).toBe(true);
    }

    expect(parseItemUseCallbackData(callbacks[0])).toEqual({
      ok: true,
      value: { type: "preview", itemId: "item.responsible-panic-bandage" }
    });
    expect(parseItemUseCallbackData(callbacks[1])).toEqual({
      ok: true,
      value: { type: "restore-to-full", itemId: "item.responsible-panic-bandage" }
    });
    expect(parseItemUseCallbackData(callbacks[2])).toEqual({
      ok: true,
      value: { type: "confirm", token }
    });
    expect(parseItemUseCallbackData(callbacks[3])).toEqual({
      ok: true,
      value: { type: "cancel", token }
    });
  });

  it("rejects malformed tokens and unknown item ids", () => {
    expect(parseItemUseCallbackData("v1:use:ok:not-a-token")).toEqual({ ok: false });
    expect(parseItemUseCallbackData("v1:use:p:bad")).toEqual({ ok: false });
    expect(parseItemUseCallbackData("v1:use:full:bad")).toEqual({ ok: false });
  });
});
