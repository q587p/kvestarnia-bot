import { describe, expect, it } from "vitest";
import {
  buildOutlierWarnings,
  buildSummaryWarnings,
  formatCombatSimulationReport,
  runCombatSimulation,
  summarizeCombatRuns,
  type CombatSimulationRow,
  type CombatSimulationRunResult
} from "../../src/tooling/combatSimulation";

describe("combatSimulation", () => {
  it("returns deterministic reports for the same options and seed", () => {
    const options = {
      levels: [1, 2],
      monsterLevels: [1, 2],
      runsPerMatchup: 4,
      seed: "simulation-seed",
      classIds: ["class.bureaucramancer", "class.jester"],
      policy: "aggressive" as const,
      maxTurns: 12
    };

    const first = runCombatSimulation(options);
    const second = runCombatSimulation(options);

    expect(first).toEqual(second);
  });

  it("summarizes combat runs with correct win and average counts", () => {
    const runs: CombatSimulationRunResult[] = [
      { outcome: "won", turns: 2, endingHp: 8, manaSpent: 2 },
      { outcome: "lost", turns: 4, endingHp: 0, manaSpent: 5 },
      { outcome: "fled", turns: 1, endingHp: 6, manaSpent: 0 },
      { outcome: "expired", turns: 3, endingHp: 4, manaSpent: 1 }
    ];

    expect(summarizeCombatRuns(runs)).toEqual({
      totalRuns: 4,
      wins: 1,
      losses: 1,
      flees: 1,
      expired: 1,
      winRate: 0.25,
      lossRate: 0.25,
      fleeRate: 0.25,
      expiredRate: 0.25,
      averageTurns: 2.5,
      averageEndingHp: 4.5,
      averageManaSpent: 2
    });
  });

  it("flags same-level warning thresholds for weak or extreme fight balance", () => {
    const lowWinWarnings = buildSummaryWarnings(
      {
        totalRuns: 10,
        wins: 7,
        losses: 2,
        flees: 1,
        expired: 0,
        winRate: 0.7,
        lossRate: 0.2,
        fleeRate: 0.1,
        expiredRate: 0,
        averageTurns: 3,
        averageEndingHp: 5,
        averageManaSpent: 4
      },
      {
        sameLevelOrdinaryFight: true,
        heroLevel: 3,
        monsterLevel: 3,
        classId: "class.bureaucramancer",
        className: "Бюрокромант",
        monsterLabel: "Паперова хмара"
      }
    );

    expect(lowWinWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining("below the 75% floor")])
    );

    const highWinWarnings = buildSummaryWarnings(
      {
        totalRuns: 10,
        wins: 10,
        losses: 0,
        flees: 0,
        expired: 0,
        winRate: 1,
        lossRate: 0,
        fleeRate: 0,
        expiredRate: 0,
        averageTurns: 1.5,
        averageEndingHp: 10,
        averageManaSpent: 1
      },
      {
        sameLevelOrdinaryFight: true,
        heroLevel: 2,
        monsterLevel: 2,
        classId: "class.jester",
        className: "Жартівник",
        monsterLabel: "Канцелярський міхур"
      }
    );

    expect(highWinWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("above the 90% ceiling"),
        expect.stringContaining("too short")
      ])
    );
  });

  it("flags long fights and expired cutoffs", () => {
    const warnings = buildSummaryWarnings(
      {
        totalRuns: 10,
        wins: 8,
        losses: 1,
        flees: 0,
        expired: 1,
        winRate: 0.8,
        lossRate: 0.1,
        fleeRate: 0,
        expiredRate: 0.1,
        averageTurns: 6,
        averageEndingHp: 3,
        averageManaSpent: 5
      },
      {
        sameLevelOrdinaryFight: true,
        heroLevel: 4,
        monsterLevel: 4,
        classId: "class.alchemist",
        className: "Алхімік",
        monsterLabel: "Монстр"
      }
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("too long"),
        expect.stringContaining("expired rate")
      ])
    );
  });

  it("detects strong outliers and formats a readable report for a tiny run", () => {
    const rows: CombatSimulationRow[] = [
      makeRow("class.bureaucramancer", "Бюрокромант", 1, 1, 0.95),
      makeRow("class.jester", "Жартівник", 1, 1, 0.74),
      makeRow("class.alchemist", "Алхімік", 1, 1, 0.73)
    ];

    const warnings = buildOutlierWarnings(rows);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("strong outlier");

    const report = runCombatSimulation({
      levels: [1],
      monsterLevels: [1],
      runsPerMatchup: 2,
      seed: "tiny-sample",
      classIds: ["class.bureaucramancer"],
      policy: "aggressive",
      maxTurns: 8
    });

    const formatted = formatCombatSimulationReport(report);

    expect(formatted).toContain("Combat simulation report");
    expect(formatted).toContain("Warnings summary");
    expect(report.rows).toHaveLength(1);
  });

  it("uses exact ladder monsters when simulating levels 4 and 13", () => {
    const report = runCombatSimulation({
      levels: [4, 13],
      monsterLevels: "same",
      runsPerMatchup: 1,
      seed: "ladder-sanity",
      classIds: ["class.bureaucramancer"],
      policy: "aggressive",
      maxTurns: 8
    });

    expect(report.rows).toHaveLength(2);
    expect(report.rows.map((row) => row.heroLevel)).toEqual([4, 13]);
    expect(report.rows.map((row) => row.monsterLevel)).toEqual([4, 13]);
    expect(report.rows.map((row) => row.monsterId)).toEqual(
      expect.arrayContaining([
        "monster.complaint-lantern",
        "monster.quiet-catastrophe-clerk"
      ])
    );
  });

  it("uses the configured hidden path in hero stat math", () => {
    const baseOptions = {
      levels: [2],
      monsterLevels: "same" as const,
      runsPerMatchup: 20,
      seed: "path-sensitive",
      classIds: ["class.rogue"],
      raceId: "race.human-ish",
      policy: "aggressive" as const,
      maxTurns: 20
    };
    const boundary = runCombatSimulation({ ...baseOptions, path: "boundary" });
    const sun = runCombatSimulation({ ...baseOptions, path: "sun" });

    expect(boundary.path).toBe("boundary");
    expect(sun.path).toBe("sun");
    expect(sun.rows[0]?.summary.averageEndingHp).toBeGreaterThan(
      boundary.rows[0]?.summary.averageEndingHp ?? 0
    );
  });
});

function makeRow(
  classId: string,
  className: string,
  heroLevel: number,
  monsterLevel: number,
  winRate: number
): CombatSimulationRow {
  return {
    heroLevel,
    monsterLevel,
    classId,
    className,
    raceId: "race.human-ish",
    raceName: "Людиноподібні",
    monsterId: "monster.test",
    monsterName: "Тестовий монстр",
    summary: {
      totalRuns: 100,
      wins: Math.round(winRate * 100),
      losses: 100 - Math.round(winRate * 100),
      flees: 0,
      expired: 0,
      winRate,
      lossRate: 1 - winRate,
      fleeRate: 0,
      expiredRate: 0,
      averageTurns: 3,
      averageEndingHp: 7,
      averageManaSpent: 4
    },
    warnings: []
  };
}
