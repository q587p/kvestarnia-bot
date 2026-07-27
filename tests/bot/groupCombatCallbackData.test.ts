import { describe, expect, it } from "vitest";
import {
  makeGroupCombatActionCallbackData,
  makeGroupCombatItemsMenuCallbackData,
  makeGroupCombatJournalCallbackData,
  makeGroupCombatStartCallbackData,
  makeGroupCombatStatisticsCallbackData,
  makeLeftPassageGroupCombatStartCallbackData,
  makeLeftPassagePartyInviteCallbackData,
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

  it("keeps the longest action callback at an exact measured byte budget", () => {
    const data = makeGroupCombatActionCallbackData({
      token: "abcdefghijklmnopqrstuvwx",
      turn: 1_679_615,
      action: "class",
      optionIndex: 1_679_615,
      targetIndex: 5
    });

    expect(Buffer.byteLength(data, "utf8")).toBe(46);
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
  });

  it("keeps left-passage invite and production start distinct and within Telegram's budget", () => {
    const invite = makeLeftPassagePartyInviteCallbackData("preview-token-13");
    const start = makeLeftPassageGroupCombatStartCallbackData("party-token-23");
    expect(Buffer.byteLength(invite)).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(start)).toBeLessThanOrEqual(64);
    expect(parseGroupCombatCallbackData(invite)).toEqual({
      ok: true,
      value: { type: "invite-left", token: "preview-token-13" }
    });
    expect(parseGroupCombatCallbackData(start)).toEqual({
      ok: true,
      value: { type: "start-left", token: "party-token-23" }
    });
  });

  it("round-trips a bounded journal page", () => {
    const data = makeGroupCombatJournalCallbackData("proof-token-13", 4);

    expect(parseGroupCombatCallbackData(data)).toEqual({
      ok: true,
      value: { type: "journal", token: "proof-token-13", page: 4 }
    });
  });

  it("round-trips the item menu and terminal statistics within Telegram's budget", () => {
    const items = makeGroupCombatItemsMenuCallbackData("proof-token-13", 23);
    const statistics = makeGroupCombatStatisticsCallbackData("proof-token-13");

    expect(Buffer.byteLength(items, "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(statistics, "utf8")).toBeLessThanOrEqual(64);
    expect(parseGroupCombatCallbackData(items)).toEqual({
      ok: true,
      value: { type: "items", token: "proof-token-13", turn: 23 }
    });
    expect(parseGroupCombatCallbackData(statistics)).toEqual({
      ok: true,
      value: { type: "statistics", token: "proof-token-13" }
    });
  });

  it("rejects malformed and oversized callbacks", () => {
    expect(parseGroupCombatCallbackData("v1:gc:a:bad:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v1:gc:a:proof-token-13:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:a:proof-token-13:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:a:proof-token-13:1:h:0:1").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:m:proof-token-13:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:v:proof-token-13").ok).toBe(false);
    expect(parseGroupCombatCallbackData(`v1:gc:v:${"x".repeat(93)}`).ok).toBe(false);
  });
});
