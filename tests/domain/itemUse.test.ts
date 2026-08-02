import { describe, expect, it } from "vitest";
import {
  calculateHealingPreview,
  calculateItemUsePreview,
  recalculateFrozenItemUsePreview
} from "../../src/domain/itemUse";

describe("item use domain", () => {
  it("raises field-kit previews to at least ninety-three percent HP", () => {
    const effect = { kind: "heal-hp-to-min-percent" as const, percent: 93 };

    expect(calculateHealingPreview({ hpCurrent: 1, hpMax: 50, effect })).toMatchObject({
      healAmount: 46,
      hpAfter: 47
    });
    expect(calculateHealingPreview({ hpCurrent: 1, hpMax: 100, effect })).toMatchObject({
      healAmount: 92,
      hpAfter: 93
    });
    expect(calculateHealingPreview({ hpCurrent: 1, hpMax: 200, effect })).toMatchObject({
      healAmount: 185,
      hpAfter: 186
    });
    expect(calculateHealingPreview({ hpCurrent: 93, hpMax: 100, effect })).toMatchObject({
      healAmount: 0,
      hpAfter: 93
    });
  });

  it("caps typed mana restoration at the current maximum", () => {
    expect(calculateItemUsePreview({
      hpCurrent: 20,
      hpMax: 30,
      manaCurrent: 4,
      manaMax: 10,
      effect: { kind: "restore-mana", amount: 9 },
      resolutionSeed: "mana-test"
    })).toMatchObject({
      resource: "mana",
      hpBefore: 20,
      hpMax: 30,
      healAmount: 0,
      hpAfter: 20,
      manaBefore: 4,
      manaMax: 10,
      manaRestoreAmount: 6,
      manaAfter: 10
    });
  });

  it("recalculates a random consumable from its frozen branch and stack evidence", () => {
    const effect = { kind: "random-resource" as const, amount: 23, bothAmount: 13 };
    const preview = calculateItemUsePreview({
      hpCurrent: 10,
      hpMax: 50,
      manaCurrent: 1,
      manaMax: 20,
      effect,
      resolutionSeed: "frozen-random-branch",
      startingStackQuantity: 1
    });
    const recalculated = recalculateFrozenItemUsePreview({
      hpCurrent: 20,
      hpMax: 50,
      manaCurrent: 5,
      manaMax: 20,
      effect,
      frozen: preview
    });

    expect(recalculated).toMatchObject({
      resource: preview.resource,
      resolvedEffectKind: preview.resolvedEffectKind,
      startingStackQuantity: 1
    });
    expect(recalculated?.healAmount > 0).toBe(preview.resource !== "mana");
    expect(recalculated?.manaRestoreAmount > 0).toBe(preview.resource !== "hp");
  });
});
