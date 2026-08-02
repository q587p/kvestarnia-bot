import { describe, expect, it } from "vitest";
import {
  makeGuildCreateConfirmCallbackData,
  makeGuildMemberMutationCallbackData,
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
    expect(Buffer.byteLength(create, "utf8")).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(mutation, "utf8")).toBeLessThanOrEqual(64);
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
  });

  it("rejects oversized, malformed and token-bearing lookalike callbacks", () => {
    expect(parseGuildCallbackData(`v1:g:c:${"a".repeat(58)}`)).toEqual({ ok: false, error: "too-long" });
    expect(parseGuildCallbackData("v1:g:c:short")).toEqual({ ok: false, error: "invalid-token" });
    expect(parseGuildCallbackData("v1:g:t:not-a-member:zz:extra")).toEqual({ ok: false, error: "invalid-prefix" });
  });
});
