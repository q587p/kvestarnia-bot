import { describe, expect, it } from "vitest";
import {
  makeMantokChestAutoCallbackData,
  makeMantokChestCancelCallbackData,
  makeMantokChestConfirmCallbackData,
  makeMantokChestHelpCallbackData,
  makeMantokChestInventoryCallbackData,
  makeMantokChestAddCallbackData,
  makeMantokChestManualCallbackData,
  makeMantokChestOpenCallbackData,
  makeMantokChestPageCallbackData,
  makeMantokChestPreviewCallbackData,
  makeMantokChestRemoveCallbackData,
  parseMantokChestCallbackData
} from "../../src/bot/callbacks/mantokChestCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";

const token = "12345678-1234-4234-9234-123456789abc";

describe("Mantok Chest callback data", () => {
  it("parses valid callbacks within Telegram limits", () => {
    const callbacks = [
      makeMantokChestOpenCallbackData(),
      makeMantokChestHelpCallbackData(),
      makeMantokChestAutoCallbackData(),
      makeMantokChestManualCallbackData(),
      makeMantokChestInventoryCallbackData(),
      makeMantokChestPageCallbackData(token, 12),
      makeMantokChestAddCallbackData(token, 12, 99),
      makeMantokChestRemoveCallbackData(token, 12, 99),
      makeMantokChestPreviewCallbackData(token),
      makeMantokChestConfirmCallbackData(token),
      makeMantokChestCancelCallbackData(token)
    ];

    for (const callback of callbacks) {
      expect(Buffer.byteLength(callback, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
      expect(parseMantokChestCallbackData(callback).ok).toBe(true);
    }

    expect(parseMantokChestCallbackData(makeMantokChestConfirmCallbackData(token))).toEqual({
      ok: true,
      value: {
        type: "confirm",
        token
      }
    });
    expect(parseMantokChestCallbackData(makeMantokChestAddCallbackData(token, 2, 3))).toEqual({
      ok: true,
      value: {
        type: "add",
        token,
        page: 2,
        index: 3
      }
    });
    expect(parseMantokChestCallbackData(makeMantokChestRemoveCallbackData(token, 4, 5))).toEqual({
      ok: true,
      value: {
        type: "remove",
        token,
        page: 4,
        index: 5
      }
    });
    expect(parseMantokChestCallbackData(makeMantokChestPreviewCallbackData(token))).toEqual({
      ok: true,
      value: {
        type: "preview",
        token
      }
    });
  });

  it("rejects invalid and overlong callbacks", () => {
    expect(parseMantokChestCallbackData("v1:chest:confirm:not-a-token").ok).toBe(false);
    expect(parseMantokChestCallbackData("v1:chest:auto:extra").ok).toBe(false);
    expect(parseMantokChestCallbackData(`v1:chest:add:${token}:not-a-page:1`).ok).toBe(false);
    expect(parseMantokChestCallbackData(`v1:chest:add:${token}:1:not-an-index`).ok).toBe(false);
    expect(parseMantokChestCallbackData("v1:item:inventory").ok).toBe(false);
    expect(parseMantokChestCallbackData(`v1:chest:confirm:${"a".repeat(80)}`).ok).toBe(false);
    expect(() => makeMantokChestConfirmCallbackData("a".repeat(80))).toThrow(RangeError);
  });
});
