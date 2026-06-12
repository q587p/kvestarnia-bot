import { describe, expect, it } from "vitest";
import {
  makeTavernCallbackData,
  parseTavernCallbackData
} from "../../src/bot/callbacks/tavernCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("tavern callback data", () => {
  it("parses a valid raid callback", () => {
    const data = makeTavernCallbackData("raid");

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseTavernCallbackData(data)).toEqual({
      ok: true,
      value: "raid"
    });
  });

  it("rejects invalid versions and actions", () => {
    expect(parseTavernCallbackData("v2:tavern:raid")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseTavernCallbackData("v1:tavern:full-raid")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });
});
