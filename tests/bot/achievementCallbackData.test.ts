import { describe, expect, it } from "vitest";
import {
  makeAchievementCheckCallbackData,
  makeAchievementListCallbackData,
  makeCosmeticTitleClearCallbackData,
  makeCosmeticTitleListCallbackData,
  makeCosmeticTitleSetCallbackData,
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
        filter: "all",
        page: 42
      }
    });
  });

  it("parses filtered list and recalculation callbacks", () => {
    expect(parseAchievementCallbackData(makeAchievementListCallbackData(1, "earned"))).toEqual({
      ok: true,
      value: {
        type: "list",
        filter: "earned",
        page: 1
      }
    });
    expect(parseAchievementCallbackData(makeAchievementCheckCallbackData("locked"))).toEqual({
      ok: true,
      value: {
        type: "check",
        filter: "locked"
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
        type: "check",
        filter: "all"
      }
    });
  });

  it("parses cosmetic title callbacks within Telegram limits", () => {
    const rowId = "123e4567-e89b-12d3-a456-426614174000";
    const list = makeCosmeticTitleListCallbackData();
    const set = makeCosmeticTitleSetCallbackData(rowId, 13);
    const clear = makeCosmeticTitleClearCallbackData(13);

    expect(Buffer.byteLength(list, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(set, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(clear, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseAchievementCallbackData(list)).toEqual({
      ok: true,
      value: { type: "titles" }
    });
    expect(parseAchievementCallbackData(set)).toEqual({
      ok: true,
      value: {
        type: "title-set",
        titleGrantRowId: rowId,
        remortCount: 13
      }
    });
    expect(parseAchievementCallbackData(clear)).toEqual({
      ok: true,
      value: {
        type: "title-clear",
        remortCount: 13
      }
    });
  });

  it("rejects malformed cosmetic title callback values", () => {
    expect(parseAchievementCallbackData("v1:ach:tset:nope:123e4567-e89b-12d3-a456-426614174000")).toEqual({
      ok: false,
      error: "invalid-life"
    });
    expect(parseAchievementCallbackData("v1:ach:tset:0:not:a-row")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(parseAchievementCallbackData("v1:ach:tset:0:!!!")).toEqual({
      ok: false,
      error: "invalid-title"
    });
    expect(parseAchievementCallbackData("v1:ach:tclr:-1")).toEqual({
      ok: false,
      error: "invalid-life"
    });
  });
});
