import { describe, expect, it } from "vitest";
import {
  makeEquipItemCallbackData,
  makeEquipmentCallbackData,
  makeInventoryCallbackData,
  makeInventoryPagePromptCallbackData,
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
        filter: null
      }
    });

    expect(parseItemCallbackData(makeItemDetailCallbackData("item.wet-hero-ticket", 2))).toEqual({
      ok: true,
      value: {
        type: "detail",
        itemId: "item.wet-hero-ticket",
        page: 2,
        filter: null
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
        filter: "weapon"
      }
    });
    expect(
      parseItemCallbackData(makeItemDetailCallbackData("item.responsible-panic-bandage", 1, "one-use"))
    ).toEqual({
      ok: true,
      value: {
        type: "detail",
        itemId: "item.responsible-panic-bandage",
        page: 1,
        filter: "one-use"
      }
    });
  });

  it("parses inventory and equipment navigation callbacks", () => {
    expect(parseItemCallbackData(makeInventoryCallbackData())).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 0,
        filter: null
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(3))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 3,
        filter: null
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(1, "chest"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 1,
        filter: "chest"
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(0, "offhand"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 0,
        filter: "offhand"
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(0, "tool"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 0,
        filter: "tool"
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(2, "one-use"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 2,
        filter: "one-use"
      }
    });
    expect(parseItemCallbackData(makeInventoryPagePromptCallbackData(25, "offhand"))).toEqual({
      ok: true,
      value: {
        type: "page-prompt",
        totalPages: 25,
        filter: "offhand"
      }
    });
    expect(makeInventoryPagePromptCallbackData(4, "offhand")).toBe("v1:item:page:s:o:4");
    expect(makeInventoryPagePromptCallbackData(25)).toBe("v1:item:page:25");
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
    const clearTool = makeUnequipSlotCallbackData("tool");

    expect(Buffer.byteLength(equip, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(clear, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseEquipmentCallbackData(equip)).toEqual({
      ok: true,
      value: {
        type: "equip-item",
        itemId: "item.pan-of-persuasion",
        targetSlot: null,
        confirmTwohand: false
      }
    });
    expect(parseEquipmentCallbackData(clear)).toEqual({
      ok: true,
      value: {
        type: "clear-slot",
        slot: "weapon"
      }
    });
    expect(parseEquipmentCallbackData(clearTool)).toEqual({
      ok: true,
      value: {
        type: "clear-slot",
        slot: "tool"
      }
    });
  });

  it("parses target-slot equip callbacks", () => {
    const equipOffhand = makeEquipItemCallbackData("item.pan-of-persuasion", "offhand");

    expect(Buffer.byteLength(equipOffhand, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(equipOffhand).toBe("v1:equip:item:item.pan-of-persuasion:s:o");
    expect(parseEquipmentCallbackData(equipOffhand)).toEqual({
      ok: true,
      value: {
        type: "equip-item",
        itemId: "item.pan-of-persuasion",
        targetSlot: "offhand",
        confirmTwohand: false
      }
    });
  });

  it("parses twohand confirmation equip callbacks", () => {
    const confirmTwohand = makeEquipItemCallbackData("item.test-twohand-broom", "weapon", {
      confirmTwohand: true
    });

    expect(confirmTwohand).toBe("v1:equip:item:item.test-twohand-broom:s:w:c:2h");
    expect(parseEquipmentCallbackData(confirmTwohand)).toEqual({
      ok: true,
      value: {
        type: "equip-item",
        itemId: "item.test-twohand-broom",
        targetSlot: "weapon",
        confirmTwohand: true
      }
    });
  });

  it("rejects invalid item and equipment callbacks", () => {
    expect(parseItemCallbackData("v1:item:detail:<b>oops</b>").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:extra").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:nope").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:nope").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:1:extra").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:page:0").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:page:s:boots:4").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:page:s:o:nope").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:s:boots").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:f:rare").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:s:boots").ok).toBe(false);
    expect(parseItemCallbackData("v1:equip:view").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:wear:item.pan-of-persuasion").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:item:<b>oops</b>").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:item:item.pan-of-persuasion:s:boots").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:item:item.pan-of-persuasion:s:w:c:nope").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:clear:boots").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:clear:weapon:s:o").ok).toBe(false);
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
