import { describe, expect, it } from "vitest";
import { items } from "../../src/content";
import {
  applyItemEnhancementEffect,
  calculateItemUpgradeChance,
  calculateItemUpgradeCosts,
  getBaseItemIdForUpgradeVariant,
  getDonorBonus,
  getItemDisplayNameWithEnhancement,
  getItemUpgradeLevelFromItemId,
  makeItemUpgradeVariantId,
  isItemUpgradeable
} from "../../src/domain/itemUpgrades";

describe("item upgrades", () => {
  const rapier = items.find((item) => item.id === "item.ability.last-page-rapier")!;

  it("keeps enhancement display and primary stat scaling deterministic", () => {
    expect(getItemDisplayNameWithEnhancement(rapier, 0)).toBe(rapier.name);
    expect(getItemDisplayNameWithEnhancement(rapier, 3)).toBe(`${rapier.name} +3`);

    const effect = applyItemEnhancementEffect(rapier.effect, rapier, 3);
    expect(effect?.weaponDamage).toBe((rapier.effect?.weaponDamage ?? 0) + 3);
  });

  it("models authored upgrade levels as stable item id variants", () => {
    const plusThreeId = makeItemUpgradeVariantId(rapier.id, 3);
    const plusThree = items.find((item) => item.id === plusThreeId);

    expect(plusThreeId).toBe("item.ability.last-page-rapier.plus-3");
    expect(plusThree?.name).toBe(`${rapier.name} +3`);
    expect(plusThree?.effect?.weaponDamage).toBe((rapier.effect?.weaponDamage ?? 0) + 3);
    expect(getItemUpgradeLevelFromItemId(plusThreeId)).toBe(3);
    expect(getBaseItemIdForUpgradeVariant(plusThreeId)).toBe(rapier.id);
  });

  it("rejects capped or non-equipment items", () => {
    const material = items.find((item) => item.id === "item.iskrokamin")!;

    expect(isItemUpgradeable(rapier, 4)).toBe(true);
    expect(isItemUpgradeable(rapier, 5)).toBe(false);
    expect(isItemUpgradeable(material, 0)).toBe(false);
  });

  it("adds pity and donor bonuses without exceeding hard chance bounds", () => {
    const chance = calculateItemUpgradeChance({
      method: "npc",
      targetLevel: 4,
      luck: 23,
      pityFailures: 3,
      donor: { chanceBonus: 12, iskrokaminDiscount: 2 }
    });

    expect(chance.pityBonus).toBe(24);
    expect(chance.donorBonus).toBe(12);
    expect(chance.finalChance).toBeLessThanOrEqual(98);
  });

  it("guarantees the next attempt after five failures", () => {
    const chance = calculateItemUpgradeChance({
      method: "self",
      targetLevel: 5,
      luck: 1,
      pityFailures: 5
    });

    expect(chance.guaranteed).toBe(true);
    expect(chance.finalChance).toBe(100);
  });

  it("discounts same-template donors but never below zero material cost", () => {
    const donor = getDonorBonus({
      baseItem: rapier,
      baseItemId: rapier.id,
      baseEnhancementLevel: 2,
      donorItem: rapier,
      donorItemId: rapier.id,
      donorEnhancementLevel: 2
    });

    expect(donor).toEqual({ kind: "same-template", chanceBonus: 12, iskrokaminDiscount: 1 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 1, donor }).iskrokamin).toBeGreaterThanOrEqual(0);
  });
});
