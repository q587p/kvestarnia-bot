import { describe, expect, it } from "vitest";
import {
  makeTrainingDoppelgangerCallbackData,
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

  it("rejects invalid training callbacks", () => {
    expect(parseTrainingDoppelgangerCallbackData("v1:spar:duel")).toEqual({
      ok: false,
      error: "invalid-action"
    });
    expect(parseTrainingDoppelgangerCallbackData("v1:duel:open")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(parseTrainingDoppelgangerCallbackData(`v1:spar:${"x".repeat(80)}`)).toEqual({
      ok: false,
      error: "too-long"
    });
  });
});
