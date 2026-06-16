import { describe, expect, it } from "vitest";
import {
  makeRemortClassCallbackData,
  makeRemortConfirmCallbackData,
  makeRemortItemCallbackData,
  makeRemortOpenCallbackData,
  makeRemortPronounCallbackData,
  makeRemortRaceCallbackData,
  parseRemortCallbackData
} from "../../src/bot/callbacks/remortCallbackData";

const token = "0123456789abcdef";

describe("remort callback data", () => {
  it("round-trips valid remort callbacks", () => {
    expect(parseRemortCallbackData(makeRemortOpenCallbackData())).toEqual({
      ok: true,
      value: { type: "open" }
    });
    expect(parseRemortCallbackData(makeRemortPronounCallbackData(token, "they"))).toEqual({
      ok: true,
      value: { type: "pronoun", token, pronoun: "they" }
    });
    expect(parseRemortCallbackData(makeRemortRaceCallbackData(token, "human-ish"))).toEqual({
      ok: true,
      value: { type: "race", token, raceKey: "human-ish" }
    });
    expect(parseRemortCallbackData(makeRemortClassCallbackData(token, "warrior"))).toEqual({
      ok: true,
      value: { type: "class", token, classKey: "warrior" }
    });
    expect(parseRemortCallbackData(makeRemortItemCallbackData(token, "item.foam-cork-of-accounting"))).toEqual({
      ok: true,
      value: { type: "item", token, itemId: "item.foam-cork-of-accounting" }
    });
    expect(parseRemortCallbackData(makeRemortConfirmCallbackData(token))).toEqual({
      ok: true,
      value: { type: "confirm", token }
    });
  });

  it("rejects invalid or overlong-shaped remort callbacks", () => {
    expect(parseRemortCallbackData("v1:rm:go:not-a-token")).toEqual({ ok: false, error: "invalid" });
    expect(parseRemortCallbackData("v1:rm:pr:0123456789abcdef:nope")).toEqual({
      ok: false,
      error: "invalid"
    });
    expect(parseRemortCallbackData("v1:rm:it:0123456789abcdef:<b>bad</b>")).toEqual({
      ok: false,
      error: "invalid"
    });
  });

  it("keeps generated callback data within Telegram limit", () => {
    const callbacks = [
      makeRemortOpenCallbackData(),
      makeRemortPronounCallbackData(token, "they"),
      makeRemortRaceCallbackData(token, "intellectual-orc"),
      makeRemortClassCallbackData(token, "bureaucramancer"),
      makeRemortItemCallbackData(token, "item.cellar.foamy-mirage-bottle"),
      makeRemortConfirmCallbackData(token)
    ];

    expect(callbacks.every((callback) => Buffer.byteLength(callback, "utf8") <= 64)).toBe(true);
  });
});
