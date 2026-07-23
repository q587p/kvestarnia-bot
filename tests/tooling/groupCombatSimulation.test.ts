import { describe, expect, it } from "vitest";
import {
  formatGroupCombatSimulationReport,
  runGroupCombatHardeningSimulation
} from "../../src/tooling/groupCombatSimulation";

describe("groupCombatSimulation", () => {
  it("covers 2x2 and 3x3 support profiles across 13 and 25 turns with explicit invariants", () => {
    const report = runGroupCombatHardeningSimulation();
    expect(report.rows).toHaveLength(24);
    expect(new Set(report.rows.map((row) => `${row.partySize}x${row.enemyCount}:${row.requestedTurns}`))).toEqual(
      new Set(["2x2:13", "2x2:25", "3x3:13", "3x3:25"])
    );
    expect(report.rows.every((row) =>
      row.deterministicReplay && row.legalTargetsOnly && row.contributionBalanced
    )).toBe(true);
    expect(formatGroupCombatSimulationReport(report)).toContain("six support profiles");
  });
});
