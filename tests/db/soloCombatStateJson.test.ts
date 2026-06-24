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
});
