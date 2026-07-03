import { describe, expect, it } from "vitest";
import {
  buildPriestHealPlan,
  buildRoguePickpocketPlan
} from "../../src/domain/noncombat/classNoncombatTechniques";

describe("class noncombat techniques", () => {
  it("uses the preserved Priest heal formula and mana cost", () => {
    expect(buildPriestHealPlan({
      missingHp: 99,
      charisma: 10,
      intelligence: 8,
      level: 5
    })).toEqual({
      heal: 11,
      manaCost: 11
    });

    expect(buildPriestHealPlan({
      missingHp: 4,
      charisma: 10,
      intelligence: 8,
      level: 5
    })).toEqual({
      heal: 4,
      manaCost: 7
    });
  });

  it("caps Rogue pickpocket gold by luck, level difference, target balance, and MVP max", () => {
    expect(buildRoguePickpocketPlan({
      rogueDexterity: 12,
      rogueLuck: 28,
      rogueLevel: 16,
      targetLevel: 3,
      targetGold: 20,
      baseRoll: 4,
      outcomeRoll: 8
    })).toMatchObject({
      outcome: "clean-success",
      baseGold: 5,
      levelDiff: 13,
      bonusGold: 5,
      stolenGold: 10
    });

    expect(buildRoguePickpocketPlan({
      rogueDexterity: 30,
      rogueLuck: 80,
      rogueLevel: 30,
      targetLevel: 1,
      targetGold: 9,
      baseRoll: 4,
      outcomeRoll: 13
    }).stolenGold).toBe(9);
  });

  it("stores empty/no-op when the target has no available gold", () => {
    expect(buildRoguePickpocketPlan({
      rogueDexterity: 30,
      rogueLuck: 30,
      rogueLevel: 10,
      targetLevel: 3,
      targetGold: 0,
      baseRoll: 4,
      outcomeRoll: 13
    })).toMatchObject({
      outcome: "empty",
      stolenGold: 0
    });
  });

  it("keeps caught badly deterministic under the same stat snapshot and roll", () => {
    const input = {
      rogueDexterity: 3,
      rogueLuck: 2,
      rogueLevel: 3,
      targetLevel: 12,
      targetGold: 13,
      baseRoll: 2,
      outcomeRoll: -13
    };

    expect(buildRoguePickpocketPlan(input)).toEqual(buildRoguePickpocketPlan(input));
    expect(buildRoguePickpocketPlan(input).outcome).toBe("caught-badly");
  });
});
