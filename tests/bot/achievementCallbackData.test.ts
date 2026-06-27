import { describe, expect, it } from "vitest";
import {
  makeAchievementCheckCallbackData,
  makeAchievementListCallbackData,
  parseAchievementCallbackData
} from "../../src/bot/callbacks/achievementCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("achievement callback data", () => {
  it("keeps pagination callbacks within Telegram limits", () => {
    const callbackData = makeAchievementListCallbackData(42);

    expect(Buffer.byteLength(callbackData, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseAchievementCallbackData(callbackData)).toEqual({
      ok: true,
      value: {
        type: "list",
        page: 42
      }
    });
  });

  it("parses the hero return callback", () => {
    expect(parseAchievementCallbackData("v1:ach:hero")).toEqual({
      ok: true,
      value: {
        type: "hero"
      }
    });
  });

  it("parses the recalculation callback", () => {
    const callbackData = makeAchievementCheckCallbackData();

    expect(Buffer.byteLength(callbackData, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseAchievementCallbackData(callbackData)).toEqual({
      ok: true,
      value: {
        type: "check"
      }
    });
  });
});
