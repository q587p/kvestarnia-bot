import { describe, expect, it } from "vitest";
import {
  makeItemUpgradeAttemptCallbackData,
  makeItemUpgradeListCallbackData,
  makeItemUpgradePreviewCallbackData,
  makeItemUpgradeUnlockCallbackData,
  parseItemUpgradeCallbackData
} from "../../src/bot/callbacks/itemUpgradeCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

describe("item upgrade callback data", () => {
  it("serializes compact list, preview and attempt callbacks", () => {
    const list = makeItemUpgradeListCallbackData();
    const listPage = makeItemUpgradeListCallbackData(3);
    const unlock = makeItemUpgradeUnlockCallbackData();
    const preview = makeItemUpgradePreviewCallbackData(
      "item.mantok.coverage.path.ordinary-route-ruler",
      "self",
      "item.mantok.coverage.path.local-paper-hat"
    );
    const attempt = makeItemUpgradeAttemptCallbackData({
      itemId: "item.mantok.coverage.path.ordinary-route-ruler",
      method: "self",
      donorItemId: "item.mantok.coverage.path.local-paper-hat",
      expectedFromLevel: 2,
      expectedQuantity: 13,
      expectedPityFailures: 4
    });

    expect(Buffer.byteLength(list, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(listPage, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(unlock, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(preview, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(Buffer.byteLength(attempt, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    expect(parseItemUpgradeCallbackData(list)).toEqual({
      ok: true,
      value: { type: "list", page: 0 }
    });
    expect(parseItemUpgradeCallbackData(listPage)).toEqual({
      ok: true,
      value: { type: "list", page: 3 }
    });
    expect(parseItemUpgradeCallbackData(unlock)).toEqual({
      ok: true,
      value: { type: "unlock" }
    });
    expect(parseItemUpgradeCallbackData(preview)).toEqual({
      ok: true,
      value: {
        type: "preview",
        itemId: "item.mantok.coverage.path.ordinary-route-ruler",
        method: "self",
        donorItemId: "item.mantok.coverage.path.local-paper-hat"
      }
    });
    expect(parseItemUpgradeCallbackData(attempt)).toEqual({
      ok: true,
      value: {
        type: "attempt",
        itemId: "item.mantok.coverage.path.ordinary-route-ruler",
        method: "self",
        donorItemId: "item.mantok.coverage.path.local-paper-hat",
        expectedFromLevel: 2,
        expectedQuantity: 13,
        expectedPityFailures: 4
      }
    });
  });

  it("keeps stale snapshot fields in direct attempts", () => {
    const data = makeItemUpgradeAttemptCallbackData({
      itemId: "item.pan-of-persuasion",
      method: "npc",
      expectedFromLevel: 0,
      expectedQuantity: 1,
      expectedPityFailures: 5
    });

    expect(parseItemUpgradeCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "attempt",
        itemId: "item.pan-of-persuasion",
        method: "npc",
        donorItemId: null,
        expectedFromLevel: 0,
        expectedQuantity: 1,
        expectedPityFailures: 5
      }
    });
  });

  it("rejects malformed or oversized callback data", () => {
    expect(parseItemUpgradeCallbackData("v1:up:p:item.pan-of-persuasion:x")).toEqual({ ok: false });
    expect(parseItemUpgradeCallbackData("v1:up:l:nope")).toEqual({ ok: false });
    expect(parseItemUpgradeCallbackData("v1:up:l:1:extra")).toEqual({ ok: false });
    expect(parseItemUpgradeCallbackData("v1:up:a:item.pan-of-persuasion:n:0")).toEqual({ ok: false });
    expect(parseItemUpgradeCallbackData("v1:up:a:item.pan-of-persuasion:n:0:1:nope")).toEqual({ ok: false });
    expect(parseItemUpgradeCallbackData(`v1:up:l:${"x".repeat(80)}`)).toEqual({ ok: false });
  });
});
