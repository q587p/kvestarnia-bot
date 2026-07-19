import { describe, expect, it } from "vitest";
import {
  countPartyRaidChatGraphemes,
  normalizePartyRaidChatText,
  validatePartyRaidChatText
} from "../../src/domain/partyRaidChat/partyRaidChatText";

describe("party raid chat text", () => {
  it("normalizes NFC and one-line whitespace while removing prohibited controls", () => {
    expect(normalizePartyRaidChatText("  И\u0306ой\t\n  текст\u0000\u200b\u202e  ")).toBe("Йой текст");
  });

  it("preserves composed emoji, variation selectors, flags and skin tones", () => {
    const text = "👨‍👩‍👧‍👦 🧙🏽‍♀️ ✈️ 🇺🇦";
    expect(normalizePartyRaidChatText(text)).toBe(text);
    expect(countPartyRaidChatGraphemes(text)).toBe(7);
  });

  it("accepts 93 graphemes and rejects 94", () => {
    expect(validatePartyRaidChatText("а".repeat(93))).toMatchObject({ ok: true, graphemeCount: 93 });
    expect(validatePartyRaidChatText("а".repeat(94))).toEqual({
      ok: false,
      reason: "too-long",
      graphemeCount: 94
    });
  });

  it("rejects content that normalizes to empty", () => {
    expect(validatePartyRaidChatText("\n\t\u200b")).toEqual({
      ok: false,
      reason: "empty",
      graphemeCount: 0
    });
  });
});
