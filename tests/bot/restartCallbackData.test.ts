import { describe, expect, it } from "vitest";
import {
  makeRestartCallbackData,
  parseRestartCallbackData
} from "../../src/bot/callbacks/restartCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("restart callback data", () => {
  it.each(["confirm", "cancel"] as const)("parses valid %s callbacks", (action) => {
    const data = makeRestartCallbackData(action);

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseRestartCallbackData(data)).toEqual({ ok: true, value: action });
  });

  it("rejects invalid data", () => {
    expect(parseRestartCallbackData("v0:restart:confirm").ok).toBe(false);
    expect(parseRestartCallbackData("v1:restart:nope").ok).toBe(false);
    expect(parseRestartCallbackData("v1:menu:confirm").ok).toBe(false);
  });
});
