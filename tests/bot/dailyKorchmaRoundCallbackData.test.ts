import { describe, expect, it } from "vitest";
import {
  makeDailyKorchmaRoundActionCallbackData,
  makeDailyKorchmaRoundClaimCallbackData,
  makeDailyKorchmaRoundOverviewCallbackData,
  makeDailyKorchmaRoundSceneCallbackData,
  makeDailyKorchmaRoundSceneHelpCallbackData,
  makeDailyKorchmaRoundStartCallbackData,
  parseDailyKorchmaRoundCallbackData
} from "../../src/bot/callbacks/dailyKorchmaRoundCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("daily Korchma round callback data", () => {
  it("round-trips overview, scene, action and claim callbacks within Telegram limits", () => {
    const callbacks = [
      makeDailyKorchmaRoundOverviewCallbackData("20260628"),
      makeDailyKorchmaRoundStartCallbackData("20260628"),
      makeDailyKorchmaRoundSceneCallbackData("20260628", 2),
      makeDailyKorchmaRoundSceneHelpCallbackData("20260628", 2),
      makeDailyKorchmaRoundActionCallbackData({
        dayToken: "20260628",
        sceneIndex: 1,
        actionId: "stamp-echo",
        lifeToken: 3
      }),
      makeDailyKorchmaRoundClaimCallbackData("20260628", 3)
    ];

    expect(callbacks.map((data) => parseDailyKorchmaRoundCallbackData(data))).toEqual([
      { ok: true, value: { type: "overview", dayToken: "20260628" } },
      { ok: true, value: { type: "start", dayToken: "20260628" } },
      { ok: true, value: { type: "scene", dayToken: "20260628", sceneIndex: 2 } },
      { ok: true, value: { type: "scene-help", dayToken: "20260628", sceneIndex: 2 } },
      {
        ok: true,
        value: {
          type: "action",
          dayToken: "20260628",
          sceneIndex: 1,
          actionId: "stamp-echo",
          lifeToken: 3
        }
      },
      { ok: true, value: { type: "claim", dayToken: "20260628", lifeToken: 3 } }
    ]);
    expect(callbacks.every((data) => Buffer.byteLength(data, "utf8") <= TELEGRAM_CALLBACK_DATA_LIMIT)).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(parseDailyKorchmaRoundCallbackData("v2:dkr:o:20260628")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseDailyKorchmaRoundCallbackData("v1:dkr:o:today")).toEqual({
      ok: false,
      error: "invalid-day"
    });
    expect(parseDailyKorchmaRoundCallbackData("v1:dkr:s:20260628:9")).toEqual({
      ok: false,
      error: "invalid-scene"
    });
    expect(parseDailyKorchmaRoundCallbackData("v1:dkr:a:20260628:0:bad_id:0")).toEqual({
      ok: false,
      error: "invalid-action"
    });
  });
});
