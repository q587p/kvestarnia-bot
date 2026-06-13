import { describe, expect, it } from "vitest";
import {
  makePlaceCallbackData,
  parsePlaceCallbackData
} from "../../src/bot/callbacks/placeCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("place callback data", () => {
  it.each(["hall", "quest-table", "barrel", "news-corner", "cellar", "front"] as const)(
    "parses %s place",
    (action) => {
      const data = makePlaceCallbackData(action);

      expect(parsePlaceCallbackData(data)).toEqual({ ok: true, value: action });
      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
  );

  it("rejects invalid versions and actions", () => {
    expect(parsePlaceCallbackData("v2:place:hall")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parsePlaceCallbackData("v1:place:roof")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });
});
