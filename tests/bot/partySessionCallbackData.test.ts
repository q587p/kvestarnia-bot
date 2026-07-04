import { describe, expect, it } from "vitest";
import {
  makePartyBossActionCallbackData,
  makePartyBossItemsMenuCallbackData,
  makePartyBossItemUseCallbackData,
  makePartyBossJournalCallbackData,
  makePartyBossStartCallbackData,
  makePartyBossTimeoutCallbackData,
  makePartySessionCancelCallbackData,
  makePartySessionExpireCallbackData,
  makePartySessionInviteRotateCallbackData,
  makePartySessionJoinCallbackData,
  makePartySessionLeaveCallbackData,
  makePartySessionNearbyInviteCallbackData,
  makePartySessionNearbyOpenCallbackData,
  makePartySessionShareCallbackData,
  makePartySessionViewCallbackData,
  parsePartySessionCallbackData
} from "../../src/bot/callbacks/partySessionCallbackData";

describe("party session callback data", () => {
  it("round-trips compact party actions", () => {
    const token = "abCD_123-xy";

    expect(parsePartySessionCallbackData(makePartySessionViewCallbackData(token))).toEqual({
      ok: true,
      value: { type: "view", token }
    });
    expect(parsePartySessionCallbackData(makePartySessionJoinCallbackData(token))).toEqual({
      ok: true,
      value: { type: "join", token }
    });
    expect(parsePartySessionCallbackData(makePartySessionLeaveCallbackData(token))).toEqual({
      ok: true,
      value: { type: "leave", token }
    });
    expect(parsePartySessionCallbackData(makePartySessionCancelCallbackData(token))).toEqual({
      ok: true,
      value: { type: "cancel", token }
    });
    expect(parsePartySessionCallbackData(makePartySessionExpireCallbackData(token))).toEqual({
      ok: true,
      value: { type: "expire", token }
    });
    expect(parsePartySessionCallbackData(makePartyBossStartCallbackData(token))).toEqual({
      ok: true,
      value: { type: "boss-start", token }
    });
    expect(parsePartySessionCallbackData(makePartyBossTimeoutCallbackData(token))).toEqual({
      ok: true,
      value: { type: "boss-timeout", token }
    });
    expect(parsePartySessionCallbackData(makePartyBossJournalCallbackData(token))).toEqual({
      ok: true,
      value: { type: "boss-journal", token, page: null }
    });
    expect(parsePartySessionCallbackData(makePartyBossJournalCallbackData(token, 12))).toEqual({
      ok: true,
      value: { type: "boss-journal", token, page: 12 }
    });
    expect(parsePartySessionCallbackData(makePartySessionShareCallbackData(token))).toEqual({
      ok: true,
      value: { type: "share", token }
    });
    expect(parsePartySessionCallbackData(makePartySessionInviteRotateCallbackData(token, 12))).toEqual({
      ok: true,
      value: { type: "invite", token, templateIndex: 12 }
    });
    expect(parsePartySessionCallbackData(makePartyBossActionCallbackData(token, 42, "skill"))).toEqual({
      ok: true,
      value: { type: "boss-action", token, turn: 42, action: "skill" }
    });
    expect(parsePartySessionCallbackData(makePartyBossItemsMenuCallbackData(token, 42))).toEqual({
      ok: true,
      value: { type: "boss-items", token, turn: 42 }
    });
    expect(parsePartySessionCallbackData(makePartyBossItemUseCallbackData({
      token,
      turn: 42,
      itemKey: "00abcd"
    }))).toEqual({
      ok: true,
      value: { type: "boss-item", token, turn: 42, itemKey: "00abcd" }
    });
  });

  it("round-trips nearby invite target ids without decimal ids in the payload", () => {
    expect(parsePartySessionCallbackData(makePartySessionNearbyOpenCallbackData())).toEqual({
      ok: true,
      value: { type: "nearby-open", page: 0 }
    });
    expect(parsePartySessionCallbackData(makePartySessionNearbyOpenCallbackData(42))).toEqual({
      ok: true,
      value: { type: "nearby-open", page: 42 }
    });

    const data = makePartySessionNearbyInviteCallbackData(9876543210n, 42);

    expect(data).toBe("v1:party:ni:4jc8lii:16");
    expect(parsePartySessionCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "nearby-invite",
        targetTelegramUserId: 9876543210n,
        page: 42
      }
    });
  });

  it("rejects stale, oversized or malformed callback data", () => {
    expect(parsePartySessionCallbackData(undefined)).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parsePartySessionCallbackData("v2:party:v:abCD_123-xy")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parsePartySessionCallbackData("v1:party:v:short")).toEqual({
      ok: false,
      error: "invalid-token"
    });
    expect(parsePartySessionCallbackData("v1:party:ni:bad_target:1")).toEqual({
      ok: false,
      error: "invalid-target"
    });
    expect(parsePartySessionCallbackData("v1:party:ba:abCD_123-xy:1:bad")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parsePartySessionCallbackData(`v1:party:v:${"x".repeat(80)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
  });
});
