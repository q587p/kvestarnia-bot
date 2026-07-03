import { describe, expect, it } from "vitest";
import {
  makeItemCraftConfirmCallbackData,
  makeItemCraftPreviewCallbackData,
  parseItemCraftCallbackData
} from "../../src/bot/callbacks/itemCraftCallbackData";

describe("item craft callback data", () => {
  it("round-trips supported recipe callbacks", () => {
    expect(parseItemCraftCallbackData(makeItemCraftPreviewCallbackData("dense"))).toEqual({
      ok: true,
      value: {
        type: "preview",
        recipeCode: "dense"
      }
    });
    expect(parseItemCraftCallbackData(makeItemCraftConfirmCallbackData("kit"))).toEqual({
      ok: true,
      value: {
        type: "confirm",
        recipeCode: "kit"
      }
    });
  });

  it("rejects unknown recipes and malformed actions", () => {
    expect(parseItemCraftCallbackData("v1:craft:p:nope")).toEqual({ ok: false });
    expect(parseItemCraftCallbackData("v1:craft:drop:dense")).toEqual({ ok: false });
  });
});
