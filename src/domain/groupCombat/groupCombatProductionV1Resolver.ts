import type { MonsterAbilityDefinition } from "../../content/monsterAbilities";
import { SeededRandomSource } from "../../shared/random";
import { GROUP_COMBAT_PRODUCTION_V1_CATALOG } from "./groupCombatProductionV1Catalog";

export type GroupCombatProductionV1Rarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export interface GroupCombatProductionV1LootCandidate {
  itemId: string;
  rarity: GroupCombatProductionV1Rarity;
  weight: number;
}

export interface GroupCombatProductionV1Monster {
  id: string;
  name: string;
  level: number;
  tags: readonly string[];
}

export interface GroupCombatProductionV1MonsterStats
  extends GroupCombatProductionV1Monster {
  hpMax: number;
  attack: number;
  armor: number;
  resist: number;
  dexterity: number;
}

type CatalogMonster = {
  name: string;
  level: number;
  tags: readonly string[];
  abilityIds: readonly string[];
  upgradeAbilityIds: ReadonlyArray<{
    abilityId: string;
    minEffectiveLevel: number;
  }>;
  directLoot: ReadonlyArray<{
    itemId: string;
    rarity: GroupCombatProductionV1Rarity;
    weight: number;
  }>;
};

type ExpansionItem = {
  id: string;
  /** Released materialized rarity, after the raw legendary-to-epic mapping. */
  rarity: GroupCombatProductionV1Rarity;
  /** Raw authoring rarity, retained only for the released source-weight multiplier. */
  sourceRarity?: GroupCombatProductionV1Rarity;
  minLevel: number;
  maxEnhancement: number;
  rollWeight: number;
  tags: readonly string[];
  requirements: {
    minLevel: number;
    classes: readonly string[];
    races: readonly string[];
    requiresTitle: boolean;
  };
  affinity: {
    classes: ReadonlyArray<{ id: string; bonus: number }>;
    races: ReadonlyArray<{ id: string; bonus: number }>;
  };
};

type ExpansionSource = {
  source_id: string;
  weights: Record<GroupCombatProductionV1Rarity, number>;
  tag_bonus?: Readonly<Record<string, number>>;
};

const catalog = GROUP_COMBAT_PRODUCTION_V1_CATALOG;
const monstersById = catalog.monsters as unknown as Readonly<Record<string, CatalogMonster>>;
const abilitiesById = catalog.abilities as unknown as Readonly<
  Record<string, MonsterAbilityDefinition>
>;
const expansionItems = catalog.lootExpansion.items as unknown as readonly ExpansionItem[];
const expansionSources = catalog.lootExpansion.sources as unknown as readonly ExpansionSource[];
const defaultRarityWeights = catalog.lootExpansion
  .rarityWeightsDefault as unknown as Record<GroupCombatProductionV1Rarity, number>;
const supportedAbilityIds = new Set(Object.keys(abilitiesById));

const CLASS_ID_ALIASES: Readonly<Record<string, string>> = {
  warrior: "warrior",
  mage: "mage",
  rogue: "rogue",
  bard: "bard",
  cleric: "priest",
  priest: "priest",
  ranger: "ranger",
  alchemist: "mage",
  blacksmith: "warrior",
  cook: "varenyk-mancer",
  "varenyk-mancer": "varenyk-mancer",
  necromancer: "mage",
  druid: "kharakternyk",
  bureaucrat: "bureaucramancer",
  bureaucramancer: "bureaucramancer",
  tank: "warrior",
  summoner: "mage",
  merchant: "bureaucramancer",
  kharakternyk: "kharakternyk"
};

const RACE_ID_ALIASES: Readonly<Record<string, string>> = {
  human: "human-ish",
  "human-ish": "human-ish",
  elf: "elf",
  dwarf: "dwarf",
  orc: "intellectual-orc",
  "intellectual-orc": "intellectual-orc",
  gnome: "domovyk",
  domovyk: "domovyk",
  halfling: "human-ish",
  catfolk: "bisyny",
  goblin: "bisyny",
  bisyny: "bisyny",
  skeleton: "molfar-soul",
  "molfar-soul": "molfar-soul",
  frogfolk: "dryland-rusalka",
  "dryland-rusalka": "dryland-rusalka",
  construct: "dwarf",
  dragonkin: "drantohor",
  drantohor: "drantohor",
  kharakternyk: "human-ish"
};

const PLUS_UNLOCK = [1, 3, 6, 10, 14, 18] as const;
const ENHANCEMENT_WEIGHTS = {
  under3: [100, 0, 0, 0, 0, 0],
  under6: [100, 1.3, 0, 0, 0, 0],
  under10: [100, 2.3, 0.4, 0, 0, 0],
  under14: [100, 3.1, 0.9, 0.2, 0, 0],
  under18: [100, 3.6, 1.2, 0.3, 0.1, 0],
  max: [100, 4.2, 1.8, 0.5, 0.2, 0.1]
} as const;

export function findGroupCombatProductionV1Monster(
  monsterId: string
): GroupCombatProductionV1Monster | null {
  const monster = monstersById[monsterId];
  return monster
    ? {
        id: monsterId,
        name: monster.name,
        level: monster.level,
        tags: [...monster.tags]
      }
    : null;
}

export function deriveGroupCombatProductionV1MonsterStats(input: {
  monsterId: string;
  effectiveLevel: number;
  remortCount?: number;
  remortPressureMode?: "single" | "multi";
}): GroupCombatProductionV1MonsterStats | null {
  const authored = monstersById[input.monsterId];
  if (!authored) {
    return null;
  }
  const tags = [...authored.tags];
  const level = Math.max(1, Math.floor(input.effectiveLevel));
  const pressureRank = Math.max(0, Math.floor(input.remortCount ?? 0) - 3);
  const mode = input.remortPressureMode ?? "single";
  const statLevel = pressureRank <= 0 || mode === "multi"
    ? level
    : Math.min(23, level + pressureRank * 4);
  const highTierLevel = Math.max(0, statLevel - 4);
  const lateTierLevel = Math.max(0, statLevel - 7);
  const earlyLevel = Math.min(statLevel, 5);
  const levelsAfterEarly = Math.max(0, statLevel - 5);
  const boundedAttackLevel =
    earlyLevel +
    Math.floor(earlyLevel / 2) +
    Math.floor(levelsAfterEarly * 0.5);
  const boundedHp = statLevel <= 5
    ? 10 + statLevel * 4 + Math.floor(highTierLevel / 2)
    : 30 +
      levelsAfterEarly * 3 +
      Math.floor(highTierLevel / 3) +
      Math.floor(lateTierLevel / 3);
  const multiPressureRank = Math.min(pressureRank, 5);
  const pressure = pressureRank <= 0
    ? { hpMax: 0, attack: 0 }
    : mode === "single"
      ? { hpMax: pressureRank * 4, attack: Math.floor(pressureRank / 2) }
      : {
          hpMax: multiPressureRank * Math.max(8, level),
          attack: multiPressureRank
        };
  return {
    id: input.monsterId,
    name: authored.name,
    level,
    tags,
    hpMax:
      boundedHp +
      (tags.includes("boss") ? 12 : 0) +
      (tags.includes("mini-boss") || tags.includes("tiny-boss") ? 4 : 0) +
      (tags.includes("swarm") ? 3 : 0) +
      pressure.hpMax,
    attack:
      2 +
      boundedAttackLevel +
      (tags.includes("dragon") || tags.includes("fire") ? 2 : 0) +
      (tags.includes("boss") ? 2 : 0) +
      (tags.includes("mini-boss") || tags.includes("tiny-boss") ? 1 : 0) +
      pressure.attack,
    armor:
      Math.floor(level / 4) +
      Math.floor(highTierLevel / 6) +
      countMatching(tags, ["armor", "stone", "construct", "knight"]),
    resist:
      Math.floor(level / 4) +
      Math.floor(highTierLevel / 6) +
      countMatching(tags, ["ghost", "undead", "cursed", "mind"]),
    dexterity:
      5 +
      Math.min(level, 8) +
      Math.floor(Math.max(0, level - 8) / 2) +
      countMatching(tags, ["beast", "insect", "mobility", "trickster"])
  };
}

export function resolveGroupCombatProductionV1MonsterAbilities(input: {
  monsterId: string;
  effectiveLevel: number;
}): MonsterAbilityDefinition[] {
  const monster = monstersById[input.monsterId];
  if (!monster) {
    return [];
  }
  const level = Math.max(1, Math.floor(input.effectiveLevel));
  const explicit = [
    ...monster.abilityIds,
    ...monster.upgradeAbilityIds
      .filter((upgrade) => level >= upgrade.minEffectiveLevel)
      .map((upgrade) => upgrade.abilityId)
  ];
  const slotCount = getAbilitySlotCount(level, monster.tags, monster.abilityIds.length);
  return explicit
    .filter((abilityId, index) => explicit.indexOf(abilityId) === index)
    .slice(0, slotCount)
    .flatMap((abilityId) => {
      const ability = supportedAbilityIds.has(abilityId)
        ? abilitiesById[abilityId]
        : undefined;
      return ability ? [structuredClone(ability)] : [];
    });
}

export function selectGroupCombatProductionV1BackupMonster(input: {
  participantLevel: number;
  encounterSeed: string;
  partySessionId: string;
  index: number;
  usedMonsterIds: readonly string[];
}): GroupCombatProductionV1Monster {
  const rng = new SeededRandomSource(
    `${input.encounterSeed}:${input.partySessionId}:backups`
  );
  let used = input.usedMonsterIds.slice(0, 1);
  let selected: GroupCombatProductionV1Monster | null = null;
  for (let index = 1; index <= input.index; index += 1) {
    selected = selectBackupMonsterOnce(input.participantLevel, rng, used);
    used = [...used, selected.id];
  }
  if (!selected) {
    throw new Error("Production-v1 backup selection requires a positive roster index.");
  }
  return selected;
}

export function getGroupCombatProductionV1BackupEffectiveLevel(
  participantLevel: number
): number {
  return Math.max(1, Math.floor(participantLevel) + 2);
}

export function getGroupCombatProductionV1LootCandidates(input: {
  monsterId: string;
  participantLevel: number;
  classId: string;
  raceId: string;
}): GroupCombatProductionV1LootCandidate[] {
  const monster = monstersById[input.monsterId];
  if (!monster) {
    throw new Error(`Unknown production-v1 monster ${input.monsterId}.`);
  }
  const playerLevel = Math.max(1, Math.floor(input.participantLevel));
  const sourceId = getLootSource(monster.level, monster.tags);
  const profileClass = normalizeContentId(input.classId, CLASS_ID_ALIASES);
  const profileRace = normalizeContentId(input.raceId, RACE_ID_ALIASES);
  const direct = dedupeCandidates(monster.directLoot);
  const expansion = expansionItems.flatMap((base) => {
    if (base.minLevel > playerLevel || base.requirements.requiresTitle) {
      return [];
    }
    const rarityMultiplier = getSourceRarityMultiplier(
      sourceId,
      base.sourceRarity ?? base.rarity
    );
    if (rarityMultiplier <= 0) {
      return [];
    }
    if (
      base.requirements.classes.length > 0 &&
      (!profileClass || !base.requirements.classes.includes(profileClass))
    ) {
      return [];
    }
    if (
      base.requirements.races.length > 0 &&
      (!profileRace || !base.requirements.races.includes(profileRace))
    ) {
      return [];
    }
    const classBonus = profileClass
      ? maxAffinityBonus(base.affinity.classes, profileClass)
      : 0;
    const raceBonus = profileRace
      ? maxAffinityBonus(base.affinity.races, profileRace)
      : 0;
    const baseWeight =
      base.rollWeight *
      rarityMultiplier *
      (1 + classBonus / 100) *
      (1 + raceBonus / 100) *
      getSourceTagMultiplier(sourceId, [...base.tags, ...monster.tags]);
    const maxEnhancement = Math.min(5, Math.max(0, base.maxEnhancement));
    return Array.from({ length: maxEnhancement + 1 }, (_, enhancement) => {
      const minLevel = Math.max(
        base.minLevel,
        (PLUS_UNLOCK as readonly number[])[enhancement] ?? 18
      );
      const enhancementWeight = getEnhancementWeight(playerLevel, enhancement);
      if (
        enhancementWeight <= 0 ||
        playerLevel < minLevel ||
        playerLevel < base.requirements.minLevel
      ) {
        return null;
      }
      return {
        itemId: enhancement === 0
          ? `item.loot-v1-${base.id}`
          : `item.loot-v1-${base.id}-plus-${enhancement}`,
        rarity: getUpgradeRarity(base.rarity, enhancement),
        weight: baseWeight * (enhancementWeight / 100)
      };
    }).filter(
      (candidate): candidate is GroupCombatProductionV1LootCandidate =>
        candidate !== null
    );
  });
  return [...direct, ...expansion];
}

function selectBackupMonsterOnce(
  participantLevel: number,
  rng: SeededRandomSource,
  recentMonsterIds: readonly string[]
): GroupCombatProductionV1Monster {
  const maxMonsterLevel = Math.max(3, Math.floor(participantLevel));
  const closeFloor = Math.max(1, Math.floor(participantLevel) - 2);
  const eligible = Object.entries(monstersById)
    .filter(([id, monster]) =>
      id !== "monster.mimic-shawarma" &&
      !monster.tags.includes("starter") &&
      !monster.tags.includes("boss") &&
      monster.level <= maxMonsterLevel
    )
    .map(([id, monster]) => ({
      id,
      name: monster.name,
      level: monster.level,
      tags: [...monster.tags]
    }));
  const close = eligible.filter((monster) => monster.level >= closeFloor);
  const candidates = applyRecentExclusions(
    close.length > 0 ? close : highestLevel(eligible),
    recentMonsterIds
  );
  const fallback = findGroupCombatProductionV1Monster("monster.deadline-spider");
  const selected = candidates.length > 0
    ? candidates[rng.nextInt(0, candidates.length - 1)] ?? candidates[0]
    : fallback;
  if (!selected) {
    throw new Error("Production-v1 backup catalog has no fallback monster.");
  }
  return selected;
}

function applyRecentExclusions(
  candidates: readonly GroupCombatProductionV1Monster[],
  recentMonsterIds: readonly string[]
): GroupCombatProductionV1Monster[] {
  const original = [...candidates];
  const distinctRecent = [...new Set(recentMonsterIds)].slice(0, 3);
  const recent = new Set(distinctRecent);
  if (recent.size > 0 && original.length > recent.size) {
    const withoutRecent = original.filter((monster) => !recent.has(monster.id));
    if (
      withoutRecent.length > 0 &&
      yegerRelevantShare(withoutRecent) <= yegerRelevantShare(original)
    ) {
      return withoutRecent;
    }
  }
  const previous = distinctRecent[0];
  if (previous && original.length > 1) {
    const withoutPrevious = original.filter((monster) => monster.id !== previous);
    if (withoutPrevious.length > 0) {
      return withoutPrevious;
    }
  }
  return original;
}

function highestLevel(
  monsters: readonly GroupCombatProductionV1Monster[]
): GroupCombatProductionV1Monster[] {
  const highest = monsters.reduce(
    (current, monster) => Math.max(current, monster.level),
    0
  );
  return monsters.filter((monster) => monster.level === highest);
}

function yegerRelevantShare(
  monsters: readonly GroupCombatProductionV1Monster[]
): number {
  if (monsters.length === 0) {
    return 0;
  }
  const relevant = monsters.filter((monster) =>
    monster.tags.some((tag) =>
      ["undead", "ghost", "cursed", "unquiet"].includes(tag)
    )
  ).length;
  return relevant / monsters.length;
}

function getAbilitySlotCount(
  level: number,
  monsterTags: readonly string[],
  authoredAbilityCount: number
): 1 | 2 | 3 {
  const tags = new Set(monsterTags);
  const twoEarly =
    tags.has("boss") || tags.has("mini-boss") || tags.has("tiny-boss");
  const threeAtSeven =
    tags.has("boss") || tags.has("mini-boss") || tags.has("elite");
  if (level <= 3) {
    return twoEarly && authoredAbilityCount >= 2 ? 2 : 1;
  }
  if (level <= 6) {
    return 2;
  }
  if (level <= 9) {
    return threeAtSeven ? 3 : 2;
  }
  return 3;
}

function getLootSource(level: number, tags: readonly string[]): string {
  const tagSet = new Set(tags);
  if (["food", "kitchen", "pan", "cheese"].some((tag) => tagSet.has(tag))) {
    return "kitchen_dungeon";
  }
  if (
    ["bureaucracy", "paper", "queue", "tax", "audit", "deadline", "calendar"]
      .some((tag) => tagSet.has(tag))
  ) {
    return "bureaucracy_wing";
  }
  if (["forest", "garden", "druid", "frog"].some((tag) => tagSet.has(tag))) {
    return "forest_sidequest";
  }
  return level >= 10 ? "elite_mob" : "trash_mob";
}

function getSourceRarityMultiplier(
  sourceId: string,
  rarity: GroupCombatProductionV1Rarity
): number {
  const defaultWeight = defaultRarityWeights[rarity];
  const sourceWeight =
    expansionSources.find((source) => source.source_id === sourceId)
      ?.weights[rarity] ?? defaultWeight;
  return defaultWeight > 0 && sourceWeight > 0
    ? sourceWeight / defaultWeight
    : 0;
}

function getSourceTagMultiplier(
  sourceId: string,
  tags: readonly string[]
): number {
  const bonuses = expansionSources.find(
    (source) => source.source_id === sourceId
  )?.tag_bonus;
  if (!bonuses) {
    return 1;
  }
  return 1 + tags.reduce(
    (max, tag) => Math.max(max, bonuses[tag] ?? 0),
    0
  ) / 100;
}

function getEnhancementWeight(level: number, enhancement: number): number {
  const weights = level < 3
    ? ENHANCEMENT_WEIGHTS.under3
    : level < 6
      ? ENHANCEMENT_WEIGHTS.under6
      : level < 10
        ? ENHANCEMENT_WEIGHTS.under10
        : level < 14
          ? ENHANCEMENT_WEIGHTS.under14
          : level < 18
            ? ENHANCEMENT_WEIGHTS.under18
            : ENHANCEMENT_WEIGHTS.max;
  return (weights as readonly number[])[enhancement] ?? 0;
}

function getUpgradeRarity(
  base: GroupCombatProductionV1Rarity,
  enhancement: number
): GroupCombatProductionV1Rarity {
  const order: GroupCombatProductionV1Rarity[] = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary"
  ];
  const floor = enhancement >= 5
    ? "epic"
    : enhancement >= 3
      ? "rare"
      : enhancement >= 1
        ? "uncommon"
        : "common";
  return order[Math.max(order.indexOf(base), order.indexOf(floor))] ?? base;
}

function maxAffinityBonus(
  entries: ReadonlyArray<{ id: string; bonus: number }>,
  id: string
): number {
  return Math.max(
    0,
    ...entries.filter((entry) => entry.id === id).map((entry) => entry.bonus)
  );
}

function normalizeContentId(
  value: string,
  aliases: Readonly<Record<string, string>>
): string | undefined {
  const stripped = value.replace(/^(class|race)\./, "");
  return aliases[stripped];
}

function dedupeCandidates(
  candidates: readonly GroupCombatProductionV1LootCandidate[]
): GroupCombatProductionV1LootCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.itemId)) {
      return false;
    }
    seen.add(candidate.itemId);
    return true;
  }).map((candidate) => ({ ...candidate }));
}

function countMatching(tags: readonly string[], needles: readonly string[]): number {
  return needles.reduce(
    (total, needle) => total + (tags.includes(needle) ? 1 : 0),
    0
  );
}
