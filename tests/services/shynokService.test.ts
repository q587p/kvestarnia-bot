import { describe, expect, it } from "vitest";
import { getRoundPrice } from "../../src/services/shynokService";

describe("shynokService", () => {
  it("caps round prices instead of using the tavern numbers as a floor", () => {
    expect(getRoundPrice("simple", 1)).toBe(13);
    expect(getRoundPrice("simple", 2)).toBe(26);
    expect(getRoundPrice("simple", 8)).toBe(93);
    expect(getRoundPrice("fine", 1)).toBe(42);
    expect(getRoundPrice("fine", 2)).toBe(84);
    expect(getRoundPrice("fine", 5)).toBe(193);
  });
});
