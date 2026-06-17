import { describe, expect, it } from "vitest";
import {
  makeDuelAcceptCallbackData,
  makeDuelAcceptRiskCallbackData,
  makeDuelCancelCallbackData,
  makeDuelDeclineCallbackData,
  makeDuelNewCallbackData,
  makeDuelViewCallbackData,
  parseDuelCallbackData
} from "../../src/bot/callbacks/duelCallbackData";

describe("duel callback data", () => {
  it("parses supported duel actions", () => {
    expect(parseDuelCallbackData(makeDuelNewCallbackData())).toEqual({
      ok: true,
      value: { type: "new" }
    });
    expect(parseDuelCallbackData(makeDuelAcceptCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "accept", token: "abc_DEF12" }
    });
    expect(parseDuelCallbackData(makeDuelAcceptRiskCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "accept-risk", token: "abc_DEF12" }
    });
    expect(parseDuelCallbackData(makeDuelCancelCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "cancel", token: "abc_DEF12" }
    });
    expect(parseDuelCallbackData(makeDuelDeclineCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "decline", token: "abc_DEF12" }
    });
    expect(parseDuelCallbackData(makeDuelViewCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "view", token: "abc_DEF12" }
    });
  });

  it("rejects unknown, unsafe and too-long payloads", () => {
    expect(parseDuelCallbackData("v0:duel:new")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseDuelCallbackData("v1:duel:accept:not ok")).toEqual({
      ok: false,
      error: "invalid-token"
    });
    expect(parseDuelCallbackData(`v1:duel:accept:${"a".repeat(80)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
  });
});
