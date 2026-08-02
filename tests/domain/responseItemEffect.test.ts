import { describe, expect, it } from "vitest";
import { resolveCombatResponseItemDelta } from "../../src/domain/combat/responseItemEffect";

describe("response item actual-effect eligibility", () => {
  it("does not commit evade for a miss with no actual harmful on-hit consequence", () => {
    expect(resolveCombatResponseItemDelta({
      damage: 0,
      harmfulOnHitConsequenceCount: 0
    }, { kind: "evade", percent: 100 })).toEqual({
      eligible: false,
      damageBefore: 0,
      damageAfter: 0,
      preventedDamage: 0,
      preventedHarmfulOnHitConsequenceCount: 0,
      suppressHarmfulOnHitConsequences: false
    });
  });

  it("commits evade for an actually applicable harmful rider even at zero damage", () => {
    expect(resolveCombatResponseItemDelta({
      damage: 0,
      harmfulOnHitConsequenceCount: 1
    }, { kind: "evade", percent: 100 })).toMatchObject({
      eligible: true,
      preventedDamage: 0,
      preventedHarmfulOnHitConsequenceCount: 1,
      suppressHarmfulOnHitConsequences: true
    });
  });

  it("keeps the completed c006 zero-delta floor", () => {
    for (const damage of [0, 1, 2]) {
      expect(resolveCombatResponseItemDelta({
        damage,
        harmfulOnHitConsequenceCount: 1
      }, { kind: "guard", percent: 42 })).toMatchObject({
        eligible: false,
        preventedDamage: 0,
        preventedHarmfulOnHitConsequenceCount: 0
      });
    }
    expect(resolveCombatResponseItemDelta({
      damage: 3,
      harmfulOnHitConsequenceCount: 0
    }, { kind: "guard", percent: 42 })).toMatchObject({
      eligible: true,
      damageAfter: 2,
      preventedDamage: 1
    });
  });
});
