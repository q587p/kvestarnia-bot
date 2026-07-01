import { describe, expect, it } from "vitest";
import {
  makeLatestEventsListCallbackData,
  makeLatestEventsRefreshCallbackData,
  parseLatestEventsCallbackData
} from "../../src/bot/callbacks/latestEventsCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("latest events callback data", () => {
  it("parses list and refresh callbacks under Telegram limits", () => {
    const list = makeLatestEventsListCallbackData("cmb", 2);
    const refresh = makeLatestEventsRefreshCallbackData("itm", 0);

    expect(Buffer.byteLength(list, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(refresh, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseLatestEventsCallbackData(list)).toEqual({
      ok: true,
      value: { type: "list", filter: "cmb", page: 2 }
    });
    expect(parseLatestEventsCallbackData(refresh)).toEqual({
      ok: true,
      value: { type: "refresh", filter: "itm", page: 0 }
    });
  });

  it("rejects malformed callbacks safely", () => {
    expect(parseLatestEventsCallbackData("v1:ev:x:all:0").ok).toBe(false);
    expect(parseLatestEventsCallbackData("v1:ev:l:nope:0").ok).toBe(false);
    expect(parseLatestEventsCallbackData("v1:ev:l:all:-1").ok).toBe(false);
    expect(parseLatestEventsCallbackData(`v1:ev:l:all:${"1".repeat(80)}`).ok).toBe(false);
  });
});
