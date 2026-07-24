import { describe, expect, it } from "vitest";
import {
  makeGroupCombatActionCallbackData,
  makeGroupCombatJournalCallbackData,
  makeGroupCombatStartCallbackData,
  parseGroupCombatCallbackData
} from "../../src/bot/callbacks/groupCombatCallbackData";

describe("group combat callback data", () => {
  it("round-trips the dev start token within Telegram's budget", () => {
    const data = makeGroupCombatStartCallbackData("proof-token-13");

    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(parseGroupCombatCallbackData(data)).toEqual({
      ok: true,
      value: { type: "start", token: "proof-token-13" }
    });
  });

  it("round-trips an explicit target index within Telegram's budget", () => {
    const data = makeGroupCombatActionCallbackData({
      token: "proof-token-13",
      turn: 23,
      action: "class",
      targetIndex: 2
    });
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(parseGroupCombatCallbackData(data)).toEqual({
      ok: true,
      value: { type: "action", token: "proof-token-13", turn: 23, action: "class", targetIndex: 2 }
    });
  });

  it("round-trips a bounded journal page", () => {
    const data = makeGroupCombatJournalCallbackData("proof-token-13", 4);

    expect(parseGroupCombatCallbackData(data)).toEqual({
      ok: true,
      value: { type: "journal", token: "proof-token-13", page: 4 }
    });
  });

  it("rejects malformed and oversized callbacks", () => {
    expect(parseGroupCombatCallbackData("v1:gc:a:bad:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v1:gc:a:proof-token-13:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:a:proof-token-13:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:a:proof-token-13:1:h:0:1").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:v:proof-token-13").ok).toBe(false);
    expect(parseGroupCombatCallbackData(`v1:gc:v:${"x".repeat(93)}`).ok).toBe(false);
  });
});
