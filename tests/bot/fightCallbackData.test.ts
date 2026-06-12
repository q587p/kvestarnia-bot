import { describe, expect, it } from "vitest";
import {
  makeFightCallbackData,
  parseFightCallbackData
} from "../../src/bot/callbacks/fightCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("fight callback data", () => {
  it.each(["attack", "receipt", "flee"] as const)("parses %s action", (action) => {
    const data = makeFightCallbackData(action);

    expect(parseFightCallbackData(data)).toEqual({ ok: true, value: action });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("rejects invalid versions and actions", () => {
    expect(parseFightCallbackData("v2:fight:mimic:attack")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseFightCallbackData("v1:fight:mimic:dance")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });

  it("rejects invalid prefixes and overlong data", () => {
    expect(parseFightCallbackData("v1:adv:mimic:attack")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(parseFightCallbackData(`v1:fight:mimic:${"a".repeat(80)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
  });
});
