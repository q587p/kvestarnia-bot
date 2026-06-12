import { describe, expect, it } from "vitest";
import {
  makeMenuCallbackData,
  parseMenuCallbackData
} from "../../src/bot/callbacks/menuCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("menu callback data", () => {
  it.each(["hero", "help", "tavern"] as const)("parses valid %s callbacks", (action) => {
    const data = makeMenuCallbackData(action);

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseMenuCallbackData(data)).toEqual({ ok: true, value: action });
  });

  it("rejects invalid data", () => {
    expect(parseMenuCallbackData("v0:menu:hero").ok).toBe(false);
    expect(parseMenuCallbackData("v1:menu:nope").ok).toBe(false);
    expect(parseMenuCallbackData("v1:other:hero").ok).toBe(false);
  });
});
