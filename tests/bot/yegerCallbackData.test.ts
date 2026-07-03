import { describe, expect, it } from "vitest";
import {
  makeYegerBandagesCallbackData,
  makeYegerBuyBandageCallbackData,
  makeYegerCancelBandagePurchaseCallbackData,
  makeYegerConfirmBandagePurchaseCallbackData,
  makeYegerFreeBandageCallbackData,
  makeYegerHelpCallbackData,
  makeYegerOpenCallbackData,
  makeYegerOutsideCallbackData,
  makeYegerQuestCallbackData,
  makeYegerStartCallbackData,
  makeYegerTrackCallbackData,
  makeYegerTurnInCallbackData,
  parseYegerCallbackData
} from "../../src/bot/callbacks/yegerCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("Yeger callback data", () => {
  it("parses the first quest callbacks", () => {
    expect(parseYegerCallbackData(makeYegerOpenCallbackData())).toEqual({
      ok: true,
      value: { type: "open" }
    });
    expect(parseYegerCallbackData(makeYegerStartCallbackData())).toEqual({
      ok: true,
      value: { type: "start", questId: "u1" }
    });
    expect(parseYegerCallbackData(makeYegerQuestCallbackData())).toEqual({
      ok: true,
      value: { type: "quest", questId: "u1" }
    });
    expect(parseYegerCallbackData(makeYegerOutsideCallbackData())).toEqual({
      ok: true,
      value: { type: "outside", questId: "u1" }
    });
    expect(parseYegerCallbackData(makeYegerTrackCallbackData())).toEqual({
      ok: true,
      value: { type: "track", questId: "u1" }
    });
    expect(parseYegerCallbackData(makeYegerTurnInCallbackData())).toEqual({
      ok: true,
      value: { type: "turn-in", questId: "u1" }
    });
    expect(parseYegerCallbackData(makeYegerHelpCallbackData())).toEqual({
      ok: true,
      value: { type: "help" }
    });
    expect(parseYegerCallbackData(makeYegerBandagesCallbackData())).toEqual({
      ok: true,
      value: { type: "bandages" }
    });
    expect(parseYegerCallbackData(makeYegerBuyBandageCallbackData())).toEqual({
      ok: true,
      value: { type: "buy-bandage-preview", targetQuantity: 1 }
    });
    expect(parseYegerCallbackData(makeYegerBuyBandageCallbackData(93))).toEqual({
      ok: true,
      value: { type: "buy-bandage-preview", targetQuantity: 93 }
    });
    expect(parseYegerCallbackData("v1:ygr:buy:bdg")).toEqual({
      ok: true,
      value: { type: "buy-bandage-preview", targetQuantity: 1 }
    });
    expect(parseYegerCallbackData(makeYegerFreeBandageCallbackData())).toEqual({
      ok: true,
      value: { type: "free-bandage", kind: "bandage" }
    });
    expect(parseYegerCallbackData(makeYegerFreeBandageCallbackData("dense-bandage"))).toEqual({
      ok: true,
      value: { type: "free-bandage", kind: "dense-bandage" }
    });
    expect(parseYegerCallbackData(makeYegerFreeBandageCallbackData("field-kit"))).toEqual({
      ok: true,
      value: { type: "free-bandage", kind: "field-kit" }
    });
  });

  it("parses opaque bandage purchase confirm and cancel tokens", () => {
    const token = "123e4567-e89b-42d3-a456-426614174000";

    expect(parseYegerCallbackData(makeYegerConfirmBandagePurchaseCallbackData(token))).toEqual({
      ok: true,
      value: { type: "buy-bandage-confirm", token }
    });
    expect(parseYegerCallbackData(makeYegerCancelBandagePurchaseCallbackData(token))).toEqual({
      ok: true,
      value: { type: "buy-bandage-cancel", token }
    });
  });

  it("keeps generated callbacks within the Telegram limit", () => {
    for (const callback of [
      makeYegerOpenCallbackData(),
      makeYegerQuestCallbackData(),
      makeYegerOutsideCallbackData(),
      makeYegerStartCallbackData(),
      makeYegerTrackCallbackData(),
      makeYegerTurnInCallbackData(),
      makeYegerHelpCallbackData(),
      makeYegerBandagesCallbackData(),
      makeYegerBuyBandageCallbackData(),
      makeYegerBuyBandageCallbackData(5),
      makeYegerBuyBandageCallbackData(17),
      makeYegerBuyBandageCallbackData(93),
      makeYegerFreeBandageCallbackData(),
      makeYegerFreeBandageCallbackData("dense-bandage"),
      makeYegerFreeBandageCallbackData("field-kit"),
      makeYegerConfirmBandagePurchaseCallbackData("123e4567-e89b-42d3-a456-426614174000"),
      makeYegerCancelBandagePurchaseCallbackData("123e4567-e89b-42d3-a456-426614174000")
    ]) {
      expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
  });

  it("rejects invalid versions, prefixes, quest ids, and overlong payloads", () => {
    expect(parseYegerCallbackData("v2:ygr:open")).toEqual({ ok: false, error: "invalid-version" });
    expect(parseYegerCallbackData("v1:hunt:open")).toEqual({ ok: false, error: "invalid-prefix" });
    expect(parseYegerCallbackData("v1:ygr:start:u2")).toEqual({ ok: false, error: "invalid-quest" });
    expect(parseYegerCallbackData("v1:ygr:dance:u1")).toEqual({ ok: false, error: "invalid-action" });
    expect(parseYegerCallbackData(`v1:ygr:help:${"a".repeat(80)}`)).toEqual({ ok: false, error: "too-long" });
  });
});
