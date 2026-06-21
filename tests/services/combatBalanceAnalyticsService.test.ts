import { describe, expect, it } from "vitest";
import type {
  CombatBalanceAnalyticsRepository,
  CombatBalanceBattleRecordInput
} from "../../src/db/repositories/combatBalanceAnalyticsRepository";
import type { SoloCombatSessionRecord } from "../../src/db/repositories/soloCombatSessionRepository";
import { createCombatAnalyticsState } from "../../src/domain/combat";
import { buildPlayerAnalysisKey, CombatBalanceAnalyticsService } from "../../src/services/combatBalanceAnalyticsService";
import { makeCharacter, makeMonster } from "../support/combatAnalyticsFixtures";

describe("CombatBalanceAnalyticsService", () => {
  it("does not write when disabled", async () => {
    const repo = new FakeCombatBalanceAnalyticsRepository();
    const service = new CombatBalanceAnalyticsService(repo, { enabled: false });

    await service.recordTerminalSession(makeSession());

    expect(repo.records).toHaveLength(0);
  });

  it("records a terminal battle from the persisted combat snapshot", async () => {
    const repo = new FakeCombatBalanceAnalyticsRepository();
    const service = new CombatBalanceAnalyticsService(repo, { enabled: true });

    await service.recordTerminalSession(makeSession());

    expect(repo.records).toHaveLength(1);
    expect(repo.records[0]).toMatchObject({
      combatId: "combat-analytics-1",
      outcome: "win",
      classKey: "class.warrior",
      playerLevel: 12,
      remortCount: 2,
      mobTemplateKey: "monster.rat",
      damageDealt: 9,
      damageTaken: 3
    });
    expect(repo.records[0].playerAnalysisKey).toBe(buildPlayerAnalysisKey("character-1"));
  });
});

class FakeCombatBalanceAnalyticsRepository implements CombatBalanceAnalyticsRepository {
  readonly records: CombatBalanceBattleRecordInput[] = [];

  recordBattle(input: CombatBalanceBattleRecordInput): Promise<"created" | "duplicate"> {
    this.records.push(input);
    return Promise.resolve("created");
  }

  listBattles() {
    return Promise.resolve([]);
  }

  listAbilitiesForCombatIds() {
    return Promise.resolve([]);
  }

  getDataQuality() {
    return Promise.resolve({
      analyticsBattles: 0,
      terminalSoloSessions: 0,
      duplicateWriteAttempts: 0,
      writeErrorCount: 0
    });
  }
}

function makeSession(): SoloCombatSessionRecord {
  const analytics = createCombatAnalyticsState({
    characterId: "character-1",
    playerAnalysisKey: buildPlayerAnalysisKey("character-1"),
    character: makeCharacter(),
    monster: makeMonster(),
    combatSource: "regular_mob",
    startedAt: new Date("2026-06-21T10:00:00.000Z")
  });
  analytics.totals.damageDealt = 9;
  analytics.totals.damageTaken = 3;
  analytics.totals.playerActionsCount = 2;
  analytics.totals.enemyActionsCount = 1;

  return {
    id: "combat-analytics-1",
    characterId: "character-1",
    monsterId: "monster.rat",
    status: "won",
    turn: 3,
    reward: null,
    createdAt: new Date("2026-06-21T10:00:00.000Z"),
    updatedAt: new Date("2026-06-21T10:00:23.000Z"),
    expiresAt: new Date("2026-06-21T10:30:00.000Z"),
    state: {
      id: "combat-analytics-1",
      turn: 3,
      status: "won",
      completedAt: "2026-06-21T10:00:23.000Z",
      hero: { hp: 25, hpMax: 40, mana: 8, manaMax: 10 },
      monster: { id: "monster.rat", hp: 0, hpMax: 20 },
      analytics
    }
  };
}
