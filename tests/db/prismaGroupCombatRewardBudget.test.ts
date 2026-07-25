import { describe, expect, it } from "vitest";
import {
  selectStrongestLeftPassageRemortSource,
  selectStrongestLeftPassageThreatSource
} from "../../src/db/repositories/prismaGroupCombatRepository";
import { buildLeftPassageEncounterRewardBudget } from "../../src/domain/groupCombat/groupCombat";

describe("left-passage group-combat reward budget", () => {
  it("does not multiply the encounter-wide budget or common roll by backup count", () => {
    const twoByTwo = buildLeftPassageEncounterRewardBudget({
      enemyLevels: [7, 8],
      deterministicKey: "same-reserved-encounter"
    });
    const threeByThree = buildLeftPassageEncounterRewardBudget({
      enemyLevels: [7, 8, 6],
      deterministicKey: "same-reserved-encounter"
    });

    expect(threeByThree).toEqual(twoByTwo);
    expect(threeByThree.commonItemQuantity).toBeLessThanOrEqual(1);
  });

  it("selects non-leader pressure/remort sources and resolves exact ties by frozen roster order", () => {
    const baseDecision = {
      enemyCount: 1 as const,
      reason: "base" as const,
      eligibleWins: 0
    };
    const pressure = [
      { characterId: "leader", rosterOrder: 0, decision: baseDecision },
      {
        characterId: "strong-non-leader",
        rosterOrder: 2,
        decision: {
          enemyCount: 2 as const,
          reason: "repeat-wins" as const,
          eligibleWins: 7,
          secondEnemyLevelBonus: 5
        }
      },
      {
        characterId: "same-pressure-earlier",
        rosterOrder: 1,
        decision: {
          enemyCount: 2 as const,
          reason: "repeat-wins" as const,
          eligibleWins: 7,
          secondEnemyLevelBonus: 5
        }
      }
    ];
    const remorts = [
      { characterId: "leader", rosterOrder: 0, remortCount: 0 },
      { characterId: "strong-later", rosterOrder: 2, remortCount: 3 },
      { characterId: "strong-earlier", rosterOrder: 1, remortCount: 3 }
    ];

    expect(selectStrongestLeftPassageThreatSource(pressure).characterId).toBe("same-pressure-earlier");
    expect(selectStrongestLeftPassageRemortSource(remorts).characterId).toBe("strong-earlier");
  });
});
