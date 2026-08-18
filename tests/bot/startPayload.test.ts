import { describe, expect, it } from "vitest";
import { parseStartPayload } from "../../src/bot/startPayload";

describe("start payload parser", () => {
  it("routes the support gratitude payload", () => {
    expect(parseStartPayload("support_thanks")).toEqual({ type: "support-thanks" });
  });

  it("accepts only the exact referral payload shape without shadowing other routes", () => {
    expect(parseStartPayload("ref1_abCD_123-xyZ7890")).toEqual({
      type: "referral",
      token: "abCD_123-xyZ7890"
    });
    for (const payload of [
      "ref1_short",
      "ref1_abCD_123-xyZ789",
      "ref1_abCD_123-xyZ78900",
      "ref1_abCD.123-xyZ7890",
      "REF1_abCD_123-xyZ7890"
    ]) {
      expect(parseStartPayload(payload)).toMatchObject({ type: "unknown" });
    }
  });

  it("keeps empty and unknown payloads safe", () => {
    expect(parseStartPayload(undefined)).toEqual({ type: "none" });
    const oldSupportPayload = ["barrel", "thanks"].join("_");

    expect(parseStartPayload(oldSupportPayload)).toEqual({
      type: "unknown",
      raw: oldSupportPayload,
      safe: true
    });
    expect(parseStartPayload("duel_abc123")).toEqual({
      type: "unknown",
      raw: "duel_abc123",
      safe: true
    });
    expect(parseStartPayload("duel_abc_DEF12")).toEqual({
      type: "duel",
      token: "abc_DEF12"
    });
    expect(parseStartPayload("duel_turnbased_abc_DEF12")).toEqual({
      type: "duel",
      token: "abc_DEF12",
      mode: "turn-based"
    });
    expect(parseStartPayload("duel_turnbased_abc123")).toEqual({
      type: "unknown",
      raw: "duel_turnbased_abc123",
      safe: true
    });
    expect(parseStartPayload("party_abCD_123-xy")).toEqual({
      type: "party",
      token: "abCD_123-xy"
    });
    expect(parseStartPayload("party_short")).toEqual({
      type: "unknown",
      raw: "party_short",
      safe: true
    });
    expect(parseStartPayload("guild_privateInviteCode93")).toEqual({
      type: "guild-invite",
      token: "privateInviteCode93"
    });
    expect(parseStartPayload("guild_short")).toEqual({
      type: "unknown",
      raw: "guild_short",
      safe: true
    });
    expect(parseStartPayload("nyz_left_attack_abCD_123-xy")).toEqual({
      type: "left-passage-attack",
      token: "abCD_123-xy"
    });
    expect(parseStartPayload("nyz_left_attack_short")).toEqual({
      type: "unknown",
      raw: "nyz_left_attack_short",
      safe: true
    });
    expect(parseStartPayload("game_12345678-1234-4234-9234-123456789abc")).toEqual({
      type: "tavern-game",
      token: "12345678-1234-4234-9234-123456789abc"
    });
    expect(parseStartPayload("game_not-a-table")).toEqual({
      type: "unknown",
      raw: "game_not-a-table",
      safe: true
    });
  });

  it("marks long or invalid payloads unsafe without throwing", () => {
    expect(parseStartPayload("x".repeat(80))).toEqual({
      type: "unknown",
      raw: "x".repeat(64),
      safe: false
    });
    expect(parseStartPayload("barrel<thanks>")).toMatchObject({
      type: "unknown",
      safe: false
    });
  });
});
