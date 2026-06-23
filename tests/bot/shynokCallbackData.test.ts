import { describe, expect, it } from "vitest";
import {
  makeShynokDrinkConfirmCallbackData,
  makeShynokDrinkPreviewCallbackData,
  makeShynokRoundConfirmCallbackData,
  makeShynokSaleAddCallbackData,
  makeShynokSaleConfirmCallbackData,
  parseShynokCallbackData
} from "../../src/bot/callbacks/shynokCallbackData";

describe("shynokCallbackData", () => {
  const token = "12345678-1234-4234-9234-123456789abc";

  it("round-trips compact drink, round and sale callbacks", () => {
    expect(parseShynokCallbackData(makeShynokDrinkPreviewCallbackData("drink.thyme-tea"))).toEqual({
      ok: true,
      value: { type: "drink-preview", drinkKey: "drink.thyme-tea" }
    });
    expect(parseShynokCallbackData(makeShynokDrinkConfirmCallbackData(token))).toEqual({
      ok: true,
      value: { type: "drink-confirm", token }
    });
    expect(parseShynokCallbackData(makeShynokRoundConfirmCallbackData("fine", token))).toEqual({
      ok: true,
      value: { type: "round-confirm", tier: "fine", token }
    });
    expect(parseShynokCallbackData(makeShynokSaleAddCallbackData(token, 2, 4))).toEqual({
      ok: true,
      value: { type: "sale-add", token, page: 2, index: 4 }
    });
    expect(parseShynokCallbackData(makeShynokSaleConfirmCallbackData(token))).toEqual({
      ok: true,
      value: { type: "sale-confirm", token }
    });
  });

  it("rejects invalid or oversized callbacks", () => {
    expect(parseShynokCallbackData("v1:sh:dp:not-a-drink").ok).toBe(false);
    expect(parseShynokCallbackData("v1:sh:dc:not-a-token").ok).toBe(false);
    expect(parseShynokCallbackData(`v1:sh:dc:${"a".repeat(80)}`).ok).toBe(false);
  });
});
