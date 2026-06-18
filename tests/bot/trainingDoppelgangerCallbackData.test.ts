import { describe, expect, it } from "vitest";
import {
  makeTrainingDoppelgangerCallbackData,
  makeTrainingDoppelgangerModeCallbackData,
  makeTrainingDoppelgangerTurnCallbackData,
  parseTrainingDoppelgangerCallbackData
} from "../../src/bot/callbacks/trainingDoppelgangerCallbackData";

describe("training doppelganger callback data", () => {
  it("round-trips the open callback within Telegram limits", () => {
    const data = makeTrainingDoppelgangerCallbackData();

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
    expect(parseTrainingDoppelgangerCallbackData(data)).toEqual({
      ok: true,
      value: { type: "open" }
    });
  });

  it("round-trips turn callbacks within Telegram limits", () => {
    const data = makeTrainingDoppelgangerTurnCallbackData({
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      turn: 3,
      action: "skill"
    });

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
    expect(parseTrainingDoppelgangerCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "turn",
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        turn: 3,
        action: "skill"
      }
    });
  });

  it.each(["copy-target", "random-build", "champion-day", "champion-week", "champion-month"] as const)(
    "round-trips %s start mode callbacks within Telegram limits",
    (mode) => {
      const data = makeTrainingDoppelgangerModeCallbackData(mode);

      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(64);
      expect(parseTrainingDoppelgangerCallbackData(data)).toEqual({
        ok: true,
        value: { type: "mode", mode }
      });
    }
  );

  it("rejects invalid training callbacks", () => {
    expect(parseTrainingDoppelgangerCallbackData("v1:spar:duel")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parseTrainingDoppelgangerCallbackData("v1:duel:open")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(parseTrainingDoppelgangerCallbackData("v1:spar:mode:market")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parseTrainingDoppelgangerCallbackData(`v1:spar:${"x".repeat(80)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
  });
});
