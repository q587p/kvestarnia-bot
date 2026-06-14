import { describe, expect, it } from "vitest";
import {
  makeHuntActionCallbackData,
  makeHuntViewCallbackData,
  parseHuntCallbackData
} from "../../src/bot/callbacks/huntCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("hunt callback data", () => {
  it("parses view and action callbacks", () => {
    expect(parseHuntCallbackData(makeHuntViewCallbackData("2026-06-14"))).toEqual({
      ok: true,
      value: {
        type: "view",
        localDate: "2026-06-14"
      }
    });
    expect(parseHuntCallbackData(makeHuntActionCallbackData("2026-06-14", "strike"))).toEqual({
      ok: true,
      value: {
        type: "action",
        localDate: "2026-06-14",
        action: "strike"
      }
    });
  });

  it.each(["strike", "trick", "retreat"] as const)("keeps %s callback within Telegram limit", (action) => {
    expect(Buffer.byteLength(makeHuntActionCallbackData("2026-06-14", action), "utf8")).toBeLessThanOrEqual(
      TELEGRAM_CALLBACK_DATA_LIMIT
    );
  });

  it("rejects invalid versions, dates, actions, prefixes, and overlong data", () => {
    expect(parseHuntCallbackData("v2:hunt:act:2026-06-14:strike")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseHuntCallbackData("v1:hunt:act:14-06-2026:strike")).toEqual({
      ok: false,
      error: "invalid-date"
    });
    expect(parseHuntCallbackData("v1:hunt:act:2026-06-14:dance")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parseHuntCallbackData("v1:fight:mimic:attack")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(parseHuntCallbackData(`v1:hunt:act:2026-06-14:${"a".repeat(80)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
  });
});
