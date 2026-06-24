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

  it("parses a valid participants callback", () => {
    const data = makeTavernCallbackData("participants");

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseTavernCallbackData(data)).toEqual({
      ok: true,
      value: "participants"
    });
  });

  it("parses pending raid side-panel callbacks", () => {
    expect(parseTavernCallbackData(makeTavernCallbackData("raid-leaderboard"))).toEqual({
      ok: true,
      value: "raid-leaderboard"
    });
    expect(parseTavernCallbackData(makeTavernCallbackData("raid-news"))).toEqual({
      ok: true,
      value: "raid-news"
    });
  });

  it("parses a valid ranger callback", () => {
    const data = makeTavernCallbackData("ranger");

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseTavernCallbackData(data)).toEqual({
      ok: true,
      value: "ranger"
    });
  });

  it("parses a valid round callback", () => {
    const data = makeTavernCallbackData("round");

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseTavernCallbackData(data)).toEqual({
      ok: true,
      value: "round"
    });
  });

  it("parses explicit round purchase callbacks", () => {
    expect(parseTavernCallbackData(makeTavernCallbackData("round-simple"))).toEqual({
      ok: true,
      value: "round-simple"
    });
    expect(parseTavernCallbackData(makeTavernCallbackData("round-fine"))).toEqual({
      ok: true,
      value: "round-fine"
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
