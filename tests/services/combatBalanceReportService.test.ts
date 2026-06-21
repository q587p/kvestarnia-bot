import { describe, expect, it } from "vitest";
import type {
  CombatBalanceAbilityReportRow,
  CombatBalanceAnalyticsRepository,
  CombatBalanceBattleReportRow,
  CombatBalanceReportFilters
} from "../../src/db/repositories/combatBalanceAnalyticsRepository";
import { CombatBalanceReportService } from "../../src/services/combatBalanceReportService";

describe("CombatBalanceReportService", () => {
  it("keeps ability reports manual-only by default and can include timeout actions", async () => {
    const repository = new FakeCombatBalanceAnalyticsRepository();
    const service = new CombatBalanceReportService(repository);

    const manual = parseJsonRows(await service.render({
      view: "ability",
      filters: {},
      minSample: 1,
      format: "json"
    }));
    const all = parseJsonRows(await service.render({
      view: "ability",
      filters: {},
      minSample: 1,
      format: "json",
      abilityActionScope: "all"
    }));

    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({
      abilityKey: "ability.basic.attack",
      actionOrigin: "manual",
      uses: 1
    });
    expect(all).toHaveLength(2);
    expect(all.find((row) => row.actionOrigin === "timeout-auto-attack")).toMatchObject({
      abilityKey: "ability.basic.attack",
      uses: 1
    });
  });
});

class FakeCombatBalanceAnalyticsRepository implements CombatBalanceAnalyticsRepository {
  recordBattle(): Promise<"created" | "duplicate"> {
    return Promise.resolve("created");
  }

  listBattles(filters: CombatBalanceReportFilters): Promise<CombatBalanceBattleReportRow[]> {
    void filters;
    return Promise.resolve([{
      combatId: "combat-report-1",
      combatSource: "regular_mob",
      outcome: "win",
      startedAt: new Date("2026-06-21T10:00:00.000Z"),
      finishedAt: new Date("2026-06-21T10:00:23.000Z"),
      balanceVersion: "combat-balance-0.1.21",
      classKey: "class.warrior",
      playerLevel: 12,
      remortCount: 2,
      playerMaxHp: 40,
      playerHpAtEnd: 20,
      mobTemplateKey: "monster.rat",
      mobType: "regular_mob",
      mobLevel: 10,
      mobDifficultyTier: "normal",
      mobMaxHp: 20,
      mobHpAtEnd: 0,
      roundsCount: 2,
      playerActionsCount: 2,
      manualPlayerActionsCount: 1,
      timeoutAutoActionsCount: 1,
      timeoutSkipActionsCount: 0,
      enemyActionsCount: 1,
      damageDealt: 12,
      damageTaken: 5,
      healingDone: 0,
      criticalHits: 0,
      misses: 0,
      isTestOrAdmin: false
    }]);
  }

  listAbilitiesForCombatIds(
    _combatIds: string[],
    options: { actionOrigin?: CombatBalanceAbilityReportRow["actionOrigin"] | "all" } = { actionOrigin: "manual" }
  ): Promise<CombatBalanceAbilityReportRow[]> {
    const rows: CombatBalanceAbilityReportRow[] = [
      makeAbility("manual", 7),
      makeAbility("timeout-auto-attack", 5)
    ];

    return Promise.resolve(
      options.actionOrigin && options.actionOrigin !== "all"
        ? rows.filter((row) => row.actionOrigin === options.actionOrigin)
        : rows
    );
  }

  getDataQuality() {
    return Promise.resolve({
      analyticsBattles: 1,
      terminalSoloSessions: 1,
      duplicateWriteAttempts: 0
    });
  }
}

function parseJsonRows(text: string): Array<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected report JSON array.");
  }

  return parsed as Array<Record<string, unknown>>;
}

function makeAbility(
  actionOrigin: CombatBalanceAbilityReportRow["actionOrigin"],
  totalDamage: number
): CombatBalanceAbilityReportRow {
  return {
    combatId: "combat-report-1",
    abilityKey: "ability.basic.attack",
    actionOrigin,
    abilityRank: 0,
    isClassAbility: false,
    usesCount: 1,
    successfulUsesCount: 1,
    hitCount: 1,
    critCount: 0,
    missCount: 0,
    totalDamage,
    totalHealing: 0,
    resourceSpent: 0
  };
}
