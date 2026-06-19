import { describe, expect, it } from "vitest";
import {
  makeNearbyDuelModeCallbackData,
  makeNearbyDuelOpenCallbackData,
  makeNearbyDuelSelectCallbackData,
  parseNearbyDuelCallbackData
} from "../../src/bot/callbacks/nearbyDuelCallbackData";

describe("nearby duel callback data", () => {
  it("parses open, select and mode callbacks", () => {
    expect(parseNearbyDuelCallbackData(makeNearbyDuelOpenCallbackData())).toEqual({
      ok: true,
      value: { type: "open", page: 0 }
    });
    expect(parseNearbyDuelCallbackData(makeNearbyDuelOpenCallbackData(12))).toEqual({
      ok: true,
      value: { type: "open", page: 12 }
    });
    expect(parseNearbyDuelCallbackData(makeNearbyDuelSelectCallbackData(42n, 3))).toEqual({
      ok: true,
      value: { type: "select", targetTelegramUserId: 42n, page: 3 }
    });
    expect(parseNearbyDuelCallbackData(makeNearbyDuelModeCallbackData(42n, "quick"))).toEqual({
      ok: true,
      value: {
        type: "mode",
        targetTelegramUserId: 42n,
        mode: "quick",
        ignoreResourceWarning: false,
        page: 0
      }
    });
    expect(parseNearbyDuelCallbackData(makeNearbyDuelModeCallbackData(42n, "turn-based", true, 3))).toEqual({
      ok: true,
      value: {
        type: "mode",
        targetTelegramUserId: 42n,
        mode: "turn-based",
        ignoreResourceWarning: true,
        page: 3
      }
    });
  });

  it("keeps generated callback data below Telegram limits", () => {
    expect(Buffer.byteLength(makeNearbyDuelSelectCallbackData(999999999999n, 42), "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(makeNearbyDuelModeCallbackData(999999999999n, "turn-based", true), "utf8")).toBeLessThanOrEqual(64);
  });

  it("rejects invalid callbacks", () => {
    expect(parseNearbyDuelCallbackData("v0:nd:open")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseNearbyDuelCallbackData("v1:nd:s:not-ok:0")).toEqual({
      ok: false,
      error: "invalid-target"
    });
    expect(parseNearbyDuelCallbackData("v1:nd:m:16:x")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });
});
