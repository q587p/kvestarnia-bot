import { describe, expect, it } from "vitest";
import {
  makeDescentSearchStartCallbackData,
  makeDeepLevelOneSearchStartCallbackData,
  makePassageSearchAskCancelCallbackData,
  makePassageSearchCancelCallbackData,
  makePassageSearchCheckCallbackData,
  makePassageSearchKeepCallbackData,
  makePassageSearchStartCallbackData,
  makeSafePassageSearchStartCallbackData,
  parsePassageSearchCallbackData
} from "../../src/bot/callbacks/passageSearchCallbackData";

describe("passage search callback data", () => {
  it("round-trips passage search start data", () => {
    const data = makePassageSearchStartCallbackData({
      passage: "deep-straight",
      encounterToken: "token13"
    });

    expect(data.length).toBeLessThanOrEqual(64);
    expect(parsePassageSearchCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "start-passage",
        passage: "deep-straight",
        encounterToken: "token13"
      }
    });
  });

  it("round-trips safe passage-rest search start data", () => {
    const data = makeSafePassageSearchStartCallbackData({
      passage: "deep-left"
    });

    expect(data.length).toBeLessThanOrEqual(64);
    expect(parsePassageSearchCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "start-safe-passage",
        passage: "deep-left"
      }
    });
  });

  it("round-trips descent and action callbacks", () => {
    expect(parsePassageSearchCallbackData(makeDescentSearchStartCallbackData())).toEqual({
      ok: true,
      value: { type: "start-descent" }
    });
    expect(parsePassageSearchCallbackData(makeDeepLevelOneSearchStartCallbackData())).toEqual({
      ok: true,
      value: { type: "start-deep-level-one" }
    });
    expect(parsePassageSearchCallbackData(makePassageSearchCheckCallbackData("abc123"))).toEqual({
      ok: true,
      value: { type: "check", token: "abc123" }
    });
    expect(parsePassageSearchCallbackData(makePassageSearchAskCancelCallbackData("abc123"))).toEqual({
      ok: true,
      value: { type: "ask-cancel", token: "abc123" }
    });
    expect(parsePassageSearchCallbackData(makePassageSearchCancelCallbackData("abc123"))).toEqual({
      ok: true,
      value: { type: "cancel", token: "abc123" }
    });
    expect(parsePassageSearchCallbackData(makePassageSearchKeepCallbackData("abc123"))).toEqual({
      ok: true,
      value: { type: "keep", token: "abc123" }
    });
  });

  it("rejects invalid passage and long data", () => {
    expect(parsePassageSearchCallbackData("v1:search:start:p:deep:token13")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parsePassageSearchCallbackData(`v1:search:check:${"a".repeat(80)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
  });
});
