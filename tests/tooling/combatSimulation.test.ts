import { describe, expect, it } from "vitest";
import {
  buildOutlierWarnings,
  buildSummaryWarnings,
  formatCombatSimulationReport,
  runCombatSimulation,
  summarizeCombatRuns,
  type CombatOutcomeSummary,
  type CombatSimulationRow,
  type CombatSimulationRunResult
} from "../../src/tooling/combatSimulation";
import { monsters } from "../../src/content/monsters";

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
      averageManaSpent: 2,
      basicAttackShare: 0,
      defendShare: 0,
      abilityShare: 0,
      telegraphCount: 0,
      shieldUses: 0,
      healingUses: 0,
      abilityUsage: {},
      classAbilityUsage: {},
      raceAbilityUsage: {},
      fumbleCount: 0,
      aoeEnemyHits: 0,
      allySupportUses: 0
    });
  });

  it("summarizes player class/race ability usage and group effect counts separately", () => {
    const runs: CombatSimulationRunResult[] = [
      {
        outcome: "won",
        turns: 4,
        endingHp: 8,
        manaSpent: 5,
        monsterBasicAttacks: 1,
        monsterDefends: 0,
        monsterAbilities: 1,
        monsterTelegraphs: 0,
        shieldUses: 0,
        healingUses: 0,
        abilityUsage: { "monster.paper-rustle": 1 },
        classAbilityUsage: { "skill.hot-spell": 2 },
        raceAbilityUsage: { "ability.race.dry-tide": 1 },
        fumbleCount: 1,
        aoeEnemyHits: 3,
        allySupportUses: 0
      },
      {
        outcome: "lost",
        turns: 5,
        endingHp: 0,
        manaSpent: 4,
        monsterBasicAttacks: 2,
        monsterDefends: 0,
        monsterAbilities: 0,
        monsterTelegraphs: 0,
        shieldUses: 0,
        healingUses: 0,
        abilityUsage: {},
        classAbilityUsage: { "skill.hot-spell": 1 },
        raceAbilityUsage: { "ability.race.dry-tide": 1 },
        fumbleCount: 2,
        aoeEnemyHits: 2,
        allySupportUses: 1
      }
    ];

    expect(summarizeCombatRuns(runs)).toMatchObject({
      abilityUsage: { "monster.paper-rustle": 1 },
      classAbilityUsage: { "skill.hot-spell": 3 },
      raceAbilityUsage: { "ability.race.dry-tide": 2 },
      fumbleCount: 3,
      aoeEnemyHits: 5,
      allySupportUses: 1
    });
    expect(formatCombatSimulationReport({
      seed: "summary",
      policy: "aggressive",
      raceId: "race.dryland-rusalka",
      raceName: "Русалка сухопутна",
      raceIds: ["race.dryland-rusalka"],
      raceNames: ["Русалка сухопутна"],
      path: "boundary",
      remortCount: 0,
      levels: [3],
      monsterLevels: "same",
      runsPerMatchup: 2,
      maxTurns: 12,
      encounterMode: "one-enemy",
      threatSecondEnemyLevelBonus: 0,
      rows: [makeRow("class.mage", "Маг", 3, 3, 0.5, summarizeCombatRuns(runs))],
      aggregates: [],
      warnings: []
    })).toContain("fumbles 3");
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
    expect(report.rows).toHaveLength(monsters.filter((monster) => monster.level === 1).length);
  });

  it("models remort memory in simulated hero stats", () => {
    const options = {
      levels: [12],
      monsterLevels: [12],
      runsPerMatchup: 20,
      seed: "remort-memory-sanity",
      classIds: ["class.warrior"],
      raceId: "race.human-ish",
      policy: "aggressive" as const,
      maxTurns: 20
    };
    const baseline = runCombatSimulation(options);
    const remorted = runCombatSimulation({ ...options, remortCount: 5 });

    expect(remorted.remortCount).toBe(5);
    expect(formatCombatSimulationReport(remorted)).toContain("remort: 5");
    expect(remorted.rows[0]?.summary.averageEndingHp).toBeGreaterThan(
      baseline.rows[0]?.summary.averageEndingHp ?? 0
    );
  });

  it("keeps high-remort level thirteen monster pressure out of runaway win rates", () => {
    const scenarios = [
      { encounterMode: "one-enemy" as const, remortCount: 5 },
      { encounterMode: "one-enemy" as const, remortCount: 7 },
      { encounterMode: "one-enemy" as const, remortCount: 9 },
      { encounterMode: "two-enemy-threat" as const, remortCount: 5 },
      { encounterMode: "two-enemy-threat" as const, remortCount: 7 },
      { encounterMode: "two-enemy-threat" as const, remortCount: 9 }
    ];

    for (const scenario of scenarios) {
      const report = runCombatSimulation({
        levels: [13],
        monsterLevels: "same",
        runsPerMatchup: 10,
        seed: `high-remort-pressure-${scenario.encounterMode}-r${scenario.remortCount}`,
        raceIds: ["race.human-ish"],
        remortCount: scenario.remortCount,
        encounterMode: scenario.encounterMode,
        policy: "aggressive",
        maxTurns: 20
      });
      const levelAggregate = report.aggregates.find((row) => row.dimension === "level");

      expect(levelAggregate?.winRate).toBeGreaterThanOrEqual(0.5);
      expect(levelAggregate?.winRate).toBeLessThanOrEqual(0.78);
    }
  });

  it("uses every exact ladder monster when simulating levels 4 and 13", () => {
    const report = runCombatSimulation({
      levels: [4, 13],
      monsterLevels: "same",
      runsPerMatchup: 1,
      seed: "ladder-sanity",
      classIds: ["class.bureaucramancer"],
      policy: "aggressive",
      maxTurns: 8
    });

    expect(new Set(report.rows.map((row) => row.heroLevel))).toEqual(new Set([4, 13]));
    expect(new Set(report.rows.map((row) => row.monsterLevel))).toEqual(new Set([4, 13]));
    expect(report.rows.map((row) => row.monsterId)).toEqual(
      expect.arrayContaining([
        "monster.complaint-lantern",
        "monster.quiet-catastrophe-clerk"
      ])
    );
  });

  it("creates deterministic two-enemy threat rows and aggregate summaries", () => {
    const options = {
      levels: [3],
      monsterLevels: "same" as const,
      runsPerMatchup: 3,
      seed: "two-enemy-shape",
      classIds: ["class.mage"],
      raceIds: ["race.human-ish", "race.bisyny"],
      policy: "aggressive" as const,
      maxTurns: 12,
      encounterMode: "two-enemy-threat" as const
    };
    const report = runCombatSimulation(options);
    const repeated = runCombatSimulation(options);

    expect(report).toEqual(repeated);
    expect(report.rows.length).toBeGreaterThan(0);
    expect(report.rows.every((row) => row.enemyCount === 2)).toBe(true);
    expect(report.rows.every((row) => row.enemies.length === 2)).toBe(true);
    expect(report.aggregates.map((aggregate) => aggregate.dimension)).toEqual(
      expect.arrayContaining(["level", "class", "race"])
    );
    expect(formatCombatSimulationReport(report)).toContain("encounter: two-enemy-threat");
  });

  it("covers every authored monster profile across same-level roster simulations", () => {
    const report = runCombatSimulation({
      levels: Array.from({ length: 23 }, (_, index) => index + 1),
      monsterLevels: "same",
      runsPerMatchup: 1,
      seed: "full-roster-sanity",
      classIds: ["class.bureaucramancer"],
      policy: "aggressive",
      maxTurns: 1
    });

    expect(new Set(report.rows.map((row) => row.monsterId))).toEqual(
      new Set(monsters.map((monster) => monster.id))
    );
  });

  it("uses the configured hidden path in hero stat math", () => {
    const baseOptions = {
      levels: [2],
      monsterLevels: "same" as const,
      runsPerMatchup: 50,
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

  it("can choose race abilities during aggressive simulations", () => {
    const report = runCombatSimulation({
      levels: [3],
      monsterLevels: "same",
      runsPerMatchup: 20,
      seed: "race-action-sanity",
      classIds: ["class.warrior"],
      raceId: "race.dryland-rusalka",
      policy: "aggressive",
      maxTurns: 12
    });

    const raceUses = report.rows.reduce(
      (sum, row) =>
        sum + Object.values(row.summary.raceAbilityUsage).reduce((inner, count) => inner + count, 0),
      0
    );

    expect(raceUses).toBeGreaterThan(0);
    expect(formatCombatSimulationReport(report)).toContain("player abilities class");
  });
});

function makeRow(
  classId: string,
  className: string,
  heroLevel: number,
  monsterLevel: number,
  winRate: number,
  summary?: CombatOutcomeSummary
): CombatSimulationRow {
  return {
    encounterMode: "one-enemy",
    enemyCount: 1,
    heroLevel,
    monsterLevel,
    classId,
    className,
    raceId: "race.human-ish",
    raceName: "Людиноподібні",
    monsterId: "monster.test",
    monsterName: "Тестовий монстр",
    enemies: [{
      monsterId: "monster.test",
      monsterName: "Тестовий монстр",
      monsterLevel
    }],
    summary: summary ?? {
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
      averageManaSpent: 4,
      basicAttackShare: 0,
      defendShare: 0,
      abilityShare: 0,
      telegraphCount: 0,
      shieldUses: 0,
      healingUses: 0,
      abilityUsage: {},
      classAbilityUsage: {},
      raceAbilityUsage: {},
      fumbleCount: 0,
      aoeEnemyHits: 0,
      allySupportUses: 0
    },
    warnings: []
  };
}
