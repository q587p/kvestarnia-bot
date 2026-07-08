import { describe, expect, it } from "vitest";
import {
  makeDuelAcceptCallbackData,
  makeDuelAcceptRiskCallbackData,
  makeDuelCancelCallbackData,
  makeDuelDeclineCallbackData,
  makeDuelGearActionCallbackData,
  makeDuelInviteRotateCallbackData,
  makeDuelJournalCallbackData,
  makeDuelNewCallbackData,
  makeDuelNewRiskCallbackData,
  makeDuelNewTurnBasedCallbackData,
  makeDuelNewTurnBasedRiskCallbackData,
  makeDuelRematchCallbackData,
  makeDuelRematchRiskCallbackData,
  makeDuelShareCallbackData,
  makeDuelTurnCallbackData,
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
    expect(parseDuelCallbackData(makeDuelNewTurnBasedCallbackData())).toEqual({
      ok: true,
      value: { type: "new-turn-based" }
    });
    expect(parseDuelCallbackData(makeDuelNewTurnBasedRiskCallbackData())).toEqual({
      ok: true,
      value: { type: "new-turn-based-risk" }
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
    expect(parseDuelCallbackData(makeDuelJournalCallbackData("abc_DEF12", 12))).toEqual({
      ok: true,
      value: { type: "journal", token: "abc_DEF12", page: 12 }
    });
    expect(parseDuelCallbackData(makeDuelInviteRotateCallbackData("abc_DEF12", 12))).toEqual({
      ok: true,
      value: { type: "invite", token: "abc_DEF12", templateIndex: 12 }
    });
    expect(parseDuelCallbackData(makeDuelViewCallbackData("abc_DEF12"))).toEqual({
      ok: true,
      value: { type: "view", token: "abc_DEF12" }
    });
    expect(parseDuelCallbackData(makeDuelTurnCallbackData("abc_DEF12", "attack", 42, 13))).toEqual({
      ok: true,
      value: { type: "turn", token: "abc_DEF12", action: "attack", turn: 42, version: 13 }
    });
    expect(parseDuelCallbackData(makeDuelTurnCallbackData("abc_DEF12", "defend", 42, 13))).toEqual({
      ok: true,
      value: { type: "turn", token: "abc_DEF12", action: "defend", turn: 42, version: 13 }
    });
    expect(parseDuelCallbackData(makeDuelTurnCallbackData("abc_DEF12", "skill", 42, 13))).toEqual({
      ok: true,
      value: { type: "turn", token: "abc_DEF12", action: "skill", turn: 42, version: 13 }
    });
    expect(parseDuelCallbackData(makeDuelTurnCallbackData("abc_DEF12", "race", 42, 13))).toEqual({
      ok: true,
      value: { type: "turn", token: "abc_DEF12", action: "race", turn: 42, version: 13 }
    });
    expect(parseDuelCallbackData(makeDuelTurnCallbackData("abc_DEF12", "surrender", 42, 13))).toEqual({
      ok: true,
      value: { type: "turn", token: "abc_DEF12", action: "surrender", turn: 42, version: 13 }
    });
    expect(parseDuelCallbackData(makeDuelGearActionCallbackData({
      token: "abc_DEF12",
      turn: 42,
      version: 13,
      grantKey: "rldagr"
    }))).toEqual({
      ok: true,
      value: { type: "gear", token: "abc_DEF12", turn: 42, version: 13, grantKey: "rldagr" }
    });
  });

  it("keeps generated callback data below Telegram limits", () => {
    expect(Buffer.byteLength(makeDuelInviteRotateCallbackData("abc_DEF12", 12), "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(makeDuelNewTurnBasedCallbackData(), "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(makeDuelNewTurnBasedRiskCallbackData(), "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(makeDuelTurnCallbackData("abc_DEF12", "attack", 42, 13), "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(makeDuelTurnCallbackData("abc_DEF12", "defend", 42, 13), "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(makeDuelTurnCallbackData("abc_DEF12", "race", 42, 13), "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(makeDuelJournalCallbackData("abc_DEF12", 42), "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(makeDuelGearActionCallbackData({
      token: "abc_DEF12",
      turn: 42,
      version: 13,
      grantKey: "rldagr"
    }), "utf8")).toBeLessThanOrEqual(64);
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
    expect(parseDuelCallbackData("v1:duel:t:abc_DEF12:hax:1:1")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parseDuelCallbackData("v1:duel:g:abc_DEF12:1:1:bad_key")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parseDuelCallbackData("v1:duel:j:abc_DEF12:zzzz")).toEqual({
      ok: false,
      error: "invalid-page"
    });
  });
});
