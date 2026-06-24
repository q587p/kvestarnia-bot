import { describe, expect, it } from "vitest";
import {
  makeItemGiftAcceptCallbackData,
  makeItemGiftCreateCallbackData,
  makeItemGiftOpenCallbackData,
  makeItemGiftTargetCallbackData,
  parseItemGiftCallbackData
} from "../../src/bot/callbacks/itemGiftCallbackData";

describe("item gift callback data", () => {
  it("round-trips compact target and item callbacks", () => {
    expect(parseItemGiftCallbackData(makeItemGiftOpenCallbackData())).toEqual({
      ok: true,
      value: { type: "open", page: 0 }
    });
    expect(parseItemGiftCallbackData(makeItemGiftTargetCallbackData(42n, 2))).toEqual({
      ok: true,
      value: { type: "select-target", targetTelegramUserId: 42n, page: 2 }
    });
    expect(parseItemGiftCallbackData(makeItemGiftCreateCallbackData(42n, 2, 13))).toEqual({
      ok: true,
      value: { type: "create", targetTelegramUserId: 42n, page: 2, index: 13 }
    });
  });

  it("round-trips opaque transfer tokens", () => {
    const token = "abcDEF12-3456_7890";

    expect(parseItemGiftCallbackData(makeItemGiftAcceptCallbackData(token))).toEqual({
      ok: true,
      value: { type: "accept", token }
    });
  });

  it("rejects long or malformed callback data", () => {
    expect(parseItemGiftCallbackData(`v1:gift:a:${"x".repeat(70)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
    expect(parseItemGiftCallbackData("v1:gift:i:not@:0:0")).toEqual({
      ok: false,
      error: "invalid-target"
    });
  });
});
