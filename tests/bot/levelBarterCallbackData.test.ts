import { describe, expect, it } from "vitest";
import {
  makeLevelBarterAutoCallbackData,
  makeLevelBarterConfirmCallbackData,
  makeLevelBarterOpenCallbackData,
  parseLevelBarterCallbackData
} from "../../src/bot/callbacks/levelBarterCallbackData";

describe("level barter callback data", () => {
  it("builds compact valid callbacks", () => {
    const token = "abcdef1234567890";
    const callbacks = [
      makeLevelBarterOpenCallbackData(),
      makeLevelBarterAutoCallbackData(),
      makeLevelBarterConfirmCallbackData(token)
    ];

    for (const callback of callbacks) {
      expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(64);
      expect(parseLevelBarterCallbackData(callback).ok).toBe(true);
    }
  });

  it("parses confirm tokens", () => {
    expect(parseLevelBarterCallbackData("v1:lvlx:confirm:abcdef1234567890")).toEqual({
      ok: true,
      value: {
        type: "confirm",
        token: "abcdef1234567890"
      }
    });
  });

  it("rejects malformed or too-long payloads", () => {
    expect(parseLevelBarterCallbackData("v2:lvlx:open").ok).toBe(false);
    expect(parseLevelBarterCallbackData("v1:lvlx:confirm:not-a-token").ok).toBe(false);
    expect(parseLevelBarterCallbackData("v1:lvlx:auto:extra").ok).toBe(false);
    expect(parseLevelBarterCallbackData(`v1:lvlx:confirm:${"a".repeat(80)}`).ok).toBe(false);
    expect(() => makeLevelBarterConfirmCallbackData("a".repeat(80))).toThrow(RangeError);
  });
});
