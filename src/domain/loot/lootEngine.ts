import type { ItemContent } from "../../content/schema";
import {
  buildLootExpansionVariant,
  checkLootExpansionEquipRequirement,
  getEnhancementWeight,
  getLootExpansionAffinityMultiplier,
  getLootExpansionSourceWeightMultiplier,
  getLootExpansionTagMultiplier,
  lootExpansionV1Data,
  type LootExpansionProfile,
  type LootExpansionSourceId
} from "../../content/lootExpansionV1";
import type { RandomSource } from "../../shared/random";

export type LootRarity = "common" | "uncommon" | "rare" | "epic";

export interface LootCandidate {
  item: ItemContent;
  rarity: LootRarity;
  weight?: number;
}

export type MonsterLootEntry =
  | string
  | {
      itemId: string;
      weight?: number;
    };

export interface LootRollInput {
  monsterId: string;
  monsterLoot: Readonly<Record<string, readonly MonsterLootEntry[]>>;
  items: readonly ItemContent[];
  luck: number;
  dropChanceMultiplier?: number;
  rng: RandomSource;
  character?: LootExpansionProfile;
  sourceId?: LootExpansionSourceId;
  sourceTags?: readonly string[];
}

export type LootRollResult =
  | {
      state: "dropped";
      rarity: LootRarity;
      item: ItemContent;
    }
  | {
      state: "none";
      rarity?: LootRarity;
      reason: "no-drop" | "no-eligible-loot";
    };

export const LOOT_RARITY_WEIGHTS: Record<LootRarity, number> = {
  common: 0.7,
  uncommon: 0.22,
  rare: 0.07,
  epic: 0.01
};

export const BASE_ITEM_DROP_CHANCE = 0.35;

export const BANDAGE_DROP_QUANTITY_WEIGHTS: ReadonlyArray<{ quantity: number; weight: number }> = [
  { quantity: 0, weight: 0.5 },
  { quantity: 1, weight: 0.25 },
  { quantity: 2, weight: 0.13 },
  { quantity: 3, weight: 0.08 },
  { quantity: 4, weight: 0.03 },
  { quantity: 5, weight: 0.01 }
];

const rarityOrder: LootRarity[] = ["common", "uncommon", "rare", "epic"];

export function rollMonsterLoot(input: LootRollInput): LootRollResult {
  const candidates = [
    ...getLootCandidates(input),
    ...(input.character
      ? getLootExpansionCandidates({
          profile: input.character,
          sourceId: input.sourceId ?? "trash_mob",
          sourceTags: input.sourceTags ?? []
        })
      : [])
  ];

  if (candidates.length === 0) {
    return { state: "none", reason: "no-eligible-loot" };
  }

  if (input.rng.nextFloat() >= getItemDropChance(input.luck) * (input.dropChanceMultiplier ?? 1)) {
    return { state: "none", reason: "no-drop" };
  }

  const rarity = rollLootRarity(input.rng, input.luck);
  const eligible = selectCandidatesForRarity(candidates, rarity);
  const selected = selectWeightedCandidate(eligible, input.rng);

  if (!selected) {
    return { state: "none", rarity, reason: "no-eligible-loot" };
  }

  return {
    state: "dropped",
    rarity,
    item: selected.item
  };
}

export function getLootCandidates(input: Omit<LootRollInput, "luck" | "rng">): LootCandidate[] {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const seen = new Set<string>();

  return (input.monsterLoot[input.monsterId] ?? []).flatMap((entry) => {
    const itemId = getMonsterLootEntryItemId(entry);

    if (seen.has(itemId)) {
      return [];
    }

    seen.add(itemId);
    const item = itemById.get(itemId);

    return item
      ? [
          {
            item,
            rarity: item.rarity,
            ...(typeof entry === "string" || entry.weight === undefined ? {} : { weight: entry.weight })
          }
        ]
      : [];
  });
}

export function getMonsterLootEntryItemId(entry: MonsterLootEntry): string {
  return typeof entry === "string" ? entry : entry.itemId;
}

export function getLootExpansionCandidates(input: {
  profile: LootExpansionProfile;
  sourceId: LootExpansionSourceId;
  sourceTags?: readonly string[];
}): LootCandidate[] {
  const playerLevel = Math.max(1, Math.floor(input.profile.level));

  return lootExpansionV1Data.items.flatMap((base) => {
    const maxEnhancement = Math.min(base.max_enhancement, 5);
    const rarityMultiplier = getLootExpansionSourceWeightMultiplier(input.sourceId, base.rarity);

    if (rarityMultiplier <= 0 || base.min_level > playerLevel) {
      return [];
    }

    const affinityMultiplier = getLootExpansionAffinityMultiplier(base, input.profile);
    const tagMultiplier = getLootExpansionTagMultiplier(input.sourceId, [
      ...base.tags,
      ...(input.sourceTags ?? [])
    ]);
    const baseWeight = base.roll_weight * rarityMultiplier * affinityMultiplier * tagMultiplier;

    return ([0, 1, 2, 3, 4, 5] as const).flatMap((enhancement) => {
      if (enhancement > maxEnhancement) {
        return [];
      }

      const enhancementWeight = getEnhancementWeight(playerLevel, enhancement);

      if (enhancementWeight <= 0) {
        return [];
      }

      const variant = buildLootExpansionVariant(base, enhancement);

      if (variant.minLevel > playerLevel) {
        return [];
      }

      if (!checkLootExpansionEquipRequirement(variant.item.id, input.profile).canEquip) {
        return [];
      }

      return [
        {
          item: variant.item,
          rarity: variant.item.rarity,
          weight: baseWeight * (enhancementWeight / 100)
        }
      ];
    });
  });
}

export function rollLootExpansionItem(input: {
  profile: LootExpansionProfile;
  sourceId?: LootExpansionSourceId;
  sourceTags?: readonly string[];
  luck?: number;
  rng: RandomSource;
}): ItemContent | null {
  const candidates = getLootExpansionCandidates({
    profile: input.profile,
    sourceId: input.sourceId ?? "trash_mob",
    ...(input.sourceTags ? { sourceTags: input.sourceTags } : {})
  });
  const eligible =
    input.luck === undefined
      ? candidates
      : selectCandidatesForRarity(candidates, rollLootRarity(input.rng, input.luck));

  return selectWeightedCandidate(eligible, input.rng)?.item ?? null;
}

export function rollLootRarity(rng: RandomSource, luck: number): LootRarity {
  const base = rarityFromRoll(rng.nextFloat());

  if (base === "epic" || rng.nextFloat() >= getLuckUpgradeChance(luck)) {
    return base;
  }

  return rarityOrder[Math.min(rarityOrder.indexOf(base) + 1, rarityOrder.length - 1)] ?? base;
}

export function getItemDropChance(luck: number): number {
  return clamp(BASE_ITEM_DROP_CHANCE + getBoundedLuckBonus(luck), 0.25, 0.45);
}

export function getLuckUpgradeChance(luck: number): number {
  return getBoundedLuckBonus(luck);
}

export function rollBandageDropQuantity(input: {
  luck: number;
  rng: RandomSource;
}): number {
  const quantity = rollBaseBandageDropQuantity(input.rng.nextFloat());
  const upgradeChance = getLuckUpgradeChance(input.luck);

  if (quantity >= 5 || upgradeChance <= 0) {
    return quantity;
  }

  return input.rng.nextFloat() < upgradeChance ? quantity + 1 : quantity;
}

function rollBaseBandageDropQuantity(roll: number): number {
  const bounded = clamp(roll, 0, 0.999_999);
  const totalWeight = BANDAGE_DROP_QUANTITY_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = 0;

  for (const entry of BANDAGE_DROP_QUANTITY_WEIGHTS) {
    cursor += entry.weight / totalWeight;

    if (bounded < cursor) {
      return entry.quantity;
    }
  }

  return 5;
}

function getBoundedLuckBonus(luck: number): number {
  return clamp((Math.floor(luck) - 6) * 0.01, 0, 0.1);
}

function rarityFromRoll(roll: number): LootRarity {
  const bounded = clamp(roll, 0, 0.999_999);

  if (bounded < LOOT_RARITY_WEIGHTS.common) {
    return "common";
  }

  if (bounded < LOOT_RARITY_WEIGHTS.common + LOOT_RARITY_WEIGHTS.uncommon) {
    return "uncommon";
  }

  if (
    bounded <
    LOOT_RARITY_WEIGHTS.common + LOOT_RARITY_WEIGHTS.uncommon + LOOT_RARITY_WEIGHTS.rare
  ) {
    return "rare";
  }

  return "epic";
}

function selectCandidatesForRarity(
  candidates: readonly LootCandidate[],
  rarity: LootRarity
): LootCandidate[] {
  const targetIndex = rarityOrder.indexOf(rarity);

  for (let index = targetIndex; index >= 0; index -= 1) {
    const matching = candidates.filter((candidate) => candidate.rarity === rarityOrder[index]);

    if (matching.length > 0) {
      return matching;
    }
  }

  for (let index = targetIndex + 1; index < rarityOrder.length; index += 1) {
    const matching = candidates.filter((candidate) => candidate.rarity === rarityOrder[index]);

    if (matching.length > 0) {
      return matching;
    }
  }

  return [...candidates];
}

function selectWeightedCandidate(
  candidates: readonly LootCandidate[],
  rng: RandomSource
): LootCandidate | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  const totalWeight = candidates.reduce(
    (sum, candidate) => sum + Math.max(0, candidate.weight ?? 1),
    0
  );

  if (totalWeight <= 0) {
    return candidates[0];
  }

  const target = rng.nextFloat() * totalWeight;
  let cursor = 0;

  for (const candidate of candidates) {
    cursor += Math.max(0, candidate.weight ?? 1);

    if (target < cursor) {
      return candidate;
    }
  }

  return candidates.at(-1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
