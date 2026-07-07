import { describe, expect, it } from "vitest";
import type { ItemContent } from "../../src/content/schema";
import {
  applyItemUpgradeEffect,
  buildItemUpgradeVariantContents,
  calculateItemUpgradeChance,
  calculateItemUpgradeCosts,
  getBaseItemIdForUpgradeVariant,
  getDonorBonus,
  getItemDisplayNameWithUpgrade,
  getItemUpgradeLevelFromItemId,
  getNextItemUpgradeItemId,
  isItemUpgradeable,
  makeItemUpgradeVariantId
} from "../../src/domain/itemUpgrades";

const weapon: ItemContent = {
  id: "item.test-upgrade-pan",
  name: "Тестова пательня",
  description: "Для Чароковальні.",
  rarity: "common",
  slot: "weapon",
  goldValue: 13,
  effect: {
    weaponDamage: 2
  }
};

const offhand: ItemContent = {
  id: "item.test-upgrade-stamp",
  name: "Тестова печатка",
  description: "Для донорського тесту.",
  rarity: "common",
  slot: "weapon",
  equipmentSlot: "offhand",
  goldValue: 13,
  effect: {
    armor: 1
  }
};

const weaponPeer: ItemContent = {
  id: "item.test-upgrade-ladle",
  name: "Тестовий ополоник",
  description: "Для донорського тесту.",
  rarity: "common",
  slot: "weapon",
  goldValue: 13,
  effect: {
    weaponDamage: 1
  }
};

describe("item upgrades", () => {
  it("maps concrete +N ids without treating generated loot as authored variants", () => {
    expect(getItemUpgradeLevelFromItemId("item.test-upgrade-pan")).toBe(0);
    expect(getItemUpgradeLevelFromItemId("item.test-upgrade-pan.plus-3")).toBe(3);
    expect(getItemUpgradeLevelFromItemId("item.loot-v1-w001-plus-4")).toBe(4);
    expect(getBaseItemIdForUpgradeVariant("item.test-upgrade-pan.plus-3")).toBe(
      "item.test-upgrade-pan"
    );
    expect(getBaseItemIdForUpgradeVariant("item.loot-v1-w001-plus-4")).toBe(
      "item.loot-v1-w001"
    );
    expect(makeItemUpgradeVariantId("item.test-upgrade-pan.plus-3", 4)).toBe(
      "item.test-upgrade-pan.plus-4"
    );
    expect(makeItemUpgradeVariantId("item.loot-v1-w001-plus-3", 4)).toBe(
      "item.loot-v1-w001-plus-4"
    );
    expect(getNextItemUpgradeItemId("item.test-upgrade-pan.plus-5")).toBeNull();
  });

  it("creates bounded authored variants with primary stat growth", () => {
    const variants = buildItemUpgradeVariantContents([weapon]);

    expect(variants.map((item) => item.id)).toEqual([
      "item.test-upgrade-pan.plus-1",
      "item.test-upgrade-pan.plus-2",
      "item.test-upgrade-pan.plus-3",
      "item.test-upgrade-pan.plus-4",
      "item.test-upgrade-pan.plus-5"
    ]);
    expect(variants[0]).toMatchObject({
      name: "Тестова пательня +1",
      effect: {
        weaponDamage: 3
      }
    });
    expect(variants[4]).toMatchObject({
      name: "Тестова пательня +5",
      effect: {
        weaponDamage: 7
      }
    });
    expect(getItemDisplayNameWithUpgrade(variants[4]!, 5)).toBe("Тестова пательня +5");
  });

  it("keeps upgrade eligibility narrow and excludes materials", () => {
    expect(isItemUpgradeable(weapon)).toBe(true);
    expect(isItemUpgradeable({ ...weapon, slot: "junk", id: "item.iskrokamin" })).toBe(false);
    expect(isItemUpgradeable({ ...weapon, slot: "consumable", tags: ["consumable"] })).toBe(false);
    expect(isItemUpgradeable({ ...weapon, slot: "cosmetic" })).toBe(false);
    expect(isItemUpgradeable({ ...weapon, id: "item.test-upgrade-pan.plus-5" }, 5)).toBe(false);
  });

  it("bounds costs, chance, pity and donor bonuses", () => {
    expect(calculateItemUpgradeCosts({
      method: "npc",
      targetLevel: 3,
      donor: { kind: "same-template", chanceBonus: 12, iskrokaminDiscount: 2 }
    })).toEqual({ gold: 260, iskrokamin: 2, mana: 0 });
    expect(calculateItemUpgradeCosts({
      method: "self",
      targetLevel: 1,
      donor: { kind: "same-template", chanceBonus: 12, iskrokaminDiscount: 7 }
    })).toEqual({ gold: 0, iskrokamin: 1, mana: 10 });

    expect(calculateItemUpgradeChance({
      method: "npc",
      targetLevel: 5,
      luck: 99,
      pityFailures: 4,
      donor: { kind: "same-template", chanceBonus: 12, iskrokaminDiscount: 2 }
    })).toMatchObject({
      donorBonus: 12,
      finalChance: 91,
      guaranteed: false
    });
    expect(calculateItemUpgradeChance({
      method: "self",
      targetLevel: 5,
      luck: -10,
      pityFailures: 5
    })).toMatchObject({
      finalChance: 100,
      guaranteed: true
    });
  });

  it("accepts donors only at matching upgrade level and compatible template or slot", () => {
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan.plus-1",
      donorItem: weapon,
      donorItemId: "item.test-upgrade-pan.plus-1"
    })).toMatchObject({
      kind: "same-template",
      chanceBonus: 12
    });
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan",
      donorItem: weaponPeer,
      donorItemId: "item.test-upgrade-ladle"
    })).toMatchObject({
      kind: "same-slot",
      chanceBonus: 7
    });
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan.plus-1",
      donorItem: offhand,
      donorItemId: "item.test-upgrade-stamp"
    })).toBeNull();
  });

  it("applies primary stat upgrades to the chosen item effect", () => {
    expect(applyItemUpgradeEffect(weapon.effect, weapon, 3)).toMatchObject({
      weaponDamage: 5
    });
    expect(applyItemUpgradeEffect(offhand.effect, offhand, 2)).toMatchObject({
      weaponDamage: 2,
      armor: 1
    });
  });
});
