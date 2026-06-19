import { describe, expect, it } from "vitest";
import {
  makeDuelAcceptCallbackData,
  makeDuelAcceptRiskCallbackData,
  makeDuelCancelCallbackData,
  makeDuelDeclineCallbackData,
  makeDuelInviteRotateCallbackData,
  makeDuelNewCallbackData,
  makeDuelNewRiskCallbackData,
  makeDuelRematchCallbackData,
  makeDuelRematchRiskCallbackData,
  makeDuelShareCallbackData,
  makeDuelViewCallbackData,
  parseDuelCallbackData
} from "../../src/bot/callbacks/duelCallbackData";

describe("duel callback data", () => {
  it("parses supported duel actions", () => {
    expect(parseDuelCallbackData(makeDuelNewCallbackData())).toEqual({
      ok: true,
      value: { type: "new" }
    });
    expect(parseDuelCallbackData(makeDuelNewRiskCallbackData())).toEqual({
      ok: true,
      value: { type: "new-risk" }
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
    expect(parseDuelCallbackData(makeDuelRematchCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "rematch", token: "abc_DEF12" }
    });
    expect(parseDuelCallbackData(makeDuelRematchRiskCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "rematch-risk", token: "abc_DEF12" }
    });
    expect(parseDuelCallbackData(makeDuelShareCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "share", token: "abc_DEF12" }
    });
    expect(parseDuelCallbackData(makeDuelInviteRotateCallbackData("abc_DEF12", 12))).toEqual({
      ok: true,
      value: { type: "invite", token: "abc_DEF12", templateIndex: 12 }
    });
    expect(parseDuelCallbackData(makeDuelViewCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "view", token: "abc_DEF12" }
    });
  });

  it("keeps invite rotation callback data below Telegram limits", () => {
    expect(Buffer.byteLength(makeDuelInviteRotateCallbackData("abc_DEF12", 12), "utf8")).toBeLessThanOrEqual(64);
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
    expect(parseDuelCallbackData("v1:duel:inv:abc_DEF12:z")).toEqual({
      ok: false,
      error: "invalid-template"
    });
  });
});
