import { describe, expect, it } from "vitest";
import {
  makeDevResetCallbackData,
  parseDevResetCallbackData
} from "../../src/bot/callbacks/devResetCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("dev reset callback data", () => {
  it.each(["confirm", "cancel"] as const)("parses valid %s callbacks", (action) => {
    const data = makeDevResetCallbackData(action);

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseDevResetCallbackData(data)).toEqual({ ok: true, value: action });
  });

  it("rejects invalid data", () => {
    expect(parseDevResetCallbackData("v0:devreset:confirm").ok).toBe(false);
    expect(parseDevResetCallbackData("v1:devreset:nope").ok).toBe(false);
    expect(parseDevResetCallbackData("v1:menu:confirm").ok).toBe(false);
  });
});
