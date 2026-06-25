import { describe, expect, it } from "vitest";
import { parseCombatState } from "../../src/db/repositories/prismaSoloCombatSessionRepository";

const legacyState = {
  turn: 1,
  status: "active",
  hero: {
    hp: 10,
    hpMax: 10,
    mana: 3,
    manaMax: 3
  },
  monster: {
    id: "monster.legacy",
    hp: 5,
    hpMax: 5
  }
};

describe("solo combat state JSON parser", () => {
  it("keeps legacy one-enemy state readable without adding an enemies array", () => {
    expect(parseCombatState(legacyState)).toEqual(legacyState);
  });

  it("reads a valid two-enemy state with stable identities", () => {
    const state = parseCombatState({
      ...legacyState,
      enemies: [
        {
          enemyId: "enemy:1",
          id: "monster.legacy",
          hp: 5,
          hpMax: 5
        },
        {
          enemyId: "enemy:2",
          id: "monster.second",
          name: "Second",
          level: 2,
          hp: 7,
          hpMax: 7
        }
      ]
    });

    expect(state?.enemies?.map((enemy) => [enemy.enemyId, enemy.id, enemy.hp])).toEqual([
      ["enemy:1", "monster.legacy", 5],
      ["enemy:2", "monster.second", 7]
    ]);
  });

  it("drops invalid threat metadata while preserving dev threat exclusion", () => {
    const state = parseCombatState({
      ...legacyState,
      source: "normal",
      monster: {
        id: "monster.legacy",
        hp: 5,
        hpMax: 5
      },
      threat: {
        version: 1,
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: 2,
        lineId: "invalid",
        lineVersion: "invalid"
      },
      threatExclusion: {
        version: 1,
        reason: "dev-forced-two-enemies"
      },
      enemies: [
        {
          enemyId: "enemy:1",
          id: "monster.legacy",
          hp: 5,
          hpMax: 5
        },
        {
          enemyId: "enemy:2",
          id: "monster.second",
          hp: 7,
          hpMax: 7
        }
      ]
    });

    expect(state?.threat).toBeUndefined();
    expect(state?.threatExclusion).toEqual({
      version: 1,
      reason: "dev-forced-two-enemies"
    });
  });

  it.each([
    {
      name: "unknown line id",
      lineId: "unknown-threat-line",
      lineVersion: "threat-escalation-v1"
    },
    {
      name: "unsupported line version",
      lineId: "nyz-added-witnesses",
      lineVersion: "future-threat-lines-v2"
    }
  ])("drops otherwise valid threat metadata with $name", ({ lineId, lineVersion }) => {
    const state = parseCombatState({
      ...legacyState,
      source: "normal",
      threat: {
        version: 1,
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: 3,
        lineId,
        lineVersion
      },
      enemies: [
        {
          enemyId: "enemy:1",
          id: "monster.legacy",
          hp: 5,
          hpMax: 5
        },
        {
          enemyId: "enemy:2",
          id: "monster.second",
          hp: 7,
          hpMax: 7
        }
      ]
    });

    expect(state?.threat).toBeUndefined();
    expect(state?.enemies).toHaveLength(2);
  });

  it("preserves valid threat pressure metadata", () => {
    const state = parseCombatState({
      ...legacyState,
      source: "normal",
      threat: {
        version: 1,
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: 3,
        lineId: "nyz-added-witnesses",
        lineVersion: "threat-escalation-v1",
        pressure: {
          version: 1,
          consecutiveWonEscalatedFights: 5,
          requestedSecondEnemyLevelBonus: 10,
          appliedSecondEnemyLevelBonus: 3,
          boostedEnemyId: "enemy:2",
          boostedEnemyEffectiveLevel: 23,
          levelCap: 23
        }
      },
      enemies: [
        {
          enemyId: "enemy:1",
          id: "monster.legacy",
          hp: 5,
          hpMax: 5
        },
        {
          enemyId: "enemy:2",
          id: "monster.second",
          hp: 7,
          hpMax: 7
        }
      ]
    });

    expect(state?.threat?.pressure).toEqual({
      version: 1,
      consecutiveWonEscalatedFights: 5,
      requestedSecondEnemyLevelBonus: 10,
      appliedSecondEnemyLevelBonus: 3,
      boostedEnemyId: "enemy:2",
      boostedEnemyEffectiveLevel: 23,
      levelCap: 23
    });
  });

  it("drops malformed threat pressure metadata while preserving the valid threat", () => {
    const state = parseCombatState({
      ...legacyState,
      source: "normal",
      threat: {
        version: 1,
        enemyCount: 2,
        reason: "ordinary-win-streak",
        eligibleWins: 3,
        lineId: "nyz-added-witnesses",
        lineVersion: "threat-escalation-v1",
        pressure: {
          version: 1,
          consecutiveWonEscalatedFights: 5,
          requestedSecondEnemyLevelBonus: 2,
          appliedSecondEnemyLevelBonus: 10,
          boostedEnemyId: "enemy:2",
          boostedEnemyEffectiveLevel: 24,
          levelCap: 23
        }
      },
      enemies: [
        {
          enemyId: "enemy:1",
          id: "monster.legacy",
          hp: 5,
          hpMax: 5
        },
        {
          enemyId: "enemy:2",
          id: "monster.second",
          hp: 7,
          hpMax: 7
        }
      ]
    });

    expect(state?.threat).toMatchObject({
      enemyCount: 2,
      reason: "ordinary-win-streak",
      eligibleWins: 3
    });
    expect(state?.threat?.pressure).toBeUndefined();
  });

  it("round-trips a two-enemy state after primary death", () => {
    const state = {
      ...legacyState,
      monster: {
        id: "monster.second",
        hp: 7,
        hpMax: 7
      },
      enemies: [
        {
          enemyId: "enemy:2",
          id: "monster.second",
          hp: 7,
          hpMax: 7
        },
        {
          enemyId: "enemy:1",
          id: "monster.legacy",
          hp: 0,
          hpMax: 5
        }
      ]
    };

    expect(parseCombatState(JSON.parse(JSON.stringify(state)))).toMatchObject({
      monster: {
        id: "monster.second",
        hp: 7,
        hpMax: 7
      },
      enemies: [
        {
          enemyId: "enemy:2",
          id: "monster.second",
          hp: 7,
          hpMax: 7
        },
        {
          enemyId: "enemy:1",
          id: "monster.legacy",
          hp: 0,
          hpMax: 5
        }
      ]
    });
  });

  it.each(["won", "lost", "fled", "expired"] as const)(
    "round-trips terminal %s two-enemy state",
    (status) => {
      const state = {
        ...legacyState,
        status,
        ...(status === "lost"
          ? {
              hero: {
                ...legacyState.hero,
                hp: 0
              }
            }
          : {}),
        monster: {
          id: "monster.second",
          hp: status === "won" ? 0 : 3,
          hpMax: 7
        },
        enemies: [
          {
            enemyId: "enemy:2",
            id: "monster.second",
            hp: status === "won" ? 0 : 3,
            hpMax: 7
          },
          {
            enemyId: "enemy:1",
            id: "monster.legacy",
            hp: 0,
            hpMax: 5
          }
        ]
      };

      const parsed = parseCombatState(JSON.parse(JSON.stringify(state)));

      expect(parsed?.status).toBe(status);
      expect(parsed?.enemies).toHaveLength(2);
    }
  );

  it("rejects malformed duplicate enemy identities safely", () => {
    expect(parseCombatState({
      ...legacyState,
      enemies: [
        {
          enemyId: "enemy:1",
          id: "monster.legacy",
          hp: 5,
          hpMax: 5
        },
        {
          enemyId: "enemy:1",
          id: "monster.second",
          hp: 7,
          hpMax: 7
        }
      ]
    })).toBeNull();
  });

  it("rejects a malformed primary enemy mirror safely", () => {
    expect(parseCombatState({
      ...legacyState,
      monster: {
        id: "monster.second",
        hp: 7,
        hpMax: 7
      },
      enemies: [
        {
          enemyId: "enemy:1",
          id: "monster.legacy",
          hp: 5,
          hpMax: 5
        },
        {
          enemyId: "enemy:2",
          id: "monster.second",
          hp: 7,
          hpMax: 7
        }
      ]
    })).toBeNull();
  });
});
