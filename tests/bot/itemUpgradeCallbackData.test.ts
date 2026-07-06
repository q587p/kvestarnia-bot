import { describe, expect, it } from "vitest";
import {
  getItemUpgradeCallbackKey,
  makeItemUpgradeAttemptCallbackData,
  makeItemUpgradeMenuCallbackData,
  makeItemUpgradeOrderCallbackData,
  makeItemUpgradePreviewCallbackData,
  parseItemUpgradeCallbackData,
  resolveItemUpgradeCallbackKey
} from "../../src/bot/callbacks/itemUpgradeCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";
import { items } from "../../src/content";

describe("item upgrade callback data", () => {
  it("keeps item keys compact and collision-free for the authored item catalog", () => {
    const keys = items.map((item) => getItemUpgradeCallbackKey(item.id));

    expect(new Set(keys).size).toBe(keys.length);

    for (const item of items) {
      const key = getItemUpgradeCallbackKey(item.id);
      expect(key).toMatch(/^[A-Za-z0-9_-]{8}$/);
      expect(resolveItemUpgradeCallbackKey(key)).toBe(item.id);
    }
  });

  it("keeps upgrade callback payloads under Telegram limits", () => {
    const itemId = "item.ability.last-page-rapier";
    const donorItemId = "item.dagger-red-line";
    const callbacks = [
      makeItemUpgradeMenuCallbackData(),
      makeItemUpgradePreviewCallbackData({ method: "npc", itemId }),
      makeItemUpgradePreviewCallbackData({ method: "self", itemId }),
      makeItemUpgradePreviewCallbackData({ method: "npc", itemId, donorItemId }),
      makeItemUpgradeOrderCallbackData(itemId, donorItemId),
      makeItemUpgradeAttemptCallbackData({ method: "npc", itemId, fromLevel: 0, donorItemId })
    ];

    for (const callback of callbacks) {
      expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
    }
  });

  it("parses stale-safe attempt callbacks with expected from level", () => {
    const itemId = "item.ability.last-page-rapier";
    const data = makeItemUpgradeAttemptCallbackData({ method: "self", itemId, fromLevel: 2 });

    expect(parseItemUpgradeCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "attempt",
        method: "self",
        itemKey: getItemUpgradeCallbackKey(itemId),
        fromLevel: 2,
        donorItemKey: null
      }
    });
  });

  it("parses explicit donor item keys for upgrade attempts", () => {
    const itemId = "item.ability.last-page-rapier";
    const donorItemId = "item.dagger-red-line";
    const data = makeItemUpgradeAttemptCallbackData({ method: "npc", itemId, fromLevel: 1, donorItemId });

    expect(parseItemUpgradeCallbackData(data)).toEqual({
      ok: true,
      value: {
        type: "attempt",
        method: "npc",
        itemKey: getItemUpgradeCallbackKey(itemId),
        fromLevel: 1,
        donorItemKey: getItemUpgradeCallbackKey(donorItemId)
      }
    });
  });
});
