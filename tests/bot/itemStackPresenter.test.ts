import { describe, expect, it } from "vitest";
import { presentItemStackLine } from "../../src/bot/presenters/itemStackPresenter";

describe("item stack presenter", () => {
  it("does not show quantity for a single item", () => {
    expect(
      presentItemStackLine({
        name: "Квиток мокрого пригодника",
        quantity: 1
      })
    ).toBe("• Квиток мокрого пригодника");
  });

  it("shows quantity only for stacked items", () => {
    expect(
      presentItemStackLine({
        name: "Квиток мокрого пригодника",
        quantity: 2
      })
    ).toBe("• Квиток мокрого пригодника ×2");
  });
});
