import { describe, expect, it } from "vitest";
import {
  getCharacterPath,
  getPathForPronoun,
  isBoundaryPath,
  isMoonPath,
  isSunPath
} from "../../src/domain/characters/path";

describe("character path helpers", () => {
  it("maps visible pronoun choices to hidden paths", () => {
    expect(getPathForPronoun("he")).toBe("sun");
    expect(getPathForPronoun("she")).toBe("moon");
    expect(getPathForPronoun("they")).toBe("boundary");
  });

  it("prefers stored path and falls back to pronoun for compatibility", () => {
    expect(getCharacterPath({ path: "moon", pronoun: "he" })).toBe("moon");
    expect(getCharacterPath({ pronoun: "he" })).toBe("sun");
    expect(getCharacterPath({ pronoun: "she" })).toBe("moon");
    expect(getCharacterPath({ pronoun: "they" })).toBe("boundary");
    expect(getCharacterPath({ path: "unknown", pronoun: "unknown" })).toBe("boundary");
  });

  it("checks path predicates for strings or character-like objects", () => {
    expect(isSunPath("sun")).toBe(true);
    expect(isSunPath({ pronoun: "he" })).toBe(true);
    expect(isMoonPath({ path: "moon" })).toBe(true);
    expect(isBoundaryPath({ pronoun: "they" })).toBe(true);
    expect(isBoundaryPath(undefined)).toBe(true);
  });
});
