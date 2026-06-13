import { describe, expect, it } from "vitest";
import {
  makeEquipmentCallbackData,
  makeInventoryCallbackData,
  makeItemDetailCallbackData,
  parseEquipmentCallbackData,
  parseItemCallbackData
} from "../../src/bot/callbacks/itemCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("item and equipment callback data", () => {
  it("parses valid item detail callbacks", () => {
    const data = makeItemDetailCallbackData("item.wet-hero-ticket");

    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseItemCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "detail",
        itemId: "item.wet-hero-ticket"
      }
    });
  });

  it("parses inventory and equipment navigation callbacks", () => {
    expect(parseItemCallbackData(makeInventoryCallbackData())).toEqual({
      ok: true,
      value: {
        type: "inventory"
      }
    });
    expect(parseEquipmentCallbackData(makeEquipmentCallbackData())).toEqual({
      ok: true,
      value: {
        type: "view"
      }
    });
  });

  it("rejects invalid item and equipment callbacks", () => {
    expect(parseItemCallbackData("v1:item:detail:<b>oops</b>").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:extra").ok).toBe(false);
    expect(parseItemCallbackData("v1:equip:view").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:wear:item.pan-of-persuasion").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:item:inventory").ok).toBe(false);
  });
});
