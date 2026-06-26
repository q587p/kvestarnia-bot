import { describe, expect, it } from "vitest";
import {
  makeShynokBardPerformanceApplaudCallbackData,
  makeShynokBardPerformanceStartCallbackData,
  makeShynokBardPerformanceTipCallbackData,
  makeShynokDrinkConfirmCallbackData,
  makeShynokDrinkPreviewCallbackData,
  makeShynokRoundConfirmCallbackData,
  makeShynokRoundReplacementConfirmCallbackData,
  makeShynokSaleAddCallbackData,
  makeShynokSaleConfirmCallbackData,
  parseShynokCallbackData
} from "../../src/bot/callbacks/shynokCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("shynokCallbackData", () => {
  const token = "12345678-1234-4234-9234-123456789abc";

  it("round-trips compact drink, round and sale callbacks", () => {
    expect(parseShynokCallbackData(makeShynokDrinkPreviewCallbackData("drink.thyme-tea"))).toEqual({
      ok: true,
      value: { type: "drink-preview", drinkKey: "drink.thyme-tea" }
    });
    expect(parseShynokCallbackData(makeShynokDrinkConfirmCallbackData(token))).toEqual({
      ok: true,
      value: { type: "drink-confirm", token }
    });
    expect(parseShynokCallbackData(makeShynokRoundConfirmCallbackData("fine", token))).toEqual({
      ok: true,
      value: { type: "round-confirm", tier: "fine", token }
    });
    expect(parseShynokCallbackData(makeShynokRoundReplacementConfirmCallbackData(token, "abcdef1234567890"))).toEqual({
      ok: true,
      value: { type: "round-replace-confirm", offerId: token, replacementGuard: "abcdef1234567890" }
    });
    expect(parseShynokCallbackData(makeShynokSaleAddCallbackData(token, 2, 4))).toEqual({
      ok: true,
      value: { type: "sale-add", token, page: 2, index: 4 }
    });
    expect(parseShynokCallbackData(makeShynokSaleConfirmCallbackData(token))).toEqual({
      ok: true,
      value: { type: "sale-confirm", token }
    });
    expect(parseShynokCallbackData(makeShynokBardPerformanceStartCallbackData())).toEqual({
      ok: true,
      value: { type: "bard-performance-start" }
    });
    expect(parseShynokCallbackData(makeShynokBardPerformanceApplaudCallbackData(token))).toEqual({
      ok: true,
      value: { type: "bard-performance-applaud", reactionId: token }
    });
    expect(parseShynokCallbackData(makeShynokBardPerformanceTipCallbackData(token, 13))).toEqual({
      ok: true,
      value: { type: "bard-performance-tip", reactionId: token, tipGold: 13 }
    });
  });

  it("rejects invalid or oversized callbacks", () => {
    expect(parseShynokCallbackData("v1:sh:dp:not-a-drink").ok).toBe(false);
    expect(parseShynokCallbackData("v1:sh:dc:not-a-token").ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:rr:${token}:not-a-guard`).ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:bt:${token}:2`).ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:dc:${"a".repeat(80)}`).ok).toBe(false);
  });

  it("keeps round replacement confirmation callbacks below Telegram limits", () => {
    expect(Buffer.byteLength(makeShynokRoundReplacementConfirmCallbackData(token, "abcdef1234567890"), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeShynokBardPerformanceTipCallbackData(token, 13), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });
});
