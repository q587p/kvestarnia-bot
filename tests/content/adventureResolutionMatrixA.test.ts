import { describe, expect, it } from "vitest";
import {
  getAdventureResolutionMatrixDimensions,
  runAdventureResolutionMatrixShard
} from "./adventureResolutionMatrix";

describe("adventure resolution matrix shard A", () => {
  it("keeps every assigned problem/race/class combination and invariant", () => {
    const result = runAdventureResolutionMatrixShard(0);

    expect(getAdventureResolutionMatrixDimensions()).toEqual({
      problems: 238,
      races: 9,
      classes: 9,
      combinations: 19_278
    });
    expect(result.problemCount).toBe(80);
    expect(result.combinationCount).toBe(6_480);
    expect(result.failures).toEqual([]);
  });
});
