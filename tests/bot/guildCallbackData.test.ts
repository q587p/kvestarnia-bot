import { describe, expect, it } from "vitest";
import {
  makeGuildCreateOpenCallbackData,
  makeGuildCreateConfirmCallbackData,
  makeGuildInviteCodeCallbackData,
  makeGuildMemberMutationCallbackData,
  makeGuildMemberSelectCallbackData,
  makeGuildOpenCallbackData,
  makeGuildPartyInviteCallbackData,
  makeGuildPartyOpenCallbackData,
  makeGuildTransferAcceptCallbackData,
  parseGuildCallbackData
} from "../../src/bot/callbacks/guildCallbackData";

describe("guild callback data", () => {
  it("round-trips bounded creation and member mutation callbacks", () => {
    const create = makeGuildCreateConfirmCallbackData("abcdefghijklmnop");
    const mutation = makeGuildMemberMutationCallbackData(
      "transfer",
      "12345678-1234-4234-9234-123456789012",
      587
    );
    const selection = makeGuildMemberSelectCallbackData(
      "promote",
      "12345678-1234-4234-9234-123456789012",
      587
    );
    expect(Buffer.byteLength(create, "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(mutation, "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(selection, "utf8")).toBeLessThanOrEqual(64);
    expect(parseGuildCallbackData(create)).toEqual({
      ok: true,
      value: { type: "create-confirm", token: "abcdefghijklmnop" }
    });
    expect(parseGuildCallbackData(mutation)).toEqual({
      ok: true,
      value: {
        type: "transfer",
        memberId: "12345678-1234-4234-9234-123456789012",
        version: 587
      }
    });
    expect(parseGuildCallbackData(selection)).toEqual({
      ok: true,
      value: {
        type: "member-select",
        action: "promote",
        memberId: "12345678-1234-4234-9234-123456789012",
        version: 587
      }
    });
  });

  it("round-trips bounded pagination, party and accepted-transfer callbacks", () => {
    const values = [
      makeGuildOpenCallbackData(23),
      makeGuildCreateOpenCallbackData(),
      makeGuildInviteCodeCallbackData(),
      makeGuildPartyOpenCallbackData(42),
      makeGuildPartyInviteCallbackData("12345678-1234-4234-9234-123456789012", 587),
      makeGuildTransferAcceptCallbackData(587)
    ];
    expect(values.every((value) => Buffer.byteLength(value, "utf8") <= 64)).toBe(true);
    expect(parseGuildCallbackData(values[0])).toEqual({ ok: true, value: { type: "open", page: 23 } });
    expect(parseGuildCallbackData(values[1])).toEqual({ ok: true, value: { type: "create-open" } });
    expect(parseGuildCallbackData(values[2])).toEqual({ ok: true, value: { type: "invite-code" } });
    expect(parseGuildCallbackData(values[3])).toEqual({ ok: true, value: { type: "party-open", page: 42 } });
    expect(parseGuildCallbackData(values[4])).toEqual({
      ok: true,
      value: { type: "party-invite", memberId: "12345678-1234-4234-9234-123456789012", version: 587 }
    });
    expect(parseGuildCallbackData(values[5])).toEqual({ ok: true, value: { type: "transfer-accept", version: 587 } });
  });

  it("rejects oversized, malformed and token-bearing lookalike callbacks", () => {
    expect(parseGuildCallbackData(`v1:g:c:${"a".repeat(58)}`)).toEqual({ ok: false, error: "too-long" });
    expect(parseGuildCallbackData("v1:g:c:short")).toEqual({ ok: false, error: "invalid-token" });
    expect(parseGuildCallbackData("v1:g:t:not-a-member:zz:extra")).toEqual({ ok: false, error: "invalid-prefix" });
  });
});
