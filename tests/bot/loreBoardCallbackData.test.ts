import { describe, expect, it } from "vitest";
import {
  makeLoreCategoryCallbackData,
  makeLoreCategoryRandomCallbackData,
  makeLoreEntryCallbackData,
  makeLoreGroupCallbackData,
  makeLoreMenuCallbackData,
  makeLoreRandomCallbackData,
  parseLoreBoardCallbackData
} from "../../src/bot/callbacks/loreBoardCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";
import { loreCategories, loreEntries, loreEntryGroups } from "../../src/content/loreBoard";

describe("lore board callback data", () => {
  it("round-trips compact lore callbacks", () => {
    expect(parseLoreBoardCallbackData(makeLoreMenuCallbackData())).toEqual({
      ok: true,
      value: { type: "menu" }
    });
    expect(parseLoreBoardCallbackData(makeLoreCategoryCallbackData("places"))).toEqual({
      ok: true,
      value: { type: "category", categoryId: "places" }
    });
    expect(parseLoreBoardCallbackData(makeLoreGroupCallbackData("nyz"))).toEqual({
      ok: true,
      value: { type: "group", groupId: "nyz" }
    });
    expect(parseLoreBoardCallbackData(makeLoreEntryCallbackData("notice-board-current"))).toEqual({
      ok: true,
      value: { type: "entry", entryId: "notice-board-current" }
    });
    expect(parseLoreBoardCallbackData(makeLoreRandomCallbackData())).toEqual({
      ok: true,
      value: { type: "random" }
    });
    expect(parseLoreBoardCallbackData(makeLoreCategoryRandomCallbackData("bestiary"))).toEqual({
      ok: true,
      value: { type: "category-random", categoryId: "bestiary" }
    });
  });

  it("keeps all generated lore callbacks within Telegram limits", () => {
    const callbacks = [
      makeLoreMenuCallbackData(),
      makeLoreRandomCallbackData(),
      ...loreCategories.flatMap((category) => [
        makeLoreCategoryCallbackData(category.id),
        makeLoreCategoryRandomCallbackData(category.id)
      ]),
      ...loreEntryGroups.map((group) => makeLoreGroupCallbackData(group.id)),
      ...loreEntries.map((entry) => makeLoreEntryCallbackData(entry.id))
    ];

    for (const callbackData of callbacks) {
      expect(Buffer.byteLength(callbackData, "utf8"), callbackData).toBeLessThanOrEqual(
        TELEGRAM_CALLBACK_DATA_LIMIT
      );
      expect(parseLoreBoardCallbackData(callbackData).ok, callbackData).toBe(true);
    }
  });

  it("rejects malformed lore callbacks but accepts stale safe ids for handler fallback", () => {
    const tooLongEntryCallback = `v1:lore:e:${"a".repeat(TELEGRAM_CALLBACK_DATA_LIMIT)}`;

    expect(parseLoreBoardCallbackData(tooLongEntryCallback)).toEqual({
      ok: false,
      error: "too-long"
    });
    expect(parseLoreBoardCallbackData("v2:lore:m").ok).toBe(false);
    expect(parseLoreBoardCallbackData("v1:lore:c:places!")).toEqual({
      ok: false,
      error: "invalid-id"
    });
    expect(parseLoreBoardCallbackData("v1:lore:g:places!")).toEqual({
      ok: false,
      error: "invalid-id"
    });
    expect(parseLoreBoardCallbackData("v1:lore:rc:stale_category")).toEqual({
      ok: false,
      error: "invalid-id"
    });
    expect(parseLoreBoardCallbackData("v1:lore:e:bad:id").ok).toBe(false);
    expect(parseLoreBoardCallbackData("v1:lore:e:stale-entry").ok).toBe(true);
    expect(parseLoreBoardCallbackData("v1:news:list:0").ok).toBe(false);
  });
});
