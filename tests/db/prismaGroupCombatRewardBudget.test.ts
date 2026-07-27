import { describe, expect, it } from "vitest";
import {
  selectStrongestLeftPassageRemortSource,
  selectStrongestLeftPassageThreatSource
} from "../../src/db/repositories/prismaGroupCombatRepository";
import { buildLeftPassageEncounterRewardBudget } from "../../src/domain/groupCombat/groupCombat";

describe("left-passage group-combat reward budget", () => {
  it("uses ordinary-fight XP and gold bands for 1x1, then adds enemy budgets without multiplying loot", () => {
    const oneByOne = buildLeftPassageEncounterRewardBudget({
      participantLevels: [3],
      enemies: [{ baseLevel: 2, effectiveLevel: 5 }],
      deterministicKey: "same-reserved-encounter"
    });
    const twoByTwo = buildLeftPassageEncounterRewardBudget({
      participantLevels: [3, 5],
      enemies: [
        { baseLevel: 2, effectiveLevel: 5 },
        { baseLevel: 5, effectiveLevel: 5 }
      ],
      deterministicKey: "same-reserved-encounter"
    });
    const threeByThree = buildLeftPassageEncounterRewardBudget({
      participantLevels: [3, 5, 4],
      enemies: [
        { baseLevel: 2, effectiveLevel: 5 },
        { baseLevel: 5, effectiveLevel: 5 },
        { baseLevel: 4, effectiveLevel: 4 }
      ],
      deterministicKey: "same-reserved-encounter"
    });

    expect(oneByOne.winXpTotal).toBe(13);
    expect(oneByOne.winGoldTotal).toBeGreaterThanOrEqual(0);
    expect(oneByOne.winGoldTotal).toBeLessThanOrEqual(3);
    expect(twoByTwo.winXpTotal).toBeGreaterThan(oneByOne.winXpTotal);
    expect(threeByThree.winXpTotal).toBeGreaterThan(twoByTwo.winXpTotal);
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
