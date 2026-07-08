import type { ItemContent, ItemEffectContent } from "../content/schema";
import type { CharacterStats } from "./characters/starterStats";

export const MAX_ITEM_UPGRADE_LEVEL = 5;
export const ITEM_UPGRADE_VARIANT_SUFFIX = ".plus-";
export const ITEM_UPGRADE_LOCATION_ID = "location.korchma.yard";
export const ITEM_UPGRADE_UNLOCK_KEY = "item-upgrade.charkokovalnia.unlocked";
export const ITEM_UPGRADE_UNLOCK_LOCAL_DATE = "persistent";
export const ITEM_UPGRADE_REQUIRED_LEVEL = 5;
export const ITEM_UPGRADE_REMORT_REQUIRED_LEVEL = 3;

export type ItemUpgradeMethod = "npc" | "self";
export type ItemUpgradePrimaryStat = "weaponDamage" | "spellPower" | "armor" | "resist";

export interface ItemUpgradeLevelConfig {
  gold: number;
  iskrokamin: number;
  mana: number;
  npcChance: number;
  selfChance: number;
}

export interface ItemUpgradeDonorBonus {
  kind: "same-template" | "same-slot";
  chanceBonus: number;
  iskrokaminDiscount: number;
}

export interface ItemUpgradeChanceBreakdown {
  baseChance: number;
  luckBonus: number;
  pityBonus: number;
  donorBonus: number;
  finalChance: number;
  guaranteed: boolean;
}

export function canAccessItemUpgrades(character: { level: number; remortCount?: number | null }): boolean {
  const level = Math.max(1, Math.floor(character.level));
  const remortCount = Math.max(0, Math.floor(character.remortCount ?? 0));

  return level >= ITEM_UPGRADE_REQUIRED_LEVEL ||
    (remortCount > 0 && level >= ITEM_UPGRADE_REMORT_REQUIRED_LEVEL);
}

export function getItemUpgradeRequiredLevel(character: { remortCount?: number | null }): number {
  return Math.max(0, Math.floor(character.remortCount ?? 0)) > 0
    ? ITEM_UPGRADE_REMORT_REQUIRED_LEVEL
    : ITEM_UPGRADE_REQUIRED_LEVEL;
}

export function getItemUpgradeUnlockRewardXp(character: { level: number; remortCount?: number | null }): number {
  const level = Math.max(1, Math.floor(character.level));
  const remortCount = Math.max(0, Math.floor(character.remortCount ?? 0));

  return Math.max(13, Math.min(93, 18 + level * 4 + remortCount * 7));
}

export const ITEM_UPGRADE_LEVELS: Record<number, ItemUpgradeLevelConfig> = {
  1: { gold: 50, iskrokamin: 1, mana: 10, npcChance: 95, selfChance: 90 },
  2: { gold: 120, iskrokamin: 2, mana: 18, npcChance: 82, selfChance: 76 },
  3: { gold: 260, iskrokamin: 4, mana: 30, npcChance: 66, selfChance: 60 },
  4: { gold: 500, iskrokamin: 10, mana: 45, npcChance: 48, selfChance: 42 },
  5: { gold: 900, iskrokamin: 17, mana: 65, npcChance: 32, selfChance: 28 }
};

export function normalizeItemUpgradeLevel(value: number | undefined | null): number {
  return Math.max(0, Math.min(MAX_ITEM_UPGRADE_LEVEL, Math.floor(value ?? 0)));
}

export function getItemUpgradeLevelFromItemId(itemId: string): number {
  const authoredMatch = /\.plus-([1-5])$/.exec(itemId);
  if (authoredMatch) {
    return normalizeItemUpgradeLevel(Number(authoredMatch[1]));
  }

  const generatedMatch = /^item\.loot-v1-[a-z]\d{3}-plus-([1-5])$/.exec(itemId);
  return generatedMatch ? normalizeItemUpgradeLevel(Number(generatedMatch[1])) : 0;
}

export function getBaseItemIdForUpgradeVariant(itemId: string): string {
  if (/^item\.loot-v1-[a-z]\d{3}-plus-[1-5]$/.test(itemId)) {
    return itemId.replace(/-plus-[1-5]$/, "");
  }

  return itemId.replace(/\.plus-[1-5]$/, "");
}

export function makeItemUpgradeVariantId(baseItemId: string, level: number): string {
  const safeLevel = normalizeItemUpgradeLevel(level);
  const baseId = getBaseItemIdForUpgradeVariant(baseItemId);

  if (safeLevel <= 0) {
    return baseId;
  }

  if (/^item\.loot-v1-[a-z]\d{3}$/.test(baseId)) {
    return `${baseId}-plus-${safeLevel}`;
  }

  return `${baseId}${ITEM_UPGRADE_VARIANT_SUFFIX}${safeLevel}`;
}

export function getNextItemUpgradeItemId(itemId: string): string | null {
  const level = getItemUpgradeLevelFromItemId(itemId);

  return level >= MAX_ITEM_UPGRADE_LEVEL ? null : makeItemUpgradeVariantId(itemId, level + 1);
}

export function getItemDisplayNameWithUpgrade(item: Pick<ItemContent, "name">, level = 0): string {
  const safeLevel = normalizeItemUpgradeLevel(level);
  const baseName = item.name.replace(/ \+[1-5]$/, "");

  return safeLevel > 0 ? `${baseName} +${safeLevel}` : baseName;
}

export function isItemUpgradeable(item: ItemContent, level = getItemUpgradeLevelFromItemId(item.id)): boolean {
  const tags = new Set(item.tags ?? []);

  if (item.slot === "accessory" || item.slot === "consumable" || item.slot === "cosmetic" || item.slot === "junk") {
    return false;
  }

  if (
    tags.has("consumable") ||
    tags.has("one-use") ||
    tags.has("story") ||
    tags.has("memory")
  ) {
    return false;
  }

  if ((item.goldValue ?? 0) <= 4) {
    return false;
  }

  return normalizeItemUpgradeLevel(level) < MAX_ITEM_UPGRADE_LEVEL && getItemUpgradePrimaryStat(item) !== null;
}

export function getItemUpgradePrimaryStat(item: ItemContent): ItemUpgradePrimaryStat | null {
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

export function applyItemUpgradeEffect(
  effect: ItemEffectContent | undefined,
  item: ItemContent,
  level = getItemUpgradeLevelFromItemId(item.id)
): ItemEffectContent | undefined {
  const safeLevel = normalizeItemUpgradeLevel(level);
  const primary = getItemUpgradePrimaryStat(item);
  const primaryBonus = safeLevel <= 3
    ? safeLevel
    : safeLevel === 4
      ? 5
      : 7;

  if (safeLevel <= 0 || !primary) {
    return effect;
  }

  return {
    ...(effect ?? {}),
    [primary]: Math.min(10, (effect?.[primary] ?? 0) + primaryBonus)
  };
}

export function getItemUpgradeLevelConfig(targetLevel: number): ItemUpgradeLevelConfig {
  const safeTarget = Math.max(1, Math.min(MAX_ITEM_UPGRADE_LEVEL, Math.floor(targetLevel)));

  return ITEM_UPGRADE_LEVELS[safeTarget] ?? ITEM_UPGRADE_LEVELS[1]!;
}

export function calculateItemUpgradeCosts(input: {
  method: ItemUpgradeMethod;
  targetLevel: number;
  donor?: ItemUpgradeDonorBonus | null;
}): { gold: number; iskrokamin: number; mana: number } {
  const config = getItemUpgradeLevelConfig(input.targetLevel);
  const discount = Math.max(0, input.donor?.iskrokaminDiscount ?? 0);

  return {
    gold: input.method === "npc" ? config.gold : 0,
    iskrokamin: Math.max(1, config.iskrokamin - discount),
    mana: input.method === "self" ? config.mana : 0
  };
}

export function calculateItemUpgradeChance(input: {
  method: ItemUpgradeMethod;
  targetLevel: number;
  luck: number;
  pityFailures: number;
  donor?: ItemUpgradeDonorBonus | null;
}): ItemUpgradeChanceBreakdown {
  const config = getItemUpgradeLevelConfig(input.targetLevel);
  const baseChance = input.method === "self" ? config.selfChance : config.npcChance;
  const luckBonus = Math.max(-10, Math.min(15, Math.round((Math.floor(input.luck) - 10) * 1.25)));
  const safeFailures = Math.max(0, Math.floor(input.pityFailures));
  const guaranteed = safeFailures >= 5;
  const pityBonus = Math.min(32, safeFailures * 8);
  const donorBonus = input.donor?.chanceBonus ?? 0;

  return {
    baseChance,
    luckBonus,
    pityBonus,
    donorBonus,
    finalChance: guaranteed ? 100 : Math.max(5, Math.min(98, baseChance + luckBonus + pityBonus + donorBonus)),
    guaranteed
  };
}

export function getDonorBonus(input: {
  baseItem: ItemContent;
  baseItemId: string;
  donorItem: ItemContent;
  donorItemId: string;
}): ItemUpgradeDonorBonus | null {
  const baseLevel = getItemUpgradeLevelFromItemId(input.baseItemId);
  const donorLevel = getItemUpgradeLevelFromItemId(input.donorItemId);

  if (baseLevel !== donorLevel || !isItemUpgradeable(input.donorItem, donorLevel)) {
    return null;
  }

  if (getBaseItemIdForUpgradeVariant(input.baseItemId) === getBaseItemIdForUpgradeVariant(input.donorItemId)) {
    return {
      kind: "same-template",
      chanceBonus: 12,
      iskrokaminDiscount: baseLevel >= 3 ? 2 : 1
    };
  }

  if ((input.baseItem.equipmentSlot ?? input.baseItem.slot) === (input.donorItem.equipmentSlot ?? input.donorItem.slot)) {
    return {
      kind: "same-slot",
      chanceBonus: 7,
      iskrokaminDiscount: 1
    };
  }

  return null;
}

export function isMageClassForItemSelfUpgrade(classId: string): boolean {
  return classId === "class.mage" || classId === "class.varenyk-mancer" || classId === "class.bureaucramancer";
}

export function getLuckFromStats(stats: CharacterStats): number {
  return Math.max(0, Math.floor(stats.luck));
}

export function buildItemUpgradeVariantContents(baseItems: readonly ItemContent[]): ItemContent[] {
  return baseItems.flatMap((base) => {
    if (!isItemUpgradeable(base, 0) || getItemUpgradeLevelFromItemId(base.id) > 0 || base.id.startsWith("item.loot-v1-")) {
      return [];
    }

    return ([1, 2, 3, 4, 5] as const).map((level) => {
      const effect = applyItemUpgradeEffect(base.effect, base, level);

      return {
        ...base,
        id: makeItemUpgradeVariantId(base.id, level),
        name: getItemDisplayNameWithUpgrade(base, level),
        description: `${base.description}\n\nПідсилення +${level}: Чароковальня просить не лизати іскри.`,
        ...(effect ? { effect } : {})
      };
    });
  });
}
