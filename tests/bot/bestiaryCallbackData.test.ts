import { describe, expect, it } from "vitest";
import { bestiarySpecialRecords, monsters } from "../../src/content";
import {
  makeBestiaryListCallbackData,
  makeBestiaryMonsterCallbackData,
  makeBestiaryRandomCallbackData,
  makeBestiarySpecialCallbackData,
  parseBestiaryCallbackData
} from "../../src/bot/callbacks/bestiaryCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("bestiary callback data", () => {
  it("parses list and monster callbacks", () => {
    expect(parseBestiaryCallbackData(makeBestiaryListCallbackData(2))).toEqual({
      ok: true,
      value: {
        type: "list",
        page: 2,
        source: "quest"
      }
    });
    expect(parseBestiaryCallbackData(makeBestiaryMonsterCallbackData("monster.deadline-spider", 1))).toEqual({
      ok: true,
      value: {
        type: "monster",
        monsterId: "monster.deadline-spider",
        page: 1,
        source: "quest"
      }
    });
    expect(parseBestiaryCallbackData(makeBestiarySpecialCallbackData("special.big-barrel-brother", 9))).toEqual({
      ok: true,
      value: {
        type: "special",
        specialId: "special.big-barrel-brother",
        page: 9,
        source: "quest"
      }
    });
    expect(parseBestiaryCallbackData(makeBestiaryRandomCallbackData())).toEqual({
      ok: true,
      value: {
        type: "random",
        source: "quest"
      }
    });
  });

  it("parses lore-source callbacks while preserving old callback compatibility", () => {
    expect(parseBestiaryCallbackData(makeBestiaryListCallbackData(2, "lore"))).toEqual({
      ok: true,
      value: {
        type: "list",
        page: 2,
        source: "lore"
      }
    });
    expect(parseBestiaryCallbackData(makeBestiaryMonsterCallbackData("monster.deadline-spider", 1, "lore")))
      .toEqual({
        ok: true,
        value: {
          type: "monster",
          monsterId: "monster.deadline-spider",
          page: 1,
          source: "lore"
        }
      });
    expect(parseBestiaryCallbackData(makeBestiarySpecialCallbackData("special.big-barrel-brother", 9, "lore")))
      .toEqual({
        ok: true,
        value: {
          type: "special",
          specialId: "special.big-barrel-brother",
          page: 9,
          source: "lore"
        }
      });
    expect(parseBestiaryCallbackData(makeBestiaryRandomCallbackData("lore"))).toEqual({
      ok: true,
      value: {
        type: "random",
        source: "lore"
      }
    });
  });

  it("keeps all current bestiary callbacks within Telegram limit", () => {
    for (const monster of monsters) {
      expect(Buffer.byteLength(makeBestiaryMonsterCallbackData(monster.id, 999), "utf8"))
        .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
      expect(Buffer.byteLength(makeBestiaryMonsterCallbackData(monster.id, 999, "lore"), "utf8"))
        .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
    for (const record of bestiarySpecialRecords) {
      expect(Buffer.byteLength(makeBestiarySpecialCallbackData(record.id, 999), "utf8"))
        .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
      expect(Buffer.byteLength(makeBestiarySpecialCallbackData(record.id, 999, "lore"), "utf8"))
        .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
    expect(Buffer.byteLength(makeBestiaryRandomCallbackData(), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(makeBestiaryRandomCallbackData("lore"), "utf8"))
      .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
  });

  it("keeps monster ids stable and unique for callback routing", () => {
    const ids = monsters.map((monster) => monster.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("monster.mimic-shawarma");
    expect(ids).toContain("monster.deadline-spider");
  });

  it("rejects invalid versions, pages, monsters, prefixes, and overlong data", () => {
    expect(parseBestiaryCallbackData("v2:bst:list:0")).toEqual({
      ok: false,
      error: "invalid-version"
    });
    expect(parseBestiaryCallbackData("v1:bst:list:-1")).toEqual({
      ok: false,
      error: "invalid-page"
    });
    expect(parseBestiaryCallbackData("v1:bst:list:1000")).toEqual({
      ok: false,
      error: "invalid-page"
    });
    expect(parseBestiaryCallbackData("v1:bst:mon:bad:0")).toEqual({
      ok: false,
      error: "invalid-monster"
    });
    expect(parseBestiaryCallbackData("v1:bst:sp:bad:0")).toEqual({
      ok: false,
      error: "invalid-special"
    });
    expect(parseBestiaryCallbackData("v1:bst:r:extra")).toEqual({
      ok: false,
      error: "invalid-source"
    });
    expect(parseBestiaryCallbackData("v1:bst:list:0:x")).toEqual({
      ok: false,
      error: "invalid-source"
    });
    expect(parseBestiaryCallbackData("v1:bst:mon:monster.deadline-spider:0:x")).toEqual({
      ok: false,
      error: "invalid-source"
    });
    expect(parseBestiaryCallbackData("v1:item:inventory")).toEqual({
      ok: false,
      error: "invalid-prefix"
    });
    expect(parseBestiaryCallbackData(`v1:bst:mon:monster.${"a".repeat(80)}:0`)).toEqual({
      ok: false,
      error: "too-long"
    });
  });
});
