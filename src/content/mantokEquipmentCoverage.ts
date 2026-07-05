import { classes } from "./classes";
import { equipmentSlots, type EquipmentSlot } from "./equipmentSlots";
import {
  findLootExpansionTitleBucketName,
  lootExpansionTitleBuckets,
  normalizeLootExpansionTitleIds
} from "./lootExpansionV1";
import { activeRaces } from "./races";
import type { ItemContent, ItemEffectContent, ItemTagContent } from "./schema";

type CoverageReason = "min-level" | "class" | "race" | "title" | "unknown-item";
type CoverageKind = "universal" | "class" | "race" | "path";

interface CoverageProfile {
  level: number;
  classId?: string;
  raceId?: string;
  title?: string;
  titleIds?: readonly string[];
}

interface CoverageCheck {
  canEquip: boolean;
  reasons: CoverageReason[];
}

interface CoverageDefinition {
  id: string;
  name: string;
  slot: EquipmentSlot;
  kind: CoverageKind;
  effect: ItemEffectContent;
  tags?: ItemTagContent[];
  classId?: string;
  raceId?: string;
  titleBucketId?: string;
}

export const MANTOK_EQUIPMENT_COVERAGE_TITLE_BUCKETS = lootExpansionTitleBuckets.map(
  (bucket) => bucket.id
);

const UNIVERSAL_DEFINITIONS: CoverageDefinition[] = [
  universal("pan-of-calm-proof", "Пательня спокійного доказу", "weapon", { weaponDamage: 1 }),
  universal("broom-of-short-verdict", "Мітла короткого вироку", "weapon", { weaponDamage: 1, dexterity: 1 }),
  universal("ladle-of-table-law", "Ополоник столового права", "weapon", { weaponDamage: 2 }),
  universal("fork-of-polite-pressure", "Виделка чемного тиску", "weapon", { weaponDamage: 1, luck: 1 }, ["offhand"]),
  universal("receipt-spear", "Спис касового чека", "weapon", { weaponDamage: 2, strength: 1 }, ["twohand"]),
  universal("notice-board-shield", "Щит дошки оголошень", "offhand", { armor: 1 }, ["offhand"]),
  universal("tray-of-second-opinion", "Таця другої думки", "offhand", { armor: 1, charisma: 1 }, ["offhand"]),
  universal("buckler-of-small-no", "Баклер малого «ні»", "offhand", { armor: 1, luck: 1 }, ["offhand"]),
  universal("lid-of-respectful-pause", "Кришка шанобливої павзи", "offhand", { armor: 1 }, ["offhand"]),
  universal("parry-spoon", "Ложка парирування", "offhand", { dexterity: 1, luck: 1 }, ["offhand"]),
  universal("queue-cap", "Картуз чергового по гачках", "head", { armor: 1, charisma: 1 }),
  universal("pot-helmet-of-sensible-noise", "Казанковий шолом тверезого дзвону", "head", { armor: 1 }),
  universal("hat-of-found-shelf", "Капелюх знайденої полиці", "head", { intelligence: 1 }),
  universal("scarf-of-forehead-duty", "Хустка лобової відповідальности", "head", { luck: 1 }),
  universal("visor-of-menu-reading", "Козирок читання меню", "head", { intelligence: 1, charisma: 1 }),
  universal("apron-of-small-audit", "Фартух малого аудиту", "chest", { armor: 1, hpMax: 2 }),
  universal("vest-of-foam-resistance", "Жилет опору піні", "chest", { armor: 1 }),
  universal("coat-of-dry-elbows", "Куртка сухих ліктів", "chest", { hpMax: 3 }),
  universal("bib-of-serious-soup", "Нагрудник серйозної юшки", "chest", { armor: 1, luck: 1 }),
  universal("shirt-of-honest-thread", "Сорочка чесної нитки", "chest", { charisma: 1, hpMax: 1 }),
  universal("knee-clerk", "Поножі колінного писаря", "legs", { armor: 1, dexterity: 1 }),
  universal("boots-of-not-yet", "Чоботи «ще не туди»", "legs", { dexterity: 1 }),
  universal("pants-of-careful-turn", "Штани обережного повороту", "legs", { armor: 1 }),
  universal("gaiters-of-shelf-dust", "Гетри поличного пилу", "legs", { dexterity: 1, luck: 1 }),
  universal("socks-of-quiet-step", "Шкарпетки тихого кроку", "legs", { dexterity: 1 }),
  universal("button-of-witnessing", "Ґудзик урочистого свідчення", "accessory", { luck: 1 }),
  universal("ring-of-reserved-chair", "Перстень зайнятого стільця", "accessory", { charisma: 1 }),
  universal("pin-of-small-protocol", "Шпилька малого протоколу", "accessory", { intelligence: 1 }),
  universal("bead-of-pocket-weather", "Намистина кишенькової погоди", "accessory", { luck: 1, manaMax: 1 }),
  universal("ribbon-of-proper-return", "Стрічка правильного повернення", "accessory", { charisma: 1, luck: 1 }),
  universal("measuring-spoon", "Мірна ложка польового обліку", "tool", { intelligence: 1, luck: 1 }),
  universal("chalk-of-straight-line", "Крейда прямої лінії", "tool", { intelligence: 1 }),
  universal("lantern-of-suspicious-corners", "Ліхтар підозрілих кутків", "tool", { luck: 1 }),
  universal("twine-of-local-index", "Мотузка місцевого індексу", "tool", { dexterity: 1, intelligence: 1 }),
  universal("whistle-of-small-order", "Свисток малого порядку", "tool", { charisma: 1 })
];

const CLASS_PLANS = [
  ["class.warrior", "weapon", "twohand-rake", "Граблі прямого протоколу", ["twohand"], { weaponDamage: 3, strength: 1 }],
  ["class.warrior", "chest", "argument-waistcoat", "Камізелька бойового аргументу", undefined, { armor: 1, strength: 1 }],
  ["class.mage", "chest", "ledger-robe", "Мантія обліку іскри", undefined, { spellPower: 1, manaMax: 2 }],
  ["class.mage", "tool", "chalk-compass", "Крейдяний компас складних слів", undefined, { intelligence: 2 }],
  ["class.bard", "weapon", "verse-rapier", "Рапіра куплетного тиску", undefined, { weaponDamage: 1, charisma: 2 }],
  ["class.bard", "legs", "gaiters-of-encore", "Гетри повторного приспіву", undefined, { dexterity: 1, charisma: 1 }],
  ["class.rogue", "weapon", "receipt-dagger", "Кинджал непомітного чека", ["offhand"], { weaponDamage: 1, dexterity: 2 }],
  ["class.rogue", "legs", "shadow-pocket-pants", "Штани тіньової кишені", undefined, { dexterity: 1, luck: 1 }],
  ["class.priest", "offhand", "blessing-lid", "Кришка благословенного заперечення", ["offhand"], { armor: 1, charisma: 1 }],
  ["class.priest", "tool", "level-of-mercy", "Рівень милосердної полиці", undefined, { charisma: 2 }],
  ["class.varenyk-mancer", "head", "dough-crown", "Ковпак слухняного тіста", undefined, { intelligence: 1, manaMax: 2 }],
  ["class.varenyk-mancer", "chest", "apron-of-filling", "Фартух відповідальної начинки", undefined, { armor: 1, intelligence: 1 }],
  ["class.bureaucramancer", "offhand", "receipt-buckler", "Баклер вхідного номера", ["offhand"], { armor: 1, intelligence: 1 }],
  ["class.bureaucramancer", "head", "stamp-visor", "Козирок печаткового нагляду", undefined, { intelligence: 1, armor: 1 }],
  ["class.ranger", "weapon", "twohand-bow", "Лук слідопита, що знайшов бар", ["twohand"], { weaponDamage: 3, dexterity: 1 }],
  ["class.ranger", "legs", "trail-gaiters", "Гетри сліду, який не втік", undefined, { dexterity: 2 }],
  ["class.kharakternyk", "weapon", "border-spear", "Спис характерницького туману", ["twohand"], { weaponDamage: 2, luck: 2 }],
  ["class.kharakternyk", "accessory", "mist-knot", "Вузол туману з відповіддю", undefined, { luck: 2 }]
] as const;

const RACE_PLANS = [
  ["race.human-ish", "head", "local-cap", "Картуз місцевого значення", undefined, { charisma: 1, luck: 1 }],
  ["race.human-ish", "legs", "errand-boots", "Чоботи звичайної пригоди", undefined, { dexterity: 1, armor: 1 }],
  ["race.dwarf", "offhand", "dwarf-stone-buckler", "Камінний баклер нижньої полиці", ["offhand"], { armor: 2 }],
  ["race.dwarf", "accessory", "depth-pin", "Шпилька глибинної впертости", undefined, { strength: 1, luck: 1 }],
  ["race.elf", "chest", "long-ear-cloak", "Плащ довговухої драматургії", undefined, { dexterity: 1, intelligence: 1 }],
  ["race.elf", "accessory", "bookmark-of-offended-leaf", "Закладка ображеного листка", undefined, { dexterity: 1, charisma: 1 }],
  ["race.bisyny", "offhand", "editorial-candle", "Свічка редакторського парирування", ["offhand"], { luck: 1, armor: 1 }],
  ["race.bisyny", "weapon", "comma-fork", "Виделка коми, що біситься", ["offhand"], { weaponDamage: 1, luck: 1 }],
  ["race.drantohor", "chest", "guest-border-coat", "Плащ гостя з Межі", undefined, { armor: 1, luck: 1 }],
  ["race.drantohor", "weapon", "map-spear", "Спис карти, яка заблукала", ["twohand"], { weaponDamage: 2, luck: 1 }],
  ["race.domovyk", "offhand", "stove-lid", "Пічна кришка домашнього порядку", ["offhand"], { armor: 1, charisma: 1 }],
  ["race.domovyk", "tool", "dust-ledger", "Журнал пилюки підпіччя", undefined, { intelligence: 1, luck: 1 }],
  ["race.dryland-rusalka", "offhand", "teapot-parry", "Чайникове парирування без моря", ["offhand"], { armor: 1, charisma: 1 }],
  ["race.dryland-rusalka", "head", "dry-wave-veil", "Вуаль сухої хвилі", undefined, { intelligence: 1, charisma: 1 }],
  ["race.intellectual-orc", "head", "diploma-helmet", "Шолом із дипломом на лобі", undefined, { strength: 1, intelligence: 1 }],
  ["race.intellectual-orc", "legs", "peer-review-greaves", "Поножі рецензованого кроку", undefined, { armor: 1, intelligence: 1 }],
  ["race.molfar-soul", "offhand", "mist-charm-parry", "Оберіг другого туману", ["offhand"], { armor: 1, luck: 1 }],
  ["race.molfar-soul", "tool", "fog-thread", "Нитка кишенькового туману", undefined, { intelligence: 1, luck: 1 }]
] as const;

const TITLE_PLANS = [
  ["common_title", "head", "local-paper-hat", "Паперовий капелюх місцевої ваги"],
  ["common_title", "tool", "ordinary-route-ruler", "Лінійка звичайного маршруту"],
  ["paperwork_title", "accessory", "seal-button", "Ґудзик печатки, що все бачила"],
  ["paperwork_title", "legs", "queue-knee-clerk", "Поножі чергового писаря"],
  ["archive_title", "offhand", "archive-folder-buckler", "Папка-баклер архівної родини"],
  ["archive_title", "chest", "index-vest", "Жилет інвентарного номера"],
  ["kitchen_title", "tool", "sour-cream-caliper", "Штангенциркуль сметанної точности"],
  ["kitchen_title", "chest", "soup-apron", "Фартух супової стратегії"],
  ["fighter_title", "weapon", "argument-rake", "Граблі бойового аргументу"],
  ["fighter_title", "legs", "duel-knee-ledger", "Колінний журнал суперечки"],
  ["bard_title", "weapon", "refrain-sabre", "Шабля приспіву з претензією"],
  ["bard_title", "accessory", "encore-ribbon", "Стрічка повторного куплету"],
  ["rogue_title", "weapon", "vanishing-dagger", "Кинджал зникальної полиці"],
  ["rogue_title", "offhand", "shadow-buckler", "Баклер тіні під столом"],
  ["mist_title", "head", "fog-hat", "Капелюх туману з квитанцією"],
  ["mist_title", "tool", "charm-thread", "Нитка малого оберега"],
  ["tea_title", "offhand", "tide-teaspoon", "Чайна ложка сухого припливу"],
  ["tea_title", "accessory", "kettle-earring", "Сережка чайника, що парує"],
  ["bisyny_title", "accessory", "editorial-bead", "Намистина редакторського бісіння"],
  ["bisyny_title", "head", "herring-cap", "Картуз правильного оселедця"],
  ["ranger_title", "weapon", "ranger-long-bow", "Довгий лук сліду, який свідчив"],
  ["ranger_title", "tool", "trail-ruler", "Лінійка підпічного сліду"],
  ["boundary_title", "weapon", "border-pike", "Піка гостя з Межі"],
  ["boundary_title", "tool", "ostromag-map", "Мапа, що бачила Остромаг"],
  ["orc_scholar_title", "weapon", "thesis-mace", "Булава прикладної тези"],
  ["orc_scholar_title", "accessory", "footnote-ring", "Перстень етичної примітки"],
  ["elf_title", "head", "long-life-visor", "Козирок довгожиттєвої образи"],
  ["elf_title", "accessory", "leaf-bookmark", "Закладка довговухого листка"],
  ["dwarf_title", "offhand", "deep-shelf-buckler", "Баклер глибинної полиці"],
  ["dwarf_title", "accessory", "hammered-pin", "Шпилька молоткової впертости"]
] as const;

export const mantokEquipmentCoverageItems = [
  ...UNIVERSAL_DEFINITIONS,
  ...CLASS_PLANS.map(([classId, slot, slug, name, tags, effect]) =>
    restricted("class", `${stripPrefix(classId, "class")}.${slug}`, name, slot, effect, {
      classId,
      ...(tags ? { tags } : {})
    })
  ),
  ...RACE_PLANS.map(([raceId, slot, slug, name, tags, effect]) =>
    restricted("race", slug, name, slot, effect, {
      raceId,
      ...(tags ? { tags } : {})
    })
  ),
  ...TITLE_PLANS.map(([titleBucketId, slot, slug, name]) => {
    const tags: readonly ItemTagContent[] | undefined = slot === "weapon" && ["ranger-long-bow", "border-pike"].includes(slug)
        ? ["twohand"]
        : slot === "weapon" && ["vanishing-dagger"].includes(slug)
          ? ["offhand"]
          : undefined;

    return restricted("path", slug, name, slot, titleEffect(slot), {
      titleBucketId,
      ...(tags ? { tags } : {})
    });
  })
].map(toItemContent) satisfies ItemContent[];

export function getMantokEquipmentCoverageReport() {
  const slotCounts = Object.fromEntries(equipmentSlots.map((slot) => [slot, 0])) as Record<
    EquipmentSlot,
    number
  >;
  const restrictedClassCounts = Object.fromEntries(classes.map((entry) => [entry.id, 0])) as Record<
    string,
    number
  >;
  const restrictedRaceCounts = Object.fromEntries(activeRaces.map((entry) => [entry.id, 0])) as Record<
    string,
    number
  >;
  const restrictedTitleBucketCounts = Object.fromEntries(
    MANTOK_EQUIPMENT_COVERAGE_TITLE_BUCKETS.map((id) => [id, 0])
  ) as Record<string, number>;

  for (const item of mantokEquipmentCoverageItems) {
    const slot = item.equipmentSlot ?? (item.slot === "weapon" ? "weapon" : item.slot === "accessory" ? "accessory" : null);

    if (slot && equipmentSlots.includes(slot)) {
      slotCounts[slot] += 1;
    }

    for (const classId of item.equipmentRequirements?.classIds ?? []) {
      restrictedClassCounts[classId] = (restrictedClassCounts[classId] ?? 0) + 1;
    }

    for (const raceId of item.equipmentRequirements?.raceIds ?? []) {
      restrictedRaceCounts[raceId] = (restrictedRaceCounts[raceId] ?? 0) + 1;
    }

    for (const titleBucketId of item.equipmentRequirements?.titleBucketIds ?? []) {
      restrictedTitleBucketCounts[titleBucketId] = (restrictedTitleBucketCounts[titleBucketId] ?? 0) + 1;
    }
  }

  const counts = Object.values(slotCounts);

  return {
    itemCount: mantokEquipmentCoverageItems.length,
    slotCounts,
    slotSpread: Math.max(...counts) - Math.min(...counts),
    restrictedClassCounts,
    restrictedRaceCounts,
    restrictedTitleBucketCounts
  };
}

export function checkMantokEquipmentCoverageRequirement(
  itemId: string,
  profile: CoverageProfile
): CoverageCheck {
  const item = mantokEquipmentCoverageItems.find((candidate) => candidate.id === itemId);

  if (!item) {
    return {
      canEquip: false,
      reasons: ["unknown-item"]
    };
  }

  const requirement = item.equipmentRequirements;

  if (!requirement) {
    return {
      canEquip: true,
      reasons: []
    };
  }

  const reasons: CoverageReason[] = [];

  if (requirement.minLevel !== undefined && profile.level < requirement.minLevel) {
    reasons.push("min-level");
  }

  if ((requirement.classIds?.length ?? 0) > 0 && !requirement.classIds?.includes(profile.classId ?? "")) {
    reasons.push("class");
  }

  if ((requirement.raceIds?.length ?? 0) > 0 && !requirement.raceIds?.includes(profile.raceId ?? "")) {
    reasons.push("race");
  }

  const titleIds = normalizeLootExpansionTitleIds(profile);

  if (
    (requirement.titleBucketIds?.length ?? 0) > 0 &&
    !requirement.titleBucketIds?.some((titleBucketId) => titleIds.has(titleBucketId))
  ) {
    reasons.push("title");
  }

  return {
    canEquip: reasons.length === 0,
    reasons
  };
}

function universal(
  slug: string,
  name: string,
  slot: EquipmentSlot,
  effect: ItemEffectContent,
  tags?: ItemTagContent[]
): CoverageDefinition {
  return {
    id: `universal.${slug}`,
    name,
    slot,
    kind: "universal",
    effect,
    ...(tags ? { tags } : {})
  };
}

function restricted(
  kind: Exclude<CoverageKind, "universal">,
  slug: string,
  name: string,
  slot: EquipmentSlot,
  effect: ItemEffectContent,
  options: {
    tags?: readonly ItemTagContent[];
    classId?: string;
    raceId?: string;
    titleBucketId?: string;
  }
): CoverageDefinition {
  return {
    id: `${kind}.${slug}`,
    name,
    slot,
    kind,
    effect,
    ...(options.tags ? { tags: [...options.tags] } : {}),
    ...(options.classId ? { classId: options.classId } : {}),
    ...(options.raceId ? { raceId: options.raceId } : {}),
    ...(options.titleBucketId ? { titleBucketId: options.titleBucketId } : {})
  };
}

function toItemContent(definition: CoverageDefinition): ItemContent {
  const requirements = {
    ...(definition.classId ? { classIds: [definition.classId] } : {}),
    ...(definition.raceId ? { raceIds: [definition.raceId] } : {}),
    ...(definition.titleBucketId ? { titleBucketIds: [definition.titleBucketId] } : {})
  };
  const hasRequirements = Object.keys(requirements).length > 0;

  return {
    id: `item.mantok.coverage.${definition.id}`,
    name: definition.name,
    description: buildDescription(definition),
    rarity: definition.kind === "path" ? "rare" : definition.kind === "universal" ? "common" : "uncommon",
    slot: definition.slot === "weapon" ? "weapon" : definition.slot === "accessory" || definition.slot === "tool" ? "accessory" : "armor",
    equipmentSlot: definition.slot,
    ...(definition.tags ? { tags: definition.tags } : {}),
    ...(hasRequirements ? { equipmentRequirements: requirements } : {}),
    goldValue: definition.kind === "path" ? 93 : definition.kind === "universal" ? 23 : 42,
    effect: definition.effect
  };
}

function buildDescription(definition: CoverageDefinition): string {
  if (definition.kind === "class" && definition.classId) {
    return `Манатка з біркою «${lookupClassName(definition.classId)}»: дає малий видимий бонус і слухає тільки правильний клас.`;
  }

  if (definition.kind === "race" && definition.raceId) {
    return `Манатка з біркою «${lookupRaceName(definition.raceId)}»: корчмар каже, що це не фаворитизм, а точність полиць.`;
  }

  if (definition.kind === "path" && definition.titleBucketId) {
    return `Манатка для титулу «${findLootExpansionTitleBucketName(definition.titleBucketId)}»: корисна, але спершу перевіряє, чи назва пригодника звучить достатньо підозріло.`;
  }

  return "Корчмар нарешті знайшов для цієї манатки гачок, полицю і коротке пояснення, чому вона не просто дивна.";
}

function titleEffect(slot: EquipmentSlot): ItemEffectContent {
  if (slot === "weapon") {
    return { weaponDamage: 2, luck: 1 };
  }

  if (slot === "offhand" || slot === "chest" || slot === "head" || slot === "legs") {
    return { armor: 1, luck: 1 };
  }

  if (slot === "tool") {
    return { intelligence: 1, luck: 1 };
  }

  return { charisma: 1, luck: 1 };
}

function lookupClassName(classId: string): string {
  return classes.find((candidate) => candidate.id === classId)?.name ?? classId;
}

function lookupRaceName(raceId: string): string {
  return activeRaces.find((candidate) => candidate.id === raceId)?.name ?? raceId;
}

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(`${prefix}.`) ? value.slice(prefix.length + 1) : value;
}
