import { describe, expect, it } from "vitest";
import type { ItemContent } from "../../src/content/schema";
import {
  applyItemUpgradeEffect,
  buildItemUpgradeVariantContents,
  calculateItemUpgradeChance,
  calculateItemUpgradeCosts,
  canAccessItemUpgrades,
  getBaseItemIdForUpgradeVariant,
  getDonorBonus,
  getItemDisplayNameWithUpgrade,
  getItemUpgradeRequiredLevel,
  getItemUpgradeLevelFromItemId,
  getItemUpgradeMagicStrengthLabel,
  getItemUpgradeRarity,
  getItemUpgradeUnlockRewardXp,
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

const setPeer: ItemContent = {
  id: "item.set.test-upgrade-peer.helm",
  name: "Test Set Helm",
  description: "For same-set donor tests.",
  rarity: "rare",
  slot: "armor",
  equipmentSlot: "head",
  goldValue: 42,
  effect: {
    armor: 1
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
      rarity: "uncommon",
      description: "Для Чароковальні.\n\nПідсилення +1: слабка магія, Чароковальня просить не лизати іскри.",
      effect: {
        weaponDamage: 3
      }
    });
    expect(variants[2]).toMatchObject({
      name: "Тестова пательня +3",
      rarity: "rare",
      description: "Для Чароковальні.\n\nПідсилення +3: слабка магія, Чароковальня просить не лизати іскри."
    });
    expect(variants[3]).toMatchObject({
      name: "Тестова пательня +4",
      rarity: "rare",
      description: "Для Чароковальні.\n\nПідсилення +4: сильна магія, Чароковальня просить не лизати іскри."
    });
    expect(variants[4]).toMatchObject({
      name: "Тестова пательня +5",
      rarity: "epic",
      description: "Для Чароковальні.\n\nПідсилення +5: сильна магія, Чароковальня просить не лизати іскри.",
      effect: {
        weaponDamage: 9
      }
    });
    expect(getItemDisplayNameWithUpgrade(variants[4]!, 5)).toBe("Тестова пательня +5");
  });

  it("raises upgrade rarity floors without downgrading already rare bases", () => {
    expect(getItemUpgradeRarity("common", 0)).toBe("common");
    expect(getItemUpgradeRarity("common", 1)).toBe("uncommon");
    expect(getItemUpgradeRarity("common", 2)).toBe("uncommon");
    expect(getItemUpgradeRarity("common", 3)).toBe("rare");
    expect(getItemUpgradeRarity("common", 4)).toBe("rare");
    expect(getItemUpgradeRarity("common", 5)).toBe("epic");
    expect(getItemUpgradeRarity("rare", 1)).toBe("rare");
    expect(getItemUpgradeRarity("epic", 3)).toBe("epic");
    expect(getItemUpgradeRarity("legendary", 1)).toBe("legendary");
    expect(getItemUpgradeMagicStrengthLabel(3)).toBe("слабка магія");
    expect(getItemUpgradeMagicStrengthLabel(4)).toBe("сильна магія");
    expect(getItemUpgradeMagicStrengthLabel(5)).toBe("сильна магія");
  });

  it("keeps upgrade eligibility narrow and excludes materials", () => {
    expect(isItemUpgradeable(weapon)).toBe(true);
    expect(isItemUpgradeable({
      ...weapon,
      id: "item.test-upgrade-amulet",
      slot: "accessory",
      effect: { spellPower: 1 }
    })).toBe(true);
    expect(isItemUpgradeable({
      ...weapon,
      id: "item.test-upgrade-bracelet",
      slot: "accessory",
      effect: { armor: 1 }
    })).toBe(true);
    expect(isItemUpgradeable({
      ...weapon,
      id: "item.test-upgrade-lucky-ring",
      slot: "accessory",
      effect: { luck: 1 }
    })).toBe(false);
    expect(isItemUpgradeable({ ...weapon, slot: "resource", id: "item.iskrokamin" })).toBe(false);
    expect(isItemUpgradeable({ ...weapon, slot: "consumable", tags: ["consumable"] })).toBe(false);
    expect(isItemUpgradeable({ ...weapon, tags: ["consumable"] })).toBe(false);
    expect(isItemUpgradeable({ ...weapon, tags: ["consumable", "one-use"] })).toBe(false);
    expect(isItemUpgradeable({ ...weapon, slot: "cosmetic" })).toBe(false);
    expect(isItemUpgradeable({ ...weapon, id: "item.test-upgrade-pan.plus-5" }, 5)).toBe(false);
  });

  it("gates Charkokovalnia by level, remort and dynamic unlock XP", () => {
    expect(canAccessItemUpgrades({ level: 4, remortCount: 0 })).toBe(false);
    expect(canAccessItemUpgrades({ level: 5, remortCount: 0 })).toBe(true);
    expect(canAccessItemUpgrades({ level: 2, remortCount: 1 })).toBe(false);
    expect(canAccessItemUpgrades({ level: 3, remortCount: 1 })).toBe(true);

    expect(getItemUpgradeRequiredLevel({ remortCount: 0 })).toBe(5);
    expect(getItemUpgradeRequiredLevel({ remortCount: 2 })).toBe(3);
    expect(getItemUpgradeUnlockRewardXp({ level: 5, remortCount: 0 })).toBe(38);
    expect(getItemUpgradeUnlockRewardXp({ level: 99, remortCount: 9 })).toBe(93);
  });

  it("bounds costs, chance, pity and donor bonuses", () => {
    expect(calculateItemUpgradeCosts({
      method: "npc",
      targetLevel: 3,
      donor: { kind: "same-template", chanceBonus: 12, iskrokaminDiscountPercent: 42 }
    })).toEqual({ gold: 260, iskrokamin: 14, mana: 0 });
    expect(calculateItemUpgradeCosts({
      method: "npc",
      targetLevel: 5
    })).toEqual({ gold: 900, iskrokamin: 93, mana: 0 });
    expect(calculateItemUpgradeCosts({
      method: "self",
      targetLevel: 1,
      donor: { kind: "same-template", chanceBonus: 12, iskrokaminDiscountPercent: 42 }
    })).toEqual({ gold: 0, iskrokamin: 3, mana: 10 });
    expect(calculateItemUpgradeCosts({
      method: "npc",
      targetLevel: 1,
      donor: { kind: "same-slot", chanceBonus: 7, iskrokaminDiscountPercent: 13 }
    })).toEqual({ gold: 50, iskrokamin: 4, mana: 0 });

    expect(calculateItemUpgradeChance({
      method: "npc",
      targetLevel: 5,
      luck: 99,
      pityFailures: 4,
      donor: { kind: "same-template", chanceBonus: 12, iskrokaminDiscountPercent: 42 }
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

  it("accepts same-template donors before level matching but keeps same-set and same-slot level-matched", () => {
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan.plus-1",
      donorItem: weapon,
      donorItemId: "item.test-upgrade-pan.plus-1"
    })).toMatchObject({
      kind: "same-template",
      chanceBonus: 12,
      iskrokaminDiscountPercent: 42
    });
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan.plus-1",
      donorItem: weapon,
      donorItemId: "item.test-upgrade-pan.plus-4"
    })).toMatchObject({
      kind: "same-template",
      chanceBonus: 19,
      iskrokaminDiscountPercent: 73
    });
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan.plus-4",
      donorItem: weapon,
      donorItemId: "item.test-upgrade-pan.plus-5"
    })).toMatchObject({
      kind: "same-template",
      chanceBonus: 14,
      iskrokaminDiscountPercent: 52
    });
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan",
      donorItem: weapon,
      donorItemId: "item.test-upgrade-pan.plus-5"
    })).toMatchObject({
      kind: "same-template",
      chanceBonus: 23,
      iskrokaminDiscountPercent: 93
    });
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan.plus-1",
      baseSetId: "mantok-set.test",
      donorItem: setPeer,
      donorItemId: "item.set.test-upgrade-peer.helm.plus-1",
      donorSetId: "mantok-set.test"
    })).toMatchObject({
      kind: "same-set",
      chanceBonus: 9,
      iskrokaminDiscountPercent: 23
    });
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan",
      donorItem: weaponPeer,
      donorItemId: "item.test-upgrade-ladle"
    })).toMatchObject({
      kind: "same-slot",
      chanceBonus: 7,
      iskrokaminDiscountPercent: 13
    });
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan.plus-2",
      baseSetId: "mantok-set.test",
      donorItem: setPeer,
      donorItemId: "item.set.test-upgrade-peer.helm.plus-1",
      donorSetId: "mantok-set.test"
    })).toBeNull();
    expect(getDonorBonus({
      baseItem: weapon,
      baseItemId: "item.test-upgrade-pan.plus-1",
      donorItem: offhand,
      donorItemId: "item.test-upgrade-stamp"
    })).toBeNull();
  });

  it("applies Kvestarnia-spaced Iskrokamin costs with rarity and set modifiers", () => {
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 1 })).toEqual({
      gold: 50,
      iskrokamin: 5,
      mana: 0
    });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 5 })).toEqual({
      gold: 900,
      iskrokamin: 93,
      mana: 0
    });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 1, itemRarity: "uncommon" })).toMatchObject({ iskrokamin: 6 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 5, itemRarity: "uncommon" })).toMatchObject({ iskrokamin: 98 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 1, itemRarity: "rare" })).toMatchObject({ iskrokamin: 6 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 5, itemRarity: "rare" })).toMatchObject({ iskrokamin: 106 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 1, itemRarity: "epic" })).toMatchObject({ iskrokamin: 7 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 5, itemRarity: "epic" })).toMatchObject({ iskrokamin: 115 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 1, isSetPiece: true })).toMatchObject({ iskrokamin: 8 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 5, isSetPiece: true })).toMatchObject({ iskrokamin: 133 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 1, itemRarity: "legendary" })).toMatchObject({ iskrokamin: 10 });
    expect(calculateItemUpgradeCosts({ method: "npc", targetLevel: 5, itemRarity: "legendary" })).toMatchObject({ iskrokamin: 180 });
    expect(calculateItemUpgradeCosts({
      method: "npc",
      targetLevel: 1,
      itemRarity: "legendary",
      isSetPiece: true
    })).toMatchObject({ iskrokamin: 10 });
    expect(calculateItemUpgradeCosts({
      method: "npc",
      targetLevel: 5,
      itemRarity: "legendary",
      isSetPiece: true
    })).toMatchObject({ iskrokamin: 180 });
    expect(calculateItemUpgradeCosts({
      method: "npc",
      targetLevel: 5,
      donor: { kind: "same-template", chanceBonus: 12, iskrokaminDiscountPercent: 99 }
    })).toMatchObject({ iskrokamin: 47 });
  });

  it("applies primary stat upgrades to the chosen item effect", () => {
    expect(applyItemUpgradeEffect(weapon.effect, weapon, 3)).toMatchObject({
      weaponDamage: 5
    });
    expect(applyItemUpgradeEffect(weapon.effect, weapon, 4)).toMatchObject({
      weaponDamage: 7
    });
    expect(applyItemUpgradeEffect(weapon.effect, weapon, 5)).toMatchObject({
      weaponDamage: 9
    });
    expect(applyItemUpgradeEffect(offhand.effect, offhand, 2)).toMatchObject({
      weaponDamage: 2,
      armor: 1
    });
    expect(applyItemUpgradeEffect(
      { armor: 1 },
      { ...weapon, slot: "accessory", effect: { armor: 1 } },
      2
    )).toMatchObject({
      armor: 3
    });
  });

  it("caps upgraded primary combat stats at the item schema limit", () => {
    expect(applyItemUpgradeEffect({ weaponDamage: 5 }, weapon, 5)).toMatchObject({
      weaponDamage: 10
    });
  });
});
