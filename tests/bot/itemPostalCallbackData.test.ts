import { describe, expect, it } from "vitest";
import {
  makeItemPostalAcceptCallbackData,
  makeItemPostalAddCallbackData,
  makeItemPostalOpenCallbackData,
  makeItemPostalQuantityCallbackData,
  makeItemPostalRecipientCallbackData,
  parseItemPostalCallbackData
} from "../../src/bot/callbacks/itemPostalCallbackData";

describe("item postal callback data", () => {
  it("round-trips compact postal callbacks", () => {
    expect(parseItemPostalCallbackData(makeItemPostalOpenCallbackData())).toEqual({
      ok: true,
      value: { type: "open", page: 0, section: "recipients" }
    });
    expect(parseItemPostalCallbackData(makeItemPostalOpenCallbackData(2, "transit"))).toEqual({
      ok: true,
      value: { type: "open", page: 2, section: "transit" }
    });
    expect(parseItemPostalCallbackData(makeItemPostalOpenCallbackData(3, "history"))).toEqual({
      ok: true,
      value: { type: "open", page: 3, section: "history" }
    });
    expect(parseItemPostalCallbackData(makeItemPostalRecipientCallbackData(42n, 2))).toEqual({
      ok: true,
      value: { type: "recipient", receiverTelegramUserId: 42n, page: 2 }
    });
    expect(parseItemPostalCallbackData(makeItemPostalAddCallbackData("abcDEF12_3456789012", 2, 4, "guardABC1234"))).toEqual({
      ok: true,
      value: {
        type: "add",
        token: "abcDEF12_3456789012",
        page: 2,
        index: 4,
        selectionGuard: "guardABC1234"
      }
    });
    expect(parseItemPostalCallbackData(makeItemPostalQuantityCallbackData("abcDEF12_3456789012", 4, 93, 2))).toEqual({
      ok: true,
      value: { type: "quantity", token: "abcDEF12_3456789012", lineIndex: 4, quantity: 93, page: 2 }
    });
  });

  it("keeps guarded add callback data within Telegram limits", () => {
    const data = makeItemPostalAddCallbackData("abcDEF12_3456789012", 999, 999, "abcDEF12_345");

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
  });

  it("round-trips opaque postal tokens", () => {
    expect(parseItemPostalCallbackData(makeItemPostalAcceptCallbackData("abcDEF12_3456789012"))).toEqual({
      ok: true,
      value: { type: "accept", token: "abcDEF12_3456789012" }
    });
  });

  it("rejects long or malformed callback data", () => {
    expect(parseItemPostalCallbackData(`v1:post:ok:${"x".repeat(70)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
    expect(parseItemPostalCallbackData("v1:post:r:not@:0")).toEqual({
      ok: false,
      error: "invalid-target"
    });
    expect(parseItemPostalCallbackData("v1:post:a:abcDEF12:0:0:not*guard")).toEqual({
      ok: false,
      error: "invalid-selection"
    });
  });
});
