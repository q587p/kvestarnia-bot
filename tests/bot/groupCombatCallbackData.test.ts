import { describe, expect, it } from "vitest";
import {
  makeGroupCombatActionCallbackData,
  parseGroupCombatCallbackData
} from "../../src/bot/callbacks/groupCombatCallbackData";

describe("group combat callback data", () => {
  it("round-trips an explicit target index within Telegram's budget", () => {
    const data = makeGroupCombatActionCallbackData({
      token: "proof-token-13",
      turn: 23,
      action: "aid",
      targetIndex: 2
    });
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(parseGroupCombatCallbackData(data)).toEqual({
      ok: true,
      value: { type: "action", token: "proof-token-13", turn: 23, action: "aid", targetIndex: 2 }
    });
  });

  it("rejects malformed and oversized callbacks", () => {
    expect(parseGroupCombatCallbackData("v1:gc:a:bad:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData(`v1:gc:v:${"x".repeat(93)}`).ok).toBe(false);
  });
});
