import type { ItemContent, ItemEffectContent } from "../content/schema";
import type { CharacterStats } from "./characters/starterStats";

export const MAX_ITEM_ENHANCEMENT_LEVEL = 5;
export const ITEM_UPGRADE_ORDER_TARGET_LEVEL = 2;

export type ItemUpgradeMethod = "npc" | "self";
export type ItemUpgradePrimaryStat = "weaponDamage" | "spellPower" | "armor" | "resist" | "luck";

export interface ItemUpgradeLevelConfig {
  gold: number;
  iskrokamin: number;
  mana: number;
  npcChance: number;
  selfChance: number;
}

export interface ItemUpgradeChanceInput {
  method: ItemUpgradeMethod;
  targetLevel: number;
  luck: number;
  pityFailures: number;
  donor?: ItemUpgradeDonorBonus | null;
}

export interface ItemUpgradeChanceBreakdown {
  baseChance: number;
  luckBonus: number;
  pityBonus: number;
  donorBonus: number;
  finalChance: number;
  guaranteed: boolean;
}

export interface ItemUpgradeDonorBonus {
  kind: "same-template" | "same-slot";
  chanceBonus: number;
  iskrokaminDiscount: number;
}

export const ITEM_UPGRADE_LEVELS: Record<number, ItemUpgradeLevelConfig> = {
  1: { gold: 50, iskrokamin: 1, mana: 10, npcChance: 95, selfChance: 90 },
  2: { gold: 120, iskrokamin: 2, mana: 18, npcChance: 82, selfChance: 76 },
  3: { gold: 260, iskrokamin: 4, mana: 30, npcChance: 66, selfChance: 60 },
  4: { gold: 500, iskrokamin: 7, mana: 45, npcChance: 48, selfChance: 42 },
  5: { gold: 900, iskrokamin: 11, mana: 65, npcChance: 32, selfChance: 28 }
};

export function normalizeEnhancementLevel(value: number | undefined | null): number {
  return Math.max(0, Math.min(MAX_ITEM_ENHANCEMENT_LEVEL, Math.floor(value ?? 0)));
}

export function getItemDisplayNameWithEnhancement(item: Pick<ItemContent, "name">, enhancementLevel = 0): string {
  const level = normalizeEnhancementLevel(enhancementLevel);

  return level > 0 ? `${item.name} +${level}` : item.name;
}

export function isItemUpgradeable(item: ItemContent, enhancementLevel = 0): boolean {
  if (!item.equipmentSlot && item.slot !== "weapon" && item.slot !== "armor") {
    return false;
  }

  if (item.slot === "accessory") {
    return false;
  }

  const tags = new Set(item.tags ?? []);
  if (
    item.slot === "consumable" ||
    item.slot === "material" ||
    item.slot === "cosmetic" ||
    tags.has("consumable") ||
    tags.has("one-use") ||
    tags.has("story") ||
    tags.has("memory")
  ) {
    return false;
  }

  return normalizeEnhancementLevel(enhancementLevel) < MAX_ITEM_ENHANCEMENT_LEVEL;
}

export function getItemUpgradePrimaryStat(item: ItemContent): ItemUpgradePrimaryStat | null {
  if (!isItemUpgradeable(item, 0)) {
    return null;
  }

  if ((item.effect?.spellPower ?? 0) > 0) {
    return "spellPower";
  }

  if (item.slot === "weapon" || item.equipmentSlot === "weapon" || item.equipmentSlot === "offhand") {
    return "weaponDamage";
  }

  if ((item.effect?.resist ?? 0) > (item.effect?.armor ?? 0)) {
    return "resist";
  }

  if (item.slot === "armor" || item.equipmentSlot) {
    return "armor";
  }

  return null;
}

export function applyItemEnhancementEffect(
  effect: ItemEffectContent | undefined,
  item: ItemContent,
  enhancementLevel = 0
): ItemEffectContent | undefined {
  const level = normalizeEnhancementLevel(enhancementLevel);
  const base = effect ? { ...effect } : {};
  const primary = getItemUpgradePrimaryStat(item);

  if (level <= 0 || !primary) {
    return effect;
  }

  return {
    ...base,
    [primary]: (base[primary] ?? 0) + level
  };
}

export function calculateItemUpgradeChance(input: ItemUpgradeChanceInput): ItemUpgradeChanceBreakdown {
  const levelConfig = getItemUpgradeLevelConfig(input.targetLevel);
  const baseChance = input.method === "self" ? levelConfig.selfChance : levelConfig.npcChance;
  const luckBonus = Math.max(-10, Math.min(15, Math.round((Math.floor(input.luck) - 10) * 1.25)));
  const safeFailures = Math.max(0, Math.floor(input.pityFailures));
  const guaranteed = safeFailures >= 5;
  const pityBonus = Math.min(32, safeFailures * 8);
  const donorBonus = input.donor?.chanceBonus ?? 0;
  const finalChance = guaranteed
    ? 100
    : Math.max(5, Math.min(98, baseChance + luckBonus + pityBonus + donorBonus));

  return {
    baseChance,
    luckBonus,
    pityBonus,
    donorBonus,
    finalChance,
    guaranteed
  };
}

export function getItemUpgradeLevelConfig(targetLevel: number): ItemUpgradeLevelConfig {
  const safeTarget = Math.max(1, Math.min(MAX_ITEM_ENHANCEMENT_LEVEL, Math.floor(targetLevel)));

  return ITEM_UPGRADE_LEVELS[safeTarget] ?? ITEM_UPGRADE_LEVELS[1]!;
}

export function calculateItemUpgradeCosts(input: {
  method: ItemUpgradeMethod;
  targetLevel: number;
  donor?: ItemUpgradeDonorBonus | null;
}): { gold: number; iskrokamin: number; mana: number } {
  const levelConfig = getItemUpgradeLevelConfig(input.targetLevel);
  const donorDiscount = Math.max(0, input.donor?.iskrokaminDiscount ?? 0);

  return {
    gold: input.method === "npc" ? levelConfig.gold : 0,
    iskrokamin: Math.max(1, levelConfig.iskrokamin - donorDiscount),
    mana: input.method === "self" ? levelConfig.mana : 0
  };
}

export function getDonorBonus(input: {
  baseItem: ItemContent;
  baseItemId: string;
  baseEnhancementLevel: number;
  donorItem: ItemContent;
  donorItemId: string;
  donorEnhancementLevel: number;
}): ItemUpgradeDonorBonus | null {
  if (
    normalizeEnhancementLevel(input.baseEnhancementLevel) !== normalizeEnhancementLevel(input.donorEnhancementLevel) ||
    !isItemUpgradeable(input.donorItem, input.donorEnhancementLevel)
  ) {
    return null;
  }

  if (input.baseItem.id === input.donorItem.id) {
    const discount = normalizeEnhancementLevel(input.baseEnhancementLevel) >= 3 ? 2 : 1;

    return { kind: "same-template", chanceBonus: 12, iskrokaminDiscount: discount };
  }

  if (getComparableSlot(input.baseItem) === getComparableSlot(input.donorItem)) {
    return { kind: "same-slot", chanceBonus: 7, iskrokaminDiscount: 1 };
  }

  return null;
}

export function isMageClassForSparkTemper(classId: string): boolean {
  return classId === "class.mage" || classId === "class.varenyk-mancer" || classId === "class.bureaucramancer";
}

export function getLuckFromStats(stats: CharacterStats): number {
  return Math.max(0, Math.floor(stats.luck));
}

function getComparableSlot(item: ItemContent): string {
  return item.equipmentSlot ?? item.slot;
}
