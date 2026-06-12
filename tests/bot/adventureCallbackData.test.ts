import { describe, expect, it } from "vitest";
import {
  makeAdventureCallbackData,
  parseAdventureCallbackData
} from "../../src/bot/callbacks/adventureCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("adventure callback data", () => {
  it.each(["poke", "receipt", "flee"] as const)("parses %s action", (action) => {
    const data = makeAdventureCallbackData(action);

    expect(parseAdventureCallbackData(data)).toEqual({ ok: true, value: action });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("rejects invalid versions and actions", () => {
    expect(parseAdventureCallbackData("v2:adv:mimic:poke")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseAdventureCallbackData("v1:adv:mimic:dance")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });

  it("rejects invalid prefixes", () => {
    expect(parseAdventureCallbackData("v1:tavern:mimic:poke")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
  });
});
