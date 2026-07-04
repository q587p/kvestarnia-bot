import { classes } from "./classes";
import { activeRaces } from "./races";
import type { ItemContent, ItemEffectContent } from "./schema";
import { lootExpansionV1Data as lootExpansionV1RawData } from "./lootExpansionV1Data";

type RawLootExpansionData = typeof lootExpansionV1RawData;

type RawLootExpansionMetadata = Omit<RawLootExpansionData["metadata"], "counts" | "notes_uk"> & {
  counts: {
    classes: number;
    races: number;
    titles: number;
    base_items: number;
    expanded_variants: number;
    effects: number;
  };
  notes_uk: string;
};

type RawLootExpansionRequirement = Readonly<{
  min_level: number;
  classes: readonly string[];
  races: readonly string[];
  titles: readonly string[];
}>;

type RawLootExpansionAffinityEntry = Readonly<{
  id: string;
  drop_weight_bonus_pct: number;
  equip_note_uk: string;
}>;

type RawLootExpansionBaseItem = Omit<
  RawLootExpansionData["items"][number],
  "requirements" | "affinity" | "name_uk" | "flavor_uk"
> &
  Readonly<{
    name_uk: string;
    flavor_uk: string;
    requirements: RawLootExpansionRequirement;
    affinity: {
      classes: readonly RawLootExpansionAffinityEntry[];
      races: readonly RawLootExpansionAffinityEntry[];
      titles: readonly RawLootExpansionAffinityEntry[];
    };
  }>;

type LootExpansionDictionaryEntry = Readonly<{
  id: string;
  name_uk: string;
  description_uk: string;
}>;

interface NormalizedLootExpansionData {
  metadata: RawLootExpansionMetadata;
  classes: LootExpansionDictionaryEntry[];
  races: LootExpansionDictionaryEntry[];
  titles: LootExpansionDictionaryEntry[];
  rarity_tiers: RawLootExpansionData["rarity_tiers"];
  roll_rules: RawLootExpansionData["roll_rules"];
  effects: RawLootExpansionData["effects"];
  items: RawLootExpansionBaseItem[];
}

const LIVE_CLASS_ENTRIES = classes.map((heroClass) => ({
  id: stripContentPrefix(heroClass.id),
  name_uk: heroClass.name,
  description_uk: heroClass.description
})) satisfies LootExpansionDictionaryEntry[];

const LIVE_RACE_ENTRIES = activeRaces.map((race) => ({
  id: stripContentPrefix(race.id),
  name_uk: race.name,
  description_uk: race.description
})) satisfies LootExpansionDictionaryEntry[];

const LIVE_CLASS_IDS = new Set(LIVE_CLASS_ENTRIES.map((entry) => entry.id));
const LIVE_RACE_IDS = new Set(LIVE_RACE_ENTRIES.map((entry) => entry.id));

const CANONICAL_TITLE_ENTRIES = [
  {
    id: "common_title",
    name_uk: "Пригодник місцевого значення",
    description_uk: "Загальний корчемний титул без додаткової бюрократії."
  },
  {
    id: "paperwork_title",
    name_uk: "Канцелярський титул",
    description_uk: "Усі титули, від яких форми самі шукають печатку."
  },
  {
    id: "archive_title",
    name_uk: "Архівний титул",
    description_uk: "Для тих, кого шафи й довідки визнають майже родиною."
  },
  {
    id: "kitchen_title",
    name_uk: "Начинковий титул",
    description_uk: "Вареники, сметана, чайники й інша стратегічна кухня."
  },
  {
    id: "fighter_title",
    name_uk: "Бойовий аргумент",
    description_uk: "Коли титул звучить так, ніби його можна покласти на стіл."
  },
  {
    id: "bard_title",
    name_uk: "Куплетний титул",
    description_uk: "Після нього навіть бочка питає, чи буде приспів."
  },
  {
    id: "rogue_title",
    name_uk: "Зникальницький титул",
    description_uk: "Він ніби є, але чек уже зник."
  },
  {
    id: "mist_title",
    name_uk: "Туманний титул",
    description_uk: "Для тих, хто носить оберіг, туман і ще один оберіг."
  },
  {
    id: "tea_title",
    name_uk: "Чайниковий титул",
    description_uk: "Парує, але юридично не є морем."
  },
  {
    id: "bisyny_title",
    name_uk: "Бісовий титул",
    description_uk: "Не стільки бісівський, скільки бісить локалізацію."
  },
  {
    id: "ranger_title",
    name_uk: "Слідознавчий титул",
    description_uk: "Сліди ведуть до бару, але тепер це хоча б валідний id."
  },
  {
    id: "boundary_title",
    name_uk: "Межовий титул",
    description_uk: "Прийшов з Остромагу, підписався заднім числом."
  },
  {
    id: "orc_scholar_title",
    name_uk: "Науково-ударний титул",
    description_uk: "Рецензує проблему обома руками."
  },
  {
    id: "elf_title",
    name_uk: "Довговухий титул",
    description_uk: "Драматичний, але тепер не сирітський."
  },
  {
    id: "dwarf_title",
    name_uk: "Глибинний титул",
    description_uk: "Міцний, низький і недосяжний для верхньої полиці."
  }
] satisfies LootExpansionDictionaryEntry[];

const LIVE_TITLE_IDS = new Set(CANONICAL_TITLE_ENTRIES.map((entry) => entry.id));

const CLASS_ID_ALIASES: Record<string, string> = {
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

const RACE_ID_ALIASES: Record<string, string> = {
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

const TITLE_ID_ALIASES: Record<string, string> = {
  novice_of_queue: "paperwork_title",
  queue_marshall: "paperwork_title",
  hero_without_hat: "common_title",
  lord_of_pan: "kitchen_title",
  archive_rat: "archive_title",
  soup_knight: "kitchen_title",
  not_dead_first: "fighter_title",
  guild_meme: "bard_title",
  debt_collector: "paperwork_title",
  sleepy_champion: "mist_title",
  master_of_teapot: "tea_title",
  honorary_goblin: "bisyny_title",
  carpet_slayer: "fighter_title",
  boss_arguer: "fighter_title",
  loot_whisperer: "rogue_title",
  common_title: "common_title",
  paperwork_title: "paperwork_title",
  archive_title: "archive_title",
  kitchen_title: "kitchen_title",
  fighter_title: "fighter_title",
  bard_title: "bard_title",
  rogue_title: "rogue_title",
  mist_title: "mist_title",
  tea_title: "tea_title",
  bisyny_title: "bisyny_title",
  ranger_title: "ranger_title",
  boundary_title: "boundary_title",
  orc_scholar_title: "orc_scholar_title",
  elf_title: "elf_title",
  dwarf_title: "dwarf_title"
};

const TITLE_REQUIREMENT_SURROGATES: Record<
  string,
  { classes?: readonly string[]; races?: readonly string[] }
> = {
  novice_of_queue: { classes: ["bureaucramancer"] },
  queue_marshall: { classes: ["bureaucramancer"] },
  hero_without_hat: { races: ["human-ish"] },
  lord_of_pan: { classes: ["varenyk-mancer"] },
  archive_rat: { classes: ["bureaucramancer"] },
  soup_knight: { classes: ["varenyk-mancer"] },
  not_dead_first: { classes: ["warrior"] },
  guild_meme: { classes: ["bard"] },
  debt_collector: { classes: ["bureaucramancer"] },
  sleepy_champion: { races: ["molfar-soul"] },
  master_of_teapot: { races: ["dryland-rusalka"] },
  honorary_goblin: { races: ["bisyny"] },
  carpet_slayer: { classes: ["warrior"] },
  boss_arguer: { classes: ["kharakternyk"] },
  loot_whisperer: { classes: ["rogue"] },
  paperwork_title: { classes: ["bureaucramancer"] },
  archive_title: { classes: ["bureaucramancer"] },
  kitchen_title: { classes: ["varenyk-mancer"] },
  fighter_title: { classes: ["warrior"] },
  bard_title: { classes: ["bard"] },
  rogue_title: { classes: ["rogue"] },
  mist_title: { races: ["molfar-soul"] },
  tea_title: { races: ["dryland-rusalka"] },
  bisyny_title: { races: ["bisyny"] },
  ranger_title: { classes: ["ranger"] },
  boundary_title: { races: ["drantohor"] },
  orc_scholar_title: { races: ["intellectual-orc"] },
  elf_title: { races: ["elf"] },
  dwarf_title: { races: ["dwarf"] },
  common_title: {}
};

export const lootExpansionV1Data = normalizeLootExpansionV1Data(lootExpansionV1RawData);

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

export interface LootExpansionEquipRequirementDetails {
  minLevel: number;
  classes: readonly string[];
  races: readonly string[];
  titles: readonly string[];
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
    !requirement.classes.includes(profileClass)
  ) {
    reasons.push("class");
  }

  if (requirement.races.length > 0 && !profileRace) {
    reasons.push("race");
  } else if (
    requirement.races.length > 0 &&
    profileRace &&
    !requirement.races.includes(profileRace)
  ) {
    reasons.push("race");
  }

  if (
    requirement.titles.length > 0 &&
    !requirement.titles.some((titleId) => titleIds.has(titleId))
  ) {
    reasons.push("title");
  }

  return {
    canEquip: reasons.length === 0,
    reasons
  };
}

export function getLootExpansionEquipRequirementDetails(
  itemId: string
): LootExpansionEquipRequirementDetails | null {
  const variant = findLootExpansionVariantByItemId(itemId);

  if (!variant) {
    return null;
  }

  const base = findLootExpansionBaseItem(variant.baseId);

  if (!base) {
    return null;
  }

  const requirement = base.requirements;

  return {
    minLevel: Math.max(requirement.min_level, variant.minLevel),
    classes: requirement.classes.map((id) => findLootExpansionClassName(id)),
    races: requirement.races.map((id) => findLootExpansionRaceName(id)),
    titles: requirement.titles.map((id) => findLootExpansionTitleName(id))
  };
}

export function normalizeLootExpansionClassId(classId: string | undefined): string | undefined {
  if (!classId) {
    return undefined;
  }

  return canonicalizeClassId(classId);
}

export function normalizeLootExpansionRaceId(raceId: string | undefined): string | undefined {
  if (!raceId) {
    return undefined;
  }

  return canonicalizeRaceId(raceId);
}

export function normalizeLootExpansionTitleIds(profile: LootExpansionProfile): Set<string> {
  const ids = new Set<string>();

  for (const titleId of profile.titleIds ?? []) {
    const canonical = canonicalizeTitleId(titleId);

    if (canonical) {
      ids.add(canonical);
    }
  }

  const title = profile.title?.toLocaleLowerCase("uk-UA") ?? "";

  if (!title) {
    return ids;
  }

  if (title.includes("папер") || title.includes("печат") || title.includes("канцел") || title.includes("форм")) {
    ids.add("paperwork_title");
  }

  if (title.includes("архів")) {
    ids.add("archive_title");
  }

  if (title.includes("начин") || title.includes("сметан") || title.includes("сирен") || title.includes("чайник")) {
    ids.add("kitchen_title");
  }

  if (title.includes("аргумент") || title.includes("бит") || title.includes("боє") || title.includes("кулак")) {
    ids.add("fighter_title");
  }

  if (title.includes("куплет") || title.includes("спів") || title.includes("лютн")) {
    ids.add("bard_title");
  }

  if (title.includes("зник") || title.includes("тінь") || title.includes("полиц")) {
    ids.add("rogue_title");
  }

  if (title.includes("туман") || title.includes("оберег")) {
    ids.add("mist_title");
  }

  if (title.includes("калюж") || title.includes("приплив") || title.includes("чайников")) {
    ids.add("tea_title");
  }

  if (title.includes("біс") || title.includes("редактор") || title.includes("оселед")) {
    ids.add("bisyny_title");
  }

  if (title.includes("слід") || title.includes("карт") || title.includes("підпіч")) {
    ids.add("ranger_title");
  }

  if (title.includes("меж") || title.includes("остром") || title.includes("заблук") || title.includes("гост")) {
    ids.add("boundary_title");
  }

  if (title.includes("доцент") || title.includes("кандидат") || title.includes("етичн")) {
    ids.add("orc_scholar_title");
  }

  if (title.includes("довговух") || title.includes("довгож")) {
    ids.add("elf_title");
  }

  if (title.includes("глибин") || title.includes("молот")) {
    ids.add("dwarf_title");
  }

  if (title.includes("пригод") || title.includes("місцев")) {
    ids.add("common_title");
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

function normalizeLootExpansionV1Data(raw: RawLootExpansionData): NormalizedLootExpansionData {
  return {
    ...raw,
    metadata: {
      ...raw.metadata,
      counts: {
        ...raw.metadata.counts,
        classes: LIVE_CLASS_ENTRIES.length,
        races: LIVE_RACE_ENTRIES.length,
        titles: CANONICAL_TITLE_ENTRIES.length
      },
      notes_uk:
        `${raw.metadata.notes_uk} Нормалізовано під поточні раси/класи/титули Квестарні, щоб манатки не вимагали сирітських id.`
    },
    classes: LIVE_CLASS_ENTRIES,
    races: LIVE_RACE_ENTRIES,
    titles: CANONICAL_TITLE_ENTRIES,
    items: raw.items.map(normalizeBaseItem)
  };
}

function normalizeBaseItem(base: RawLootExpansionBaseItem): RawLootExpansionBaseItem {
  return {
    ...base,
    name_uk: normalizeBaseItemName(base),
    flavor_uk: normalizeBaseItemFlavor(base),
    requirements: normalizeRequirements(base.requirements),
    affinity: {
      ...base.affinity,
      classes: normalizeAffinityEntries(base.affinity.classes, canonicalizeClassId),
      races: normalizeAffinityEntries(base.affinity.races, canonicalizeRaceId),
      titles: normalizeAffinityEntries(base.affinity.titles, canonicalizeTitleId)
    }
  };
}

function normalizeBaseItemName(base: RawLootExpansionBaseItem): string {
  if (base.id === "a013") {
    return base.name_uk.replace(/^Носки/u, "Шкарпетки");
  }

  return base.name_uk;
}

function normalizeBaseItemFlavor(base: RawLootExpansionBaseItem): string {
  if (isLootExpansionLegGear(base)) {
    return base.flavor_uk.replace(
      "Захищає не тільки тіло, а й право виглядати підозріло.",
      "Береже ноги й право виглядати підозріло."
    );
  }

  return base.flavor_uk;
}

function normalizeRequirements(requirement: RawLootExpansionRequirement): RawLootExpansionRequirement {
  const classIds = [...requirement.classes.flatMap((id) => maybeOne(canonicalizeClassId(id)))];
  const raceIds = [...requirement.races.flatMap((id) => maybeOne(canonicalizeRaceId(id)))];

  for (const titleId of requirement.titles) {
    const surrogate = TITLE_REQUIREMENT_SURROGATES[stripContentPrefix(titleId)];

    if (!surrogate) {
      continue;
    }

    classIds.push(...(surrogate.classes ?? []).flatMap((id) => maybeOne(canonicalizeClassId(id))));
    raceIds.push(...(surrogate.races ?? []).flatMap((id) => maybeOne(canonicalizeRaceId(id))));
  }

  return {
    ...requirement,
    classes: uniqueKnownIds(classIds, LIVE_CLASS_IDS),
    races: uniqueKnownIds(raceIds, LIVE_RACE_IDS),
    titles: []
  };
}

function normalizeAffinityEntries(
  entries: readonly RawLootExpansionAffinityEntry[],
  canonicalize: (id: string) => string | undefined
): RawLootExpansionAffinityEntry[] {
  const byId = new Map<string, RawLootExpansionAffinityEntry>();

  for (const entry of entries) {
    const id = canonicalize(entry.id);

    if (!id) {
      continue;
    }

    const previous = byId.get(id);

    if (!previous || entry.drop_weight_bonus_pct > previous.drop_weight_bonus_pct) {
      byId.set(id, {
        ...entry,
        id
      });
    }
  }

  return [...byId.values()];
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
  const equipmentSlot = mapLootExpansionEquipmentSlot(base);
  const effect = mapLootExpansionEffect(base, enhancement, slot);

  return {
    id: getLootExpansionItemId(base.id, enhancement),
    name: enhancement === 0 ? base.name_uk : `${base.name_uk} +${enhancement}`,
    description: buildDescription(base, enhancement, minLevel),
    rarity: mapLootExpansionRarity(base.rarity),
    slot,
    ...(equipmentSlot ? { equipmentSlot } : {}),
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

function mapLootExpansionEquipmentSlot(base: LootExpansionBaseItem): ItemContent["equipmentSlot"] | null {
  if (base.category === "weapon") {
    return "weapon";
  }

  if (base.category === "armor") {
    if (isLootExpansionLegGear(base)) {
      return "legs";
    }

    return "chest";
  }

  if (base.category === "accessory") {
    return "accessory";
  }

  if (base.category === "tool") {
    return "tool";
  }

  return null;
}

function isLootExpansionLegGear(base: Pick<LootExpansionBaseItem, "category" | "slot">): boolean {
  return base.category === "armor" && (base.slot === "feet" || base.slot === "legs");
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
    effect.weaponDamage = clampInt(
      Math.max(1, Math.ceil(base.stats.damage / 2)) + enhancement,
      1,
      10
    );
  }

  if (slot === "armor" && base.stats.armor > 0) {
    effect.armor = clampInt(
      Math.max(1, Math.ceil(base.stats.armor / 2)) + Math.ceil(enhancement / 2),
      1,
      10
    );
  }

  if (base.stats.hp > 0) {
    effect.hpMax = clampInt(Math.max(1, Math.ceil(base.stats.hp / 2) + enhancement), 1, 20);
  }

  if (base.stats.mana > 0) {
    effect.manaMax = clampInt(Math.max(1, Math.ceil(base.stats.mana / 2) + enhancement), 1, 20);
  }

  if (base.stats.luck > 0) {
    effect.luck = clampInt(Math.max(1, base.stats.luck + enhancement), 1, 10);
  }

  if (base.stats.speed > 0 || base.stats.dodge_pct > 0) {
    effect.dexterity = clampInt(
      (effect.dexterity ?? 0) +
        Math.max(1, base.stats.speed + Math.ceil(base.stats.dodge_pct / 2) + enhancement),
      1,
      10
    );
  }

  if (base.stats.social > 0) {
    effect.charisma = clampInt(
      (effect.charisma ?? 0) +
        Math.max(1, base.stats.social + enhancement),
      1,
      10
    );
  }

  if (base.stats.crit_pct > 0) {
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
  const bonus = 1 + enhancement;

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

function maybeOne(value: string | undefined): string[] {
  return value ? [value] : [];
}

function canonicalizeClassId(id: string): string | undefined {
  const key = stripContentPrefix(id);
  const mapped = CLASS_ID_ALIASES[key] ?? key;

  return LIVE_CLASS_IDS.has(mapped) ? mapped : undefined;
}

function canonicalizeRaceId(id: string): string | undefined {
  const key = stripContentPrefix(id);
  const mapped = RACE_ID_ALIASES[key] ?? key;

  return LIVE_RACE_IDS.has(mapped) ? mapped : undefined;
}

function canonicalizeTitleId(id: string): string | undefined {
  const key = stripContentPrefix(id);
  const mapped = TITLE_ID_ALIASES[key] ?? key;

  return LIVE_TITLE_IDS.has(mapped) ? mapped : undefined;
}

function uniqueKnownIds(ids: readonly string[], knownIds: ReadonlySet<string>): string[] {
  return [...new Set(ids)].filter((id) => knownIds.has(id));
}

function findLootExpansionClassName(id: string): string {
  return lootExpansionV1Data.classes.find((entry) => entry.id === id)?.name_uk ?? id;
}

function findLootExpansionRaceName(id: string): string {
  return lootExpansionV1Data.races.find((entry) => entry.id === id)?.name_uk ?? id;
}

function findLootExpansionTitleName(id: string): string {
  return lootExpansionV1Data.titles.find((entry) => entry.id === id)?.name_uk ?? id;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
