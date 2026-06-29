import { describe, expect, it } from "vitest";
import {
  makePartySessionCancelCallbackData,
  makePartySessionExpireCallbackData,
  makePartySessionJoinCallbackData,
  makePartySessionLeaveCallbackData,
  makePartySessionNearbyInviteCallbackData,
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
  });

  it("round-trips nearby invite target ids without decimal ids in the payload", () => {
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
    expect(parsePartySessionCallbackData(`v1:party:v:${"x".repeat(80)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
  });
});
