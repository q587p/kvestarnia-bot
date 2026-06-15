import { describe, expect, it } from "vitest";
import {
  makeEquipItemCallbackData,
  makeEquipmentCallbackData,
  makeInventoryCallbackData,
  makeItemDetailCallbackData,
  makeUnequipSlotCallbackData,
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
        itemId: "item.wet-hero-ticket",
        page: 0,
        slot: null
      }
    });

    expect(parseItemCallbackData(makeItemDetailCallbackData("item.wet-hero-ticket", 2))).toEqual({
      ok: true,
      value: {
        type: "detail",
        itemId: "item.wet-hero-ticket",
        page: 2,
        slot: null
      }
    });
    expect(
      parseItemCallbackData(makeItemDetailCallbackData("item.wet-hero-ticket", 2, "weapon"))
    ).toEqual({
      ok: true,
      value: {
        type: "detail",
        itemId: "item.wet-hero-ticket",
        page: 2,
        slot: "weapon"
      }
    });
  });

  it("parses inventory and equipment navigation callbacks", () => {
    expect(parseItemCallbackData(makeInventoryCallbackData())).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 0,
        slot: null
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(3))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 3,
        slot: null
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(1, "chest"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 1,
        slot: "chest"
      }
    });
    expect(parseEquipmentCallbackData(makeEquipmentCallbackData())).toEqual({
      ok: true,
      value: {
        type: "view"
      }
    });
  });

  it("parses valid equip and unequip callbacks", () => {
    const equip = makeEquipItemCallbackData("item.pan-of-persuasion");
    const clear = makeUnequipSlotCallbackData("weapon");

    expect(Buffer.byteLength(equip, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(clear, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseEquipmentCallbackData(equip)).toEqual({
      ok: true,
      value: {
        type: "equip-item",
        itemId: "item.pan-of-persuasion"
      }
    });
    expect(parseEquipmentCallbackData(clear)).toEqual({
      ok: true,
      value: {
        type: "clear-slot",
        slot: "weapon"
      }
    });
  });

  it("rejects invalid item and equipment callbacks", () => {
    expect(parseItemCallbackData("v1:item:detail:<b>oops</b>").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:extra").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:nope").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:nope").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:1:extra").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:s:boots").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:s:boots").ok).toBe(false);
    expect(parseItemCallbackData("v1:equip:view").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:wear:item.pan-of-persuasion").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:item:<b>oops</b>").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:clear:boots").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:item:inventory").ok).toBe(false);
  });

  it("rejects too-long callback data", () => {
    const tooLongItemId = `item.${"very-".repeat(20)}long`;

    expect(parseItemCallbackData(`v1:item:detail:${tooLongItemId}`).ok).toBe(false);
    expect(parseEquipmentCallbackData(`v1:equip:item:${tooLongItemId}`).ok).toBe(false);
    expect(() => makeItemDetailCallbackData(tooLongItemId)).toThrow(RangeError);
    expect(() => makeEquipItemCallbackData(tooLongItemId)).toThrow(RangeError);
  });
});
