import type { ItemContent, ItemEffectContent } from "./schema";
import { lootExpansionV1Data as lootExpansionV1RawData } from "./lootExpansionV1Data";

export const lootExpansionV1Data = lootExpansionV1RawData;

export type LootExpansionBaseItem = (typeof lootExpansionV1Data.items)[number];
export type LootExpansionEffect = (typeof lootExpansionV1Data.effects)[number];
export type LootExpansionRarity = LootExpansionBaseItem["rarity"];
export type LootExpansionSourceId =
  (typeof lootExpansionV1Data.roll_rules.rarity_weights_by_source)[number]["source_id"];
export type LootExpansionEnhancement = 0 | 1 | 2 | 3 | 4 | 5;

export interface LootExpansionProfile {
  level: number;
  classId?: string;
  raceId?: string;
  title?: string;
  titleIds?: readonly string[];
}

export interface LootExpansionVariant {
  baseId: string;
  variantId: string;
  enhancement: LootExpansionEnhancement;
  minLevel: number;
  effectiveRarity: LootExpansionRarity;
  priceCoins: number;
  effectIds: readonly string[];
  item: ItemContent;
}

export interface LootExpansionEquipCheck {
  canEquip: boolean;
  reasons: Array<"min-level" | "class" | "race" | "title" | "unknown-item">;
}

export const LOOT_EXPANSION_V1_BASE_ITEM_COUNT = lootExpansionV1Data.items.length;
export const LOOT_EXPANSION_V1_EFFECT_COUNT = lootExpansionV1Data.effects.length;

export const PLUS_UNLOCK: Record<LootExpansionEnhancement, number> = {
  0: 1,
  1: 3,
  2: 6,
  3: 10,
  4: 14,
  5: 18
};

export const PLUS_PRICE_MULT: Record<LootExpansionEnhancement, number> = {
  0: 1.0,
  1: 1.7,
  2: 2.8,
  3: 4.5,
  4: 7.0,
  5: 10.0
};

const enhancementOddsByMax: Record<LootExpansionEnhancement, number> = {
  0: 35,
  1: 25,
  2: 18,
  3: 12,
  4: 7,
  5: 3
};
const enhancementOddsLevel10: Record<LootExpansionEnhancement, number> = {
  0: 55,
  1: 25,
  2: 14,
  3: 6,
  4: 0,
  5: 0
};
const enhancementOddsLevel14: Record<LootExpansionEnhancement, number> = {
  0: 45,
  1: 25,
  2: 17,
  3: 9,
  4: 4,
  5: 0
};

export const lootExpansionV1ItemContents = buildAllLootExpansionItemContents();

export function getLootExpansionItemId(
  baseId: string,
  enhancement: LootExpansionEnhancement
): string {
  return enhancement === 0
    ? `item.loot-v1-${baseId}`
    : `item.loot-v1-${baseId}-plus-${enhancement}`;
}

export function maxAllowedEnhancement(playerLevel: number, itemMax: number): LootExpansionEnhancement {
  const safeLevel = Math.max(1, Math.floor(playerLevel));
  const safeItemMax = Math.max(0, Math.min(5, Math.floor(itemMax)));
  const allowed = ([0, 1, 2, 3, 4, 5] as const).filter(
    (enhancement) => safeLevel >= PLUS_UNLOCK[enhancement]
  );

  return Math.min(safeItemMax, Math.max(...allowed)) as LootExpansionEnhancement;
}

export function getEnhancementWeight(
  playerLevel: number,
  enhancement: LootExpansionEnhancement
): number {
  if (playerLevel < PLUS_UNLOCK[enhancement]) {
    return 0;
  }

  const maxAllowed = maxAllowedEnhancement(playerLevel, 5);

  if (enhancement > maxAllowed) {
    return 0;
  }

  if (playerLevel < 3) {
    return enhancement === 0 ? 100 : 0;
  }

  if (playerLevel < 6) {
    return enhancement === 0 ? 88 : enhancement === 1 ? 12 : 0;
  }

  if (playerLevel < 10) {
    return enhancement === 0 ? 70 : enhancement === 1 ? 22 : enhancement === 2 ? 8 : 0;
  }

  if (playerLevel < 14) {
    return enhancementOddsLevel10[enhancement];
  }

  if (playerLevel < 18) {
    return enhancementOddsLevel14[enhancement];
  }

  return enhancementOddsByMax[enhancement];
}

export function buildLootExpansionVariant(
  base: LootExpansionBaseItem,
  enhancement: LootExpansionEnhancement
): LootExpansionVariant {
  const minLevel = Math.max(base.min_level, PLUS_UNLOCK[enhancement]);
  const priceCoins = Math.max(0, Math.round(base.base_price_coins * PLUS_PRICE_MULT[enhancement]));
  const item = buildItemContent(base, enhancement, minLevel, priceCoins);

  return {
    baseId: base.id,
    variantId: item.id,
    enhancement,
    minLevel,
    effectiveRarity: base.rarity,
    priceCoins,
    effectIds: base.effect_ids,
    item
  };
}

export function findLootExpansionBaseItem(baseId: string): LootExpansionBaseItem | undefined {
  return lootExpansionV1Data.items.find((item) => item.id === baseId);
}

export function findLootExpansionVariantByItemId(itemId: string): LootExpansionVariant | null {
  const parsed = parseLootExpansionItemId(itemId);

  if (!parsed) {
    return null;
  }

  const base = findLootExpansionBaseItem(parsed.baseId);

  if (!base || parsed.enhancement > base.max_enhancement) {
    return null;
  }

  return buildLootExpansionVariant(base, parsed.enhancement);
}

export function isLootExpansionItemId(itemId: string): boolean {
  return parseLootExpansionItemId(itemId) !== null;
}

export function checkLootExpansionEquipRequirement(
  itemId: string,
  profile: LootExpansionProfile
): LootExpansionEquipCheck {
  const variant = findLootExpansionVariantByItemId(itemId);

  if (!variant) {
    return { canEquip: false, reasons: ["unknown-item"] };
  }

  const base = findLootExpansionBaseItem(variant.baseId);

  if (!base) {
    return { canEquip: false, reasons: ["unknown-item"] };
  }

  const reasons: LootExpansionEquipCheck["reasons"] = [];
  const requirement = base.requirements;
  const profileClass = normalizeLootExpansionClassId(profile.classId);
  const profileRace = normalizeLootExpansionRaceId(profile.raceId);
  const titleIds = normalizeLootExpansionTitleIds(profile);
  const minLevel = Math.max(requirement.min_level, variant.minLevel);

  if (Math.floor(profile.level) < minLevel) {
    reasons.push("min-level");
  }

  if (requirement.classes.length > 0 && !profileClass) {
    reasons.push("class");
  } else if (
    requirement.classes.length > 0 &&
    profileClass &&
    !(requirement.classes as readonly string[]).includes(profileClass)
  ) {
    reasons.push("class");
  }

  if (requirement.races.length > 0 && !profileRace) {
    reasons.push("race");
  } else if (
    requirement.races.length > 0 &&
    profileRace &&
    !(requirement.races as readonly string[]).includes(profileRace)
  ) {
    reasons.push("race");
  }

  if (
    requirement.titles.length > 0 &&
    !(requirement.titles as readonly string[]).some((titleId) => titleIds.has(titleId))
  ) {
    reasons.push("title");
  }

  return {
    canEquip: reasons.length === 0,
    reasons
  };
}

export function normalizeLootExpansionClassId(classId: string | undefined): string | undefined {
  if (!classId) {
    return undefined;
  }

  const key = stripContentPrefix(classId);
  const mapped: Record<string, string> = {
    "bureaucramancer": "bureaucrat",
    "priest": "cleric",
    "varenyk-mancer": "cook",
    "kharakternyk": "warrior"
  };

  return mapped[key] ?? key;
}

export function normalizeLootExpansionRaceId(raceId: string | undefined): string | undefined {
  if (!raceId) {
    return undefined;
  }

  const key = stripContentPrefix(raceId);
  const mapped: Record<string, string> = {
    "human-ish": "human",
    "intellectual-orc": "orc",
    "domovyk": "gnome",
    "dryland-rusalka": "frogfolk",
    "molfar-soul": "human",
    "bisyny": "goblin",
    "drantohor": "dragonkin"
  };

  return mapped[key] ?? key;
}

export function normalizeLootExpansionTitleIds(profile: LootExpansionProfile): Set<string> {
  const ids = new Set((profile.titleIds ?? []).map(stripContentPrefix));
  const title = profile.title?.toLocaleLowerCase("uk-UA") ?? "";

  if (title.includes("патель")) {
    ids.add("lord_of_pan");
  }

  if (title.includes("архів")) {
    ids.add("archive_rat");
  }

  if (title.includes("черг")) {
    ids.add("queue_marshall");
  }

  if (title.includes("капелюх") || title.includes("шапк")) {
    ids.add("hero_without_hat");
  }

  if (title.includes("книш") || title.includes("начинк") || title.includes("сметан")) {
    ids.add("soup_knight");
  }

  return ids;
}

export function getLootExpansionSourceWeightMultiplier(
  sourceId: LootExpansionSourceId,
  rarity: LootExpansionRarity
): number {
  const defaultWeight = lootExpansionV1Data.roll_rules.rarity_weights_default[rarity];
  const source = lootExpansionV1Data.roll_rules.rarity_weights_by_source.find(
    (candidate) => candidate.source_id === sourceId
  );
  const sourceWeight = source?.weights[rarity] ?? defaultWeight;

  if (defaultWeight <= 0 || sourceWeight <= 0) {
    return 0;
  }

  return sourceWeight / defaultWeight;
}

export function getLootExpansionTagMultiplier(
  sourceId: LootExpansionSourceId,
  tags: readonly string[]
): number {
  const source = lootExpansionV1Data.roll_rules.rarity_weights_by_source.find(
    (candidate) => candidate.source_id === sourceId
  );
  const tagBonus =
    source && "tag_bonus" in source ? (source.tag_bonus as Record<string, number>) : undefined;

  if (!tagBonus) {
    return 1;
  }

  const bonusPct = tags.reduce((max, tag) => Math.max(max, tagBonus[tag] ?? 0), 0);

  return 1 + bonusPct / 100;
}

export function getLootExpansionAffinityMultiplier(
  base: LootExpansionBaseItem,
  profile: LootExpansionProfile
): number {
  const profileClass = normalizeLootExpansionClassId(profile.classId);
  const profileRace = normalizeLootExpansionRaceId(profile.raceId);
  const titleIds = normalizeLootExpansionTitleIds(profile);
  const classBonus = profileClass
    ? maxAffinityBonus(base.affinity.classes, profileClass)
    : 0;
  const raceBonus = profileRace ? maxAffinityBonus(base.affinity.races, profileRace) : 0;
  const titleBonus = Math.max(
    0,
    ...base.affinity.titles
      .filter((entry) => titleIds.has(entry.id))
      .map((entry) => entry.drop_weight_bonus_pct)
  );

  return (1 + classBonus / 100) * (1 + raceBonus / 100) * (1 + titleBonus / 100);
}

export function getLootExpansionValidationReport(): {
  effectIdsResolve: boolean;
  affinityIdsResolve: boolean;
  variantCount: number;
} {
  const effectIds = new Set(lootExpansionV1Data.effects.map((effect) => effect.id));
  const classIds = new Set(lootExpansionV1Data.classes.map((entry) => entry.id));
  const raceIds = new Set(lootExpansionV1Data.races.map((entry) => entry.id));
  const titleIds = new Set(lootExpansionV1Data.titles.map((entry) => entry.id));
  const effectIdsResolve = lootExpansionV1Data.items.every((item) =>
    item.effect_ids.every((effectId) => effectIds.has(effectId))
  );
  const affinityIdsResolve = lootExpansionV1Data.items.every(
    (item) =>
      item.affinity.classes.every((entry) => classIds.has(entry.id)) &&
      item.affinity.races.every((entry) => raceIds.has(entry.id)) &&
      item.affinity.titles.every((entry) => titleIds.has(entry.id))
  );

  return {
    effectIdsResolve,
    affinityIdsResolve,
    variantCount: lootExpansionV1ItemContents.length
  };
}

function buildAllLootExpansionItemContents(): ItemContent[] {
  return lootExpansionV1Data.items.flatMap((base) =>
    ([0, 1, 2, 3, 4, 5] as const)
      .filter((enhancement) => enhancement <= base.max_enhancement)
      .map((enhancement) => buildLootExpansionVariant(base, enhancement).item)
  );
}

function parseLootExpansionItemId(
  itemId: string
): { baseId: string; enhancement: LootExpansionEnhancement } | null {
  const match = /^item\.loot-v1-([a-z]\d{3})(?:-plus-([1-5]))?$/.exec(itemId);

  if (!match) {
    return null;
  }

  return {
    baseId: match[1] ?? "",
    enhancement: (match[2] ? Number(match[2]) : 0) as LootExpansionEnhancement
  };
}

function buildItemContent(
  base: LootExpansionBaseItem,
  enhancement: LootExpansionEnhancement,
  minLevel: number,
  priceCoins: number
): ItemContent {
  const slot = mapLootExpansionSlot(base);
  const effect = mapLootExpansionEffect(base, enhancement, slot);

  return {
    id: getLootExpansionItemId(base.id, enhancement),
    name: enhancement === 0 ? base.name_uk : `${base.name_uk} +${enhancement}`,
    description: buildDescription(base, enhancement, minLevel),
    rarity: mapLootExpansionRarity(base.rarity),
    slot,
    goldValue: priceCoins,
    ...(effect ? { effect } : {})
  };
}

function buildDescription(
  base: LootExpansionBaseItem,
  enhancement: LootExpansionEnhancement,
  minLevel: number
): string {
  const parts: string[] = [base.flavor_uk];

  if (enhancement > 0) {
    parts.push(`Посилення +${enhancement}: слабка магія, мінімальний рівень ${minLevel}.`);
  }

  return parts.join(" ");
}

function mapLootExpansionRarity(rarity: LootExpansionRarity): ItemContent["rarity"] {
  return rarity === "legendary" ? "epic" : rarity;
}

function mapLootExpansionSlot(base: LootExpansionBaseItem): ItemContent["slot"] {
  if (base.category === "weapon") {
    return "weapon";
  }

  if (base.category === "armor") {
    return "armor";
  }

  if (base.category === "accessory") {
    return "accessory";
  }

  if (base.category === "tool") {
    return "accessory";
  }

  if (base.category === "consumable") {
    return "consumable";
  }

  return "junk";
}

function mapLootExpansionEffect(
  base: LootExpansionBaseItem,
  enhancement: LootExpansionEnhancement,
  slot: ItemContent["slot"]
): ItemEffectContent | undefined {
  if (!["weapon", "armor", "accessory"].includes(slot)) {
    return undefined;
  }

  const effect: Partial<ItemEffectContent> = {};

  if (slot === "weapon" && base.stats.damage > 0) {
    effect.weaponDamage = clampInt(enhancement > 0 ? enhancement : 1, 1, 10);
  }

  if (slot === "armor" && base.stats.armor > 0) {
    effect.armor = clampInt(enhancement > 0 ? Math.ceil(enhancement / 2) : 1, 1, 10);
  }

  if (base.stats.hp > 0) {
    effect.hpMax = clampInt(Math.max(1, Math.ceil(base.stats.hp / 2) + (enhancement >= 3 ? 1 : 0)), 1, 20);
  }

  if (base.stats.mana > 0) {
    effect.manaMax = clampInt(
      Math.max(1, Math.ceil(base.stats.mana / 2) + (enhancement >= 3 ? 1 : 0)),
      1,
      20
    );
  }

  if (base.stats.luck > 0) {
    effect.luck = clampInt(Math.max(1, base.stats.luck + (enhancement >= 2 ? 1 : 0)), 1, 10);
  }

  if (base.stats.speed > 0 || base.stats.dodge_pct > 0) {
    effect.dexterity = clampInt(
      (effect.dexterity ?? 0) +
        Math.max(1, Math.ceil((base.stats.speed + base.stats.dodge_pct) / 2) + enhancementStep(enhancement)),
      1,
      10
    );
  }

  if (base.stats.social > 0) {
    effect.charisma = clampInt(
      (effect.charisma ?? 0) +
        Math.max(1, Math.ceil(base.stats.social / 2) + enhancementStep(enhancement)),
      1,
      10
    );
  }

  if (base.stats.crit_pct > 0 && slot === "accessory") {
    effect.luck = clampInt(
      (effect.luck ?? 0) + Math.max(1, Math.ceil(base.stats.crit_pct / 2)),
      1,
      10
    );
  }

  if (base.stats.carry > 0 && slot === "accessory") {
    effect.hpMax = clampInt(
      (effect.hpMax ?? 0) + Math.max(1, base.stats.carry + enhancementStep(enhancement)),
      1,
      20
    );
  }

  if (base.stats.armor > 0 && slot === "accessory") {
    effect.armor = clampInt(
      (effect.armor ?? 0) + Math.max(1, Math.ceil(base.stats.armor / 2)),
      1,
      10
    );
  }

  if (Object.keys(effect).length === 0 && slot === "accessory") {
    Object.assign(effect, buildFallbackAccessoryEffect(base, enhancement));
  }

  return Object.keys(effect).length > 0 ? effect : undefined;
}

function buildFallbackAccessoryEffect(
  base: LootExpansionBaseItem,
  enhancement: LootExpansionEnhancement
): Partial<ItemEffectContent> {
  const idsAndTags = [...base.effect_ids, ...base.tags].join(" ");
  const bonus = 1 + enhancementStep(enhancement);

  if (/boss|respawn|survival|shield|barrier|tank/.test(idsAndTags)) {
    return {
      hpMax: clampInt(2 + bonus, 1, 20),
      resist: clampInt(bonus, 1, 10)
    };
  }

  if (/magic|mana|spark|tea|arcane|craft/.test(idsAndTags)) {
    return {
      manaMax: clampInt(1 + bonus, 1, 20),
      spellPower: clampInt(bonus, 1, 10)
    };
  }

  if (/goblin|quest|map|labyrinth|tool|warning/.test(idsAndTags)) {
    return {
      dexterity: clampInt(bonus, 1, 10),
      luck: clampInt(bonus, 1, 10)
    };
  }

  return {
    luck: clampInt(bonus, 1, 10)
  };
}

function enhancementStep(enhancement: LootExpansionEnhancement): number {
  return enhancement >= 4 ? 2 : enhancement >= 2 ? 1 : 0;
}

function maxAffinityBonus(
  entries: readonly { id: string; drop_weight_bonus_pct: number }[],
  id: string
): number {
  return Math.max(
    0,
    ...entries
      .filter((entry) => entry.id === id)
      .map((entry) => Math.max(0, entry.drop_weight_bonus_pct))
  );
}

function stripContentPrefix(id: string): string {
  return id.includes(".") ? id.split(".").at(-1) ?? id : id;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
