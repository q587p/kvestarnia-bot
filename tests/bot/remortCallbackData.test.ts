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
const itemKey = "a1b2c3d4e5f6";

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
    expect(parseRemortCallbackData(makeRemortItemCallbackData(token, itemKey))).toEqual({
      ok: true,
      value: { type: "item", token, itemKey }
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
    expect(parseRemortCallbackData("v1:rm:it:0123456789abcdef:item.foam-cork-of-accounting")).toEqual({
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
      makeRemortItemCallbackData(token, itemKey),
      makeRemortConfirmCallbackData(token)
    ];

    expect(callbacks.every((callback) => Buffer.byteLength(callback, "utf8") <= 64)).toBe(true);
  });

  it("keeps hostile archived item ids out of callback data", () => {
    const hostileItemId = "ARCHIVE:Legacy/Item_With_Callback_Breakers_And_A_Name_Long_Enough_To_Overflow";
    const callback = makeRemortItemCallbackData(token, itemKey);

    expect(callback).not.toContain(hostileItemId);
    expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(64);
    expect(parseRemortCallbackData(callback)).toEqual({
      ok: true,
      value: { type: "item", token, itemKey }
    });
  });
});
