import { describe, expect, it } from "vitest";
import { calculateHealingPreview } from "../../src/domain/itemUse";

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
});
