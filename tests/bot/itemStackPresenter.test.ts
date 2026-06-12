import { describe, expect, it } from "vitest";
import { presentItemStackLine } from "../../src/bot/presenters/itemStackPresenter";

describe("item stack presenter", () => {
  it("does not show quantity for a single item", () => {
    expect(
      presentItemStackLine({
        name: "Квиток мокрого героя",
        quantity: 1
      })
    ).toBe("• Квиток мокрого героя");
  });

  it("shows quantity only for stacked items", () => {
    expect(
      presentItemStackLine({
        name: "Квиток мокрого героя",
        quantity: 2
      })
    ).toBe("• Квиток мокрого героя ×2");
  });
});
