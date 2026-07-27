import { describe, expect, it } from "vitest";
import {
  makeFightCallbackData,
  makeFightGearActionCallbackData,
  makeFightItemsCallbackData,
  makeFightItemUseCallbackData,
  makeFightJournalCallbackData,
  makeFightPassageAttackCallbackData,
  makeFightTierTwoCallbackData,
  makeFightTurnCallbackData,
  makeFightViewCallbackData,
  parseFightCallbackData
} from "../../src/bot/callbacks/fightCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("fight callback data", () => {
  it.each(["attack", "receipt", "flee"] as const)("parses %s action", (action) => {
    const data = makeFightCallbackData(action);

    expect(parseFightCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "mimic",
        action
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses persistent fight view and journal callbacks", () => {
    const sessionId = "123e4567-e89b-12d3-a456-426614174000";
    const view = makeFightViewCallbackData(sessionId);
    const journal = makeFightJournalCallbackData({ sessionId, page: 2 });

    expect(parseFightCallbackData(view)).toEqual({
      ok: true,
      value: {
        type: "view",
        sessionId
      }
    });
    expect(parseFightCallbackData(journal)).toEqual({
      ok: true,
      value: {
        type: "journal",
        sessionId,
        page: 2
      }
    });
    expect(Buffer.byteLength(view, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(journal, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it.each(["attack", "defend", "skill", "race", "flee"] as const)("parses persistent %s action", (action) => {
    const data = makeFightTurnCallbackData({
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      turn: 3,
      action
    });

    expect(parseFightCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "turn",
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        turn: 3,
        action
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses persistent fight item action callbacks", () => {
    const data = makeFightItemUseCallbackData({
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      turn: 3,
      itemKey: "abc123"
    });

    expect(parseFightCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "item",
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        turn: 3,
        itemKey: "abc123"
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses the bounded persistent fight item-menu callback", () => {
    const data = makeFightItemsCallbackData({
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      turn: 3
    });

    expect(parseFightCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "items",
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        turn: 3
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBe(53);
  });

  it("parses persistent fight gear action callbacks", () => {
    const data = makeFightGearActionCallbackData({
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      turn: 3,
      grantKey: "rldagr"
    });

    expect(parseFightCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "gear",
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        turn: 3,
        grantKey: "rldagr"
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses persistent passage attack callbacks", () => {
    const data = makeFightPassageAttackCallbackData({
      passage: "deep-right",
      encounterToken: "kvest13"
    });

    expect(parseFightCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "passage",
        passage: "deep-right",
        encounterToken: "kvest13"
      }
    });
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("parses the unavailable second-tier callback", () => {
    const data = makeFightTierTwoCallbackData();

    expect(parseFightCallbackData(data)).toEqual({
      ok: true,
      value: { type: "tier2" }
    });
    expect(data).toBe("v1:fight:tier2");
  });

  it("rejects invalid versions and actions", () => {
    expect(parseFightCallbackData("v2:fight:mimic:attack")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseFightCallbackData("v1:fight:mimic:dance")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(
      parseFightCallbackData("v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:3:dance")
    ).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(
      parseFightCallbackData("v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:3:gear")
    ).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(
      parseFightCallbackData("v1:fight:gear:123e4567-e89b-12d3-a456-426614174000:3:bad_key")
    ).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parseFightCallbackData("v1:fight:pass:deep:seed")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });

  it("rejects invalid prefixes and overlong data", () => {
    expect(parseFightCallbackData("v1:adv:mimic:attack")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(parseFightCallbackData(`v1:fight:mimic:${"a".repeat(80)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
    expect(parseFightCallbackData("v1:fight:turn:not-a-session:1:attack")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(
      parseFightCallbackData("v1:fight:turn:123e4567-e89b-12d3-a456-426614174000:0:attack")
    ).toEqual({
      ok: false,
      error: "invalid-turn"
    });
    expect(
      parseFightCallbackData("v1:fight:log:123e4567-e89b-12d3-a456-426614174000:-1")
    ).toEqual({
      ok: false,
      error: "invalid-turn"
    });
    expect(parseFightCallbackData("v1:fight:pass:deep-right:bad_seed")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
  });
});
