import { describe, expect, it } from "vitest";
import { monsters } from "../../src/content";
import {
  makeBestiaryListCallbackData,
  makeBestiaryMonsterCallbackData,
  parseBestiaryCallbackData
} from "../../src/bot/callbacks/bestiaryCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("bestiary callback data", () => {
  it("parses list and monster callbacks", () => {
    expect(parseBestiaryCallbackData(makeBestiaryListCallbackData(2))).toEqual({
      ok: true,
      value: {
        type: "list",
        page: 2
      }
    });
    expect(parseBestiaryCallbackData(makeBestiaryMonsterCallbackData("monster.deadline-spider", 1))).toEqual({
      ok: true,
      value: {
        type: "monster",
        monsterId: "monster.deadline-spider",
        page: 1
      }
    });
  });

  it("keeps all current monster callbacks within Telegram limit", () => {
    for (const monster of monsters) {
      expect(Buffer.byteLength(makeBestiaryMonsterCallbackData(monster.id, 999), "utf8"))
        .toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
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
