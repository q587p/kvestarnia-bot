import { describe, expect, it } from "vitest";
import {
  makeNewsEntryCallbackData,
  makeNewsListCallbackData,
  parseNewsCallbackData
} from "../../src/bot/callbacks/newsCallbackData";

describe("news callback data", () => {
  it("accepts valid list callbacks", () => {
    expect(parseNewsCallbackData(makeNewsListCallbackData(2))).toEqual({
      ok: true,
      value: { type: "list", page: 2 }
    });
  });

  it("accepts valid entry callbacks", () => {
    expect(parseNewsCallbackData(makeNewsEntryCallbackData(3, 1))).toEqual({
      ok: true,
      value: { type: "entry", entryIndex: 3, listPage: 1 }
    });
  });

  it("rejects invalid callbacks", () => {
    expect(parseNewsCallbackData("v2:news:list:0").ok).toBe(false);
    expect(parseNewsCallbackData("v1:news:list:-1").ok).toBe(false);
    expect(parseNewsCallbackData("v1:news:entry:0").ok).toBe(false);
    expect(parseNewsCallbackData("v1:menu:hero").ok).toBe(false);
  });
});
