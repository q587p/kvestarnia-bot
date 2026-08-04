import { describe, expect, it } from "vitest";
import {
  makeGroupCombatActionCallbackData,
  makeGroupCombatItemsMenuCallbackData,
  makeGroupCombatJournalCallbackData,
  makeGroupCombatStartCallbackData,
  makeGroupCombatStatisticsCallbackData,
  makeGroupCombatTargetBackCallbackData,
  makeGroupCombatTargetMenuCallbackData,
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

  it("round-trips distinct target-menu presentation callbacks within Telegram's budget", () => {
    const menu = makeGroupCombatTargetMenuCallbackData({
      token: "proof-token-13",
      turn: 23,
      action: "gear",
      optionIndex: 42,
      source: "reply-menu"
    });
    const back = makeGroupCombatTargetBackCallbackData({
      token: "proof-token-13",
      turn: 23,
      source: "reply-menu"
    });

    expect(Buffer.byteLength(menu, "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(back, "utf8")).toBeLessThanOrEqual(64);
    expect(parseGroupCombatCallbackData(menu)).toEqual({
      ok: true,
      value: {
        type: "target-menu",
        token: "proof-token-13",
        turn: 23,
        action: "gear",
        optionIndex: 42,
        source: "reply-menu"
      }
    });
    expect(parseGroupCombatCallbackData(back)).toEqual({
      ok: true,
      value: { type: "target-back", token: "proof-token-13", turn: 23, source: "reply-menu" }
    });
  });

  it("marks reply-menu actions and round-trips party retreat within Telegram's budget", () => {
    const menu = makeGroupCombatActionCallbackData({
      token: "proof-token-13",
      turn: 23,
      action: "class",
      targetIndex: 2,
      source: "reply-menu"
    });
    const flee = makeGroupCombatActionCallbackData({
      token: "proof-token-13",
      turn: 23,
      action: "flee",
      targetIndex: 0,
      source: "reply-menu"
    });

    expect(Buffer.byteLength(menu, "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(flee, "utf8")).toBeLessThanOrEqual(64);
    expect(parseGroupCombatCallbackData(menu)).toEqual({
      ok: true,
      value: {
        type: "action",
        token: "proof-token-13",
        turn: 23,
        action: "class",
        targetIndex: 2,
        source: "reply-menu"
      }
    });
    expect(parseGroupCombatCallbackData(flee)).toEqual({
      ok: true,
      value: {
        type: "action",
        token: "proof-token-13",
        turn: 23,
        action: "flee",
        targetIndex: 0,
        source: "reply-menu"
      }
    });
  });

  it("round-trips the item menu and terminal statistics within Telegram's budget", () => {
    const items = makeGroupCombatItemsMenuCallbackData("proof-token-13", 23);
    const statistics = makeGroupCombatStatisticsCallbackData("proof-token-13");

    expect(Buffer.byteLength(items, "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(statistics, "utf8")).toBeLessThanOrEqual(64);
    expect(parseGroupCombatCallbackData(items)).toEqual({
      ok: true,
      value: { type: "items", token: "proof-token-13", turn: 23, page: 0 }
    });
    expect(parseGroupCombatCallbackData(statistics)).toEqual({
      ok: true,
      value: { type: "statistics", token: "proof-token-13" }
    });
  });

  it("round-trips paged reply-menu item callbacks", () => {
    const data = makeGroupCombatItemsMenuCallbackData("proof-token-13", 23, 2, "reply-menu");
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
    expect(parseGroupCombatCallbackData(data)).toEqual({
      ok: true,
      value: { type: "items", token: "proof-token-13", turn: 23, page: 2, source: "reply-menu" }
    });
  });

  it("rejects malformed and oversized callbacks", () => {
    expect(parseGroupCombatCallbackData("v1:gc:a:bad:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v1:gc:a:proof-token-13:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:a:proof-token-13:1:a:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:a:proof-token-13:1:h:0:1").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:m:proof-token-13:0").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v2:gc:v:proof-token-13").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v5:gc:q:proof-token-13:1:g:0:c").ok).toBe(false);
    expect(parseGroupCombatCallbackData("v5:gc:b:proof-token-13:0:c").ok).toBe(false);
    expect(parseGroupCombatCallbackData(`v1:gc:v:${"x".repeat(93)}`).ok).toBe(false);
  });
});
