import { describe, expect, it } from "vitest";
import { FakeRandomSource } from "../../src/shared/random";

describe("FakeRandomSource", () => {
  it("maps deterministic floats to inclusive integer ranges", () => {
    const random = new FakeRandomSource([0, 0.5, 0.999]);

    expect(random.nextInt(1, 3)).toBe(1);
    expect(random.nextInt(1, 3)).toBe(2);
    expect(random.nextInt(1, 3)).toBe(3);
  });

  it("rejects invalid integer ranges", () => {
    const random = new FakeRandomSource([0]);

    expect(() => random.nextInt(3, 1)).toThrow("maxInclusive");
  });
});
