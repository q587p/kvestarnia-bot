import { describe, expect, it } from "vitest";
import {
  HELP_PAGES,
  makeHelpCallbackData,
  parseHelpCallbackData
} from "../../src/bot/callbacks/helpCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("help callback data", () => {
  it.each(HELP_PAGES)("parses the %s page within Telegram limits", (page) => {
    const data = makeHelpCallbackData(page);

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseHelpCallbackData(data)).toEqual({ ok: true, value: page });
  });

  it("rejects malformed and unknown pages", () => {
    expect(parseHelpCallbackData("v0:help:menu").ok).toBe(false);
    expect(parseHelpCallbackData("v1:other:menu").ok).toBe(false);
    expect(parseHelpCallbackData("v1:help:nope").ok).toBe(false);
    expect(parseHelpCallbackData("v1:help:menu:extra").ok).toBe(false);
  });
});
