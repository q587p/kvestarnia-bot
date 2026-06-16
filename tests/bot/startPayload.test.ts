import { describe, expect, it } from "vitest";
import { parseStartPayload } from "../../src/bot/startPayload";

describe("start payload parser", () => {
  it("routes the support gratitude payload", () => {
    expect(parseStartPayload("support_thanks")).toEqual({ type: "support-thanks" });
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
