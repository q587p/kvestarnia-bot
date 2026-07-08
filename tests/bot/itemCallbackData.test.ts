import { describe, expect, it } from "vitest";
import {
  buildItemCallbackKeyMaps,
  makeEquipItemCallbackData,
  makeEquipmentCallbackData,
  makeInventoryCallbackData,
  makeInventoryPagePromptCallbackData,
  makeStableItemCallbackKey,
  makeItemDetailCallbackData,
  makeUnequipSlotCallbackData,
  parseEquipmentCallbackData,
  parseItemCallbackData
} from "../../src/bot/callbacks/itemCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";
import { items } from "../../src/content";

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
        filter: null,
        sort: "default"
      }
    });

    expect(parseItemCallbackData(makeItemDetailCallbackData("item.wet-hero-ticket", 2))).toEqual({
      ok: true,
      value: {
        type: "detail",
        itemId: "item.wet-hero-ticket",
        page: 2,
        filter: null,
        sort: "default"
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
        filter: "weapon",
        sort: "default"
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
        filter: "one-use",
        sort: "default"
      }
    });
  });

  it("uses compact detail callbacks for long known item ids", () => {
    const data = makeItemDetailCallbackData(
      "item.mantok.coverage.universal.lantern-of-suspicious-corners",
      12,
      "tool"
    );

    expect(data).toMatch(/^v1:item:d:/);
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseItemCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "detail",
        itemId: "item.mantok.coverage.universal.lantern-of-suspicious-corners",
        page: 12,
        filter: "tool",
        sort: "default"
      }
    });
  });

  it("builds compact item callback keys from stable item ids, not array order", () => {
    const itemIds = [
      "item.alpha-stability-proof",
      "item.beta-stability-proof",
      "item.mantok.coverage.universal.lantern-of-suspicious-corners"
    ];
    const originalOrderMaps = buildItemCallbackKeyMaps(itemIds);
    const reversedOrderMaps = buildItemCallbackKeyMaps([...itemIds].reverse());

    for (const itemId of itemIds) {
      const key = originalOrderMaps.itemCallbackKeyById.get(itemId);

      expect(key).toBe(makeStableItemCallbackKey(itemId));
      expect(reversedOrderMaps.itemCallbackKeyById.get(itemId)).toBe(key);
      expect(originalOrderMaps.itemIdByCallbackKey.get(key ?? "")).toBe(itemId);
      expect(reversedOrderMaps.itemIdByCallbackKey.get(key ?? "")).toBe(itemId);
    }
  });

  it("fails loudly when compact item callback keys collide", () => {
    expect(() => buildItemCallbackKeyMaps(
      ["item.collision-one", "item.collision-two"],
      { makeKey: () => "same-key" }
    )).toThrow("Item callback key collision");
  });

  it("keeps item detail callbacks within Telegram limits for all content items", () => {
    for (const item of items) {
      const data = makeItemDetailCallbackData(item.id, 999, "offhand");

      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
      expect(parseItemCallbackData(data)).toEqual({
        ok: true,
        value: {
          type: "detail",
          itemId: item.id,
          page: 999,
          filter: "offhand",
          sort: "default"
        }
      });
    }
  });

  it("parses inventory and equipment navigation callbacks", () => {
    expect(parseItemCallbackData(makeInventoryCallbackData())).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 0,
        filter: null,
        sort: "default"
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(3))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 3,
        filter: null,
        sort: "default"
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(1, "chest"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 1,
        filter: "chest",
        sort: "default"
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(0, "offhand"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 0,
        filter: "offhand",
        sort: "default"
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(0, "tool"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 0,
        filter: "tool",
        sort: "default"
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(2, "one-use"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 2,
        filter: "one-use",
        sort: "default"
      }
    });
    expect(parseItemCallbackData(makeInventoryPagePromptCallbackData(25, "offhand"))).toEqual({
      ok: true,
      value: {
        type: "page-prompt",
        totalPages: 25,
        filter: "offhand",
        sort: "default"
      }
    });
    expect(makeInventoryPagePromptCallbackData(4, "offhand")).toBe("v1:item:page:s:o:4");
    expect(makeInventoryPagePromptCallbackData(25)).toBe("v1:item:page:25");
    expect(parseItemCallbackData(makeInventoryCallbackData(0, null, "date-desc"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 0,
        filter: null,
        sort: "date-desc"
      }
    });
    expect(parseItemCallbackData(makeInventoryCallbackData(2, "one-use", "name-asc"))).toEqual({
      ok: true,
      value: {
        type: "inventory",
        page: 2,
        filter: "one-use",
        sort: "name-asc"
      }
    });
    expect(parseItemCallbackData(makeItemDetailCallbackData("item.wet-hero-ticket", 1, null, "date-asc"))).toEqual({
      ok: true,
      value: {
        type: "detail",
        itemId: "item.wet-hero-ticket",
        page: 1,
        filter: null,
        sort: "date-asc"
      }
    });
    expect(parseItemCallbackData(makeInventoryPagePromptCallbackData(4, "offhand", "name-desc"))).toEqual({
      ok: true,
      value: {
        type: "page-prompt",
        totalPages: 4,
        filter: "offhand",
        sort: "name-desc"
      }
    });
    expect(makeInventoryCallbackData(0, null, "date-desc")).toBe("v1:item:inventory:r:dn");
    expect(makeInventoryCallbackData(2, "one-use", "name-asc")).toBe("v1:item:inventory:f:u:r:az:2");
    expect(makeInventoryPagePromptCallbackData(4, "offhand", "name-desc")).toBe("v1:item:page:s:o:r:za:4");
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
        confirmTwohand: false,
        confirmAttunement: false,
        confirmAttunementInterrupt: false
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

  it("uses compact equip callbacks for long known item ids", () => {
    const data = makeEquipItemCallbackData(
      "item.mantok.coverage.universal.lantern-of-suspicious-corners",
      "tool",
      { confirmTwohand: true }
    );

    expect(data).toMatch(/^v1:equip:i:/);
    expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseEquipmentCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "equip-item",
        itemId: "item.mantok.coverage.universal.lantern-of-suspicious-corners",
        targetSlot: "tool",
        confirmTwohand: true,
        confirmAttunement: false,
        confirmAttunementInterrupt: false
      }
    });
  });

  it("keeps equip callbacks within Telegram limits for all content items", () => {
    for (const item of items) {
      const data = makeEquipItemCallbackData(item.id, "offhand", { confirmTwohand: true });

      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
      expect(parseEquipmentCallbackData(data)).toEqual({
        ok: true,
        value: {
          type: "equip-item",
          itemId: item.id,
          targetSlot: "offhand",
          confirmTwohand: true,
          confirmAttunement: false,
          confirmAttunementInterrupt: false
        }
      });
    }
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
        confirmTwohand: false,
        confirmAttunement: false,
        confirmAttunementInterrupt: false
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
        confirmTwohand: true,
        confirmAttunement: false,
        confirmAttunementInterrupt: false
      }
    });
  });

  it("parses attunement confirmation equip callbacks", () => {
    const confirmAttunement = makeEquipItemCallbackData("item.test-twohand-broom", "weapon", {
      confirmAttunement: true
    });
    const confirmInterrupt = makeEquipItemCallbackData("item.test-twohand-broom", "weapon", {
      confirmAttunementInterrupt: true
    });
    const confirmAll = makeEquipItemCallbackData("item.test-twohand-broom", "weapon", {
      confirmTwohand: true,
      confirmAttunement: true,
      confirmAttunementInterrupt: true
    });

    expect(confirmAttunement).toBe("v1:equip:item:item.test-twohand-broom:s:w:c:t");
    expect(confirmInterrupt).toBe("v1:equip:item:item.test-twohand-broom:s:w:c:i");
    expect(confirmAll).toBe("v1:equip:item:item.test-twohand-broom:s:w:c:2h-t-i");
    expect(parseEquipmentCallbackData(confirmAttunement)).toEqual({
      ok: true,
      value: {
        type: "equip-item",
        itemId: "item.test-twohand-broom",
        targetSlot: "weapon",
        confirmTwohand: false,
        confirmAttunement: true,
        confirmAttunementInterrupt: false
      }
    });
    expect(parseEquipmentCallbackData(confirmInterrupt)).toEqual({
      ok: true,
      value: {
        type: "equip-item",
        itemId: "item.test-twohand-broom",
        targetSlot: "weapon",
        confirmTwohand: false,
        confirmAttunement: false,
        confirmAttunementInterrupt: true
      }
    });
    expect(parseEquipmentCallbackData(confirmAll)).toEqual({
      ok: true,
      value: {
        type: "equip-item",
        itemId: "item.test-twohand-broom",
        targetSlot: "weapon",
        confirmTwohand: true,
        confirmAttunement: true,
        confirmAttunementInterrupt: true
      }
    });
  });

  it("rejects invalid item and equipment callbacks", () => {
    const compactDetailKey = makeItemDetailCallbackData(
      "item.mantok.coverage.universal.lantern-of-suspicious-corners",
      12,
      "tool"
    ).split(":")[3];
    const compactEquipKey = makeEquipItemCallbackData(
      "item.mantok.coverage.universal.lantern-of-suspicious-corners",
      "tool",
      { confirmTwohand: true }
    ).split(":")[3];

    expect(parseItemCallbackData("v1:item:detail:<b>oops</b>").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:extra").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:nope").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:d:unknown").ok).toBe(false);
    expect(parseItemCallbackData(`v1:item:d:${compactDetailKey}:s:boots`).ok).toBe(false);
    expect(parseItemCallbackData(`v1:item:d:${compactDetailKey}:s:t:nope`).ok).toBe(false);
    expect(parseItemCallbackData(`v1:item:d:${compactDetailKey}:s:t:1:extra`).ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:nope").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:r:nope").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:1:extra").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:page:0").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:page:r:nope:4").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:page:s:boots:4").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:page:s:o:nope").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:s:boots").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:inventory:f:rare").ok).toBe(false);
    expect(parseItemCallbackData("v1:item:detail:item.wet-hero-ticket:s:boots").ok).toBe(false);
    expect(parseItemCallbackData("v1:equip:view").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:wear:item.pan-of-persuasion").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:item:<b>oops</b>").ok).toBe(false);
    expect(parseEquipmentCallbackData("v1:equip:i:unknown").ok).toBe(false);
    expect(parseEquipmentCallbackData(`v1:equip:i:${compactEquipKey}:s:boots`).ok).toBe(false);
    expect(parseEquipmentCallbackData(`v1:equip:i:${compactEquipKey}:s:t:c:nope`).ok).toBe(false);
    expect(parseEquipmentCallbackData(`v1:equip:i:${compactEquipKey}:s:t:c:2h:extra`).ok).toBe(false);
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
