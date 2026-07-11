import { describe, expect, it } from "vitest";
import { calculateBureaucramancerProtocolManaCost } from "../../src/services/bureaucramancerProtocol";

describe("calculateBureaucramancerProtocolManaCost", () => {
  it.each([
    [{ level: 3, intelligence: 4 }, 8],
    [{ level: 3, intelligence: 5 }, 7],
    [{ level: 8, intelligence: 8 }, 6],
    [{ level: 13, intelligence: 11 }, 5],
    [{ level: 93, intelligence: 93 }, 5]
  ])("uses a bounded level and intelligence discount for %o", (input, expected) => {
    expect(calculateBureaucramancerProtocolManaCost(input)).toBe(expected);
  });

  it("normalizes fractional and negative inputs before applying the discount", () => {
    expect(calculateBureaucramancerProtocolManaCost({ level: 7.9, intelligence: 1.9 })).toBe(7);
    expect(calculateBureaucramancerProtocolManaCost({ level: -3, intelligence: -8 })).toBe(8);
  });
});
