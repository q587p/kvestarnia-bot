import { describe, expect, it } from "vitest";
import {
  makeCellarCallbackData,
  makeCellarMethodCallbackData,
  parseCellarCallbackData
} from "../../src/bot/callbacks/cellarCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("cellar callback data", () => {
  it.each([
    "cheese-trap",
    "sweep-bravely",
    "negotiate",
    "grownup-buy-seal",
    "grownup-roleplay",
    "grownup-show-seal",
    "grownup-turn-in",
    "grownup-keep-bottle",
    "participants"
  ] as const)(
    "parses %s action",
    (action) => {
      const data = makeCellarCallbackData(action);

      expect(parseCellarCallbackData(data)).toEqual({ ok: true, value: action });
      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
  );

  it("parses authored method callbacks", () => {
    const data = makeCellarMethodCallbackData("r5");

    expect(parseCellarCallbackData(data)).toEqual({
      ok: true,
      value: "r5"
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("rejects invalid versions and actions", () => {
    expect(parseCellarCallbackData("v3:cellar:negotiate")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseCellarCallbackData("v1:cellar:dance")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });

  it("rejects invalid prefixes", () => {
    expect(parseCellarCallbackData("v1:adv:cellar:negotiate")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
  });
});
