import { describe, expect, it } from "vitest";
import { runAdventureResolutionMatrixShard } from "./adventureResolutionMatrix";

describe("adventure resolution matrix shard C", () => {
  it("keeps every assigned problem/race/class combination and invariant", () => {
    const result = runAdventureResolutionMatrixShard(2);

    expect(result.problemCount).toBe(79);
    expect(result.combinationCount).toBe(6_399);
    expect(result.failures).toEqual([]);
  });
});
