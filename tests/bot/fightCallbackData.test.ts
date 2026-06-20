import { describe, expect, it } from "vitest";
import {
  makeFightCallbackData,
  makeFightTurnCallbackData,
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

  it.each(["attack", "defend", "skill", "flee"] as const)("parses persistent %s action", (action) => {
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
  });
});
