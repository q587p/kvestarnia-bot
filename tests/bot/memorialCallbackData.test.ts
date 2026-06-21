import { describe, expect, it } from "vitest";
import {
  makeMemorialRemortCallbackData,
  parseMemorialCallbackData
} from "../../src/bot/callbacks/memorialCallbackData";

describe("memorial callback data", () => {
  it("round-trips remort milestone callbacks", () => {
    const data = makeMemorialRemortCallbackData(13);

    expect(data).toBe("v1:mem:rm:13");
    expect(parseMemorialCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "remort-levels",
        remortNumber: 13
      }
    });
  });

  it("rejects invalid remort numbers", () => {
    expect(parseMemorialCallbackData("v1:mem:rm:0")).toEqual({
      ok: false,
      error: "invalid-remort"
    });
    expect(parseMemorialCallbackData("v1:mem:rm:nope")).toEqual({
      ok: false,
      error: "invalid-remort"
    });
  });
});
