import { describe, expect, it } from "vitest";
import {
  makeMantokChestAutoCallbackData,
  makeMantokChestCancelCallbackData,
  makeMantokChestConfirmCallbackData,
  makeMantokChestHelpCallbackData,
  makeMantokChestInventoryCallbackData,
  makeMantokChestOpenCallbackData,
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
      makeMantokChestInventoryCallbackData(),
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
  });

  it("rejects invalid and overlong callbacks", () => {
    expect(parseMantokChestCallbackData("v1:chest:confirm:not-a-token").ok).toBe(false);
    expect(parseMantokChestCallbackData("v1:chest:auto:extra").ok).toBe(false);
    expect(parseMantokChestCallbackData("v1:item:inventory").ok).toBe(false);
    expect(parseMantokChestCallbackData(`v1:chest:confirm:${"a".repeat(80)}`).ok).toBe(false);
    expect(() => makeMantokChestConfirmCallbackData("a".repeat(80))).toThrow(RangeError);
  });
});
