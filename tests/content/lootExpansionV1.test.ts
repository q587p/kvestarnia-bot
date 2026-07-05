import { describe, expect, it } from "vitest";
import { classes } from "../../src/content/classes";
import { activeRaces } from "../../src/content/races";
import {
  checkLootExpansionEquipRequirement,
  buildLootExpansionVariant,
  findLootExpansionBaseItem,
  findLootExpansionVariantByItemId,
  getEnhancementWeight,
  getLootExpansionEquipRequirementDetails,
  getLootExpansionAffinityMultiplier,
  getLootExpansionItemId,
  getLootExpansionValidationReport,
  LOOT_EXPANSION_V1_BASE_ITEM_COUNT,
  LOOT_EXPANSION_V1_EFFECT_COUNT,
  lootExpansionV1Data,
  lootExpansionV1ItemContents,
  maxAllowedEnhancement,
  normalizeLootExpansionClassId,
  normalizeLootExpansionRaceId,
  normalizeLootExpansionTitleIds
} from "../../src/content/lootExpansionV1";
import { itemSchema } from "../../src/content/schema";

const generatedLegGearBaseIds = ["a013", "a014", "a015", "a018"] as const;
const generatedHeadGearBaseIds = ["a001", "a002", "a003", "a004", "a019", "a020", "a023", "a025"] as const;

describe("loot expansion v1 content adapter", () => {
  it("imports the expected base families, generated variants, and effects", () => {
    expect(LOOT_EXPANSION_V1_BASE_ITEM_COUNT).toBe(120);
    expect(LOOT_EXPANSION_V1_EFFECT_COUNT).toBe(53);
    expect(lootExpansionV1ItemContents).toHaveLength(500);
  });

  it("generates ItemContent-compatible rows with stable kvestarnia ids", () => {
    for (const item of lootExpansionV1ItemContents) {
      expect(() => itemSchema.parse(item)).not.toThrow();
      expect(item.id).toMatch(/^item\.loot-v1-[a-z]\d{3}/);
    }
  });

  it("turns generated utility gear into tool-slot accessories with effects", () => {
    const utilityVariants = lootExpansionV1ItemContents.filter((item) =>
      item.id.startsWith("item.loot-v1-t")
    );
    const accessoryUtilityVariants = utilityVariants.filter((item) =>
      item.slot === "accessory" && item.equipmentSlot === "tool"
    );

    expect(accessoryUtilityVariants.length).toBe(utilityVariants.length);

    for (const item of accessoryUtilityVariants) {
      expect(item.effect, `missing utility effect for ${item.id}`).toBeDefined();
    }
  });

  it("declares canonical equipment slots for every generated equippable variant", () => {
    const equippableItems = lootExpansionV1ItemContents.filter((item) =>
      ["weapon", "armor", "accessory"].includes(item.slot)
    );

    for (const item of equippableItems) {
      expect(item.equipmentSlot, `missing generated equipment slot for ${item.id}`).toBeDefined();

      if (item.id.startsWith("item.loot-v1-t")) {
        expect(item).toMatchObject({ slot: "accessory", equipmentSlot: "tool" });
      } else if (isGeneratedHeadGear(item.id)) {
        expect(item.equipmentSlot).toBe("head");
      } else if (isGeneratedLegGear(item.id)) {
        expect(item.equipmentSlot).toBe("legs");
      } else if (item.id.startsWith("item.loot-v1-a")) {
        expect(item.equipmentSlot).toBe("chest");
      } else if (item.id.startsWith("item.loot-v1-w")) {
        expect(item.equipmentSlot).toBe("weapon");
      } else {
        expect(item.equipmentSlot).toBe("accessory");
      }
    }
  });

  it("tags generated logical offhand and twohand weapons without changing ids", () => {
    expect(findLootExpansionVariantByItemId("item.loot-v1-w003")).toMatchObject({
      item: {
        tags: ["offhand"]
      }
    });
    expect(findLootExpansionVariantByItemId("item.loot-v1-w006")).toMatchObject({
      item: {
        tags: ["twohand"]
      }
    });
    expect(findLootExpansionVariantByItemId("item.loot-v1-w022-plus-2")).toMatchObject({
      item: {
        id: "item.loot-v1-w022-plus-2",
        tags: ["twohand"]
      }
    });
  });

  it("routes generated head gear to the head slot", () => {
    for (const baseId of generatedHeadGearBaseIds) {
      expect(findLootExpansionVariantByItemId(getLootExpansionItemId(baseId, 0))).toMatchObject({
        item: {
          slot: "armor",
          equipmentSlot: "head"
        }
      });
    }
  });

  it("routes generated foot and leg gear to the legs slot with leg-facing copy", () => {
    for (const baseId of generatedLegGearBaseIds) {
      const variant = findLootExpansionVariantByItemId(getLootExpansionItemId(baseId, 0));

      expect(variant, baseId).toMatchObject({
        item: {
          slot: "armor",
          equipmentSlot: "legs"
        }
      });
      expect(variant?.item.description, baseId).toContain("Береже ноги");
      expect(variant?.item.description, baseId).not.toContain("Захищає не тільки тіло");
    }

    expect(findLootExpansionVariantByItemId("item.loot-v1-a013")).toMatchObject({
      item: {
        name: "Шкарпетки Невразливого Комфорту"
      }
    });
  });

  it("keeps every equippable generated loot variant effect-bearing", () => {
    const equippableItems = lootExpansionV1ItemContents.filter((item) =>
      ["weapon", "armor", "accessory"].includes(item.slot)
    );

    for (const item of equippableItems) {
      expect(item.effect, `missing generated effect for ${item.id}`).toBeDefined();
    }
  });

  it("keeps enhancement gates locked by player level", () => {
    expect(maxAllowedEnhancement(1, 5)).toBe(0);
    expect(maxAllowedEnhancement(2, 5)).toBe(0);
    expect(maxAllowedEnhancement(3, 5)).toBe(1);
    expect(maxAllowedEnhancement(6, 5)).toBe(2);
    expect(maxAllowedEnhancement(9, 5)).toBe(2);
    expect(maxAllowedEnhancement(10, 5)).toBe(3);
    expect(maxAllowedEnhancement(14, 5)).toBe(4);
    expect(maxAllowedEnhancement(18, 5)).toBe(5);

    expect(getEnhancementWeight(2, 1)).toBe(0);
    expect(getEnhancementWeight(9, 3)).toBe(0);
    expect(getEnhancementWeight(17, 5)).toBe(0);
    expect(getEnhancementWeight(18, 5)).toBeGreaterThan(0);
  });

  it("resolves all effect and affinity ids against the package dictionaries", () => {
    expect(getLootExpansionValidationReport()).toEqual({
      effectIdsResolve: true,
      affinityIdsResolve: true,
      variantCount: 500
    });
  });

  it("normalizes package dictionaries to currently playable Kvestarnia ids", () => {
    const liveClassIds = new Set(classes.map((entry) => entry.id.replace(/^class\./, "")));
    const liveRaceIds = new Set(activeRaces.map((entry) => entry.id.replace(/^race\./, "")));
    const packageClassIds = new Set(lootExpansionV1Data.classes.map((entry) => entry.id));
    const packageRaceIds = new Set(lootExpansionV1Data.races.map((entry) => entry.id));

    expect(packageClassIds).toEqual(liveClassIds);
    expect(packageRaceIds).toEqual(liveRaceIds);
    expect(packageClassIds.has("bureaucrat")).toBe(false);
    expect(packageClassIds.has("cleric")).toBe(false);
    expect(packageClassIds.has("merchant")).toBe(false);
    expect(packageRaceIds.has("goblin")).toBe(false);
    expect(packageRaceIds.has("dragonkin")).toBe(false);
    expect(packageRaceIds.has("catfolk")).toBe(false);
  });

  it("keeps all item effect references valid", () => {
    const effectIds = new Set(lootExpansionV1Data.effects.map((effect) => effect.id));

    for (const item of lootExpansionV1Data.items) {
      expect(item.effect_ids.every((effectId) => effectIds.has(effectId))).toBe(true);
    }
  });

  it("keeps all affinity references valid and current", () => {
    const classIds = new Set(lootExpansionV1Data.classes.map((entry) => entry.id));
    const raceIds = new Set(lootExpansionV1Data.races.map((entry) => entry.id));
    const titleIds = new Set(lootExpansionV1Data.titles.map((entry) => entry.id));

    for (const item of lootExpansionV1Data.items) {
      expect(item.affinity.classes.every((entry) => classIds.has(entry.id))).toBe(true);
      expect(item.affinity.races.every((entry) => raceIds.has(entry.id))).toBe(true);
      expect(item.affinity.titles.every((entry) => titleIds.has(entry.id))).toBe(true);
    }
  });

  it("removes orphan title requirements by replacing them with current class/race surrogates", () => {
    const classIds = new Set(lootExpansionV1Data.classes.map((entry) => entry.id));
    const raceIds = new Set(lootExpansionV1Data.races.map((entry) => entry.id));

    for (const item of lootExpansionV1Data.items) {
      expect(item.requirements.titles).toEqual([]);
      expect(item.requirements.classes.every((classId) => classIds.has(classId))).toBe(true);
      expect(item.requirements.races.every((raceId) => raceIds.has(raceId))).toBe(true);
    }
  });

  it("keeps legacy aliases accepted but returns current ids", () => {
    expect(normalizeLootExpansionClassId("bureaucrat")).toBe("bureaucramancer");
    expect(normalizeLootExpansionClassId("cleric")).toBe("priest");
    expect(normalizeLootExpansionClassId("cook")).toBe("varenyk-mancer");
    expect(normalizeLootExpansionClassId("class.bureaucramancer")).toBe("bureaucramancer");

    expect(normalizeLootExpansionRaceId("human")).toBe("human-ish");
    expect(normalizeLootExpansionRaceId("orc")).toBe("intellectual-orc");
    expect(normalizeLootExpansionRaceId("goblin")).toBe("bisyny");
    expect(normalizeLootExpansionRaceId("dragonkin")).toBe("drantohor");
    expect(normalizeLootExpansionRaceId("race.drantohor")).toBe("drantohor");
  });

  it("maps missing legacy title ids to current synthetic combo-title buckets", () => {
    expect(normalizeLootExpansionTitleIds({ level: 1, titleIds: ["debt_collector"] })).toContain(
      "paperwork_title"
    );
    expect(normalizeLootExpansionTitleIds({ level: 1, titleIds: ["lord_of_pan"] })).toContain(
      "kitchen_title"
    );
    expect(
      normalizeLootExpansionTitleIds({ level: 1, title: "Слідознавець Чужої Карти" })
    ).toContain("ranger_title");
  });

  it("lets soft affinities increase weight without becoming hard bans", () => {
    const pan = findLootExpansionBaseItem("w001");

    expect(pan).toBeDefined();

    if (!pan) {
      return;
    }

    const generic = getLootExpansionAffinityMultiplier(pan, {
      level: 18,
      classId: "class.mage",
      raceId: "race.elf"
    });
    const kitchen = getLootExpansionAffinityMultiplier(pan, {
      level: 18,
      classId: "class.varenyk-mancer",
      raceId: "race.human-ish",
      titleIds: ["lord_of_pan"]
    });

    expect(generic).toBe(1);
    expect(kitchen).toBeGreaterThan(generic);
  });

  it("marks hard requirements as canEquip=false when profile does not match", () => {
    const bureaucratStamp = findLootExpansionBaseItem("w027");

    expect(bureaucratStamp?.requirements.classes).toContain("bureaucramancer");
    expect(bureaucratStamp?.requirements.classes).not.toContain("bureaucrat");

    const itemId = getLootExpansionItemId("w027", 0);

    expect(
      checkLootExpansionEquipRequirement(itemId, {
        level: 8,
        classId: "class.warrior",
        raceId: "race.human-ish"
      })
    ).toMatchObject({
      canEquip: false,
      reasons: ["class"]
    });

    expect(
      checkLootExpansionEquipRequirement(itemId, {
        level: 8,
        classId: "class.bureaucramancer",
        raceId: "race.human-ish"
      })
    ).toMatchObject({
      canEquip: true,
      reasons: []
    });
  });

  it("maps Borgomant title gates to the current bureaucramancer class", () => {
    const itemId = getLootExpansionItemId("x022", 2);

    expect(getLootExpansionEquipRequirementDetails(itemId)).toMatchObject({
      minLevel: 6,
      classes: ["Бюрокромант"],
      titles: []
    });

    expect(
      checkLootExpansionEquipRequirement(itemId, {
        level: 8,
        classId: "class.warrior",
        raceId: "race.human-ish"
      })
    ).toMatchObject({
      canEquip: false,
      reasons: ["class"]
    });

    expect(
      checkLootExpansionEquipRequirement(itemId, {
        level: 8,
        classId: "class.bureaucramancer",
        raceId: "race.human-ish"
      })
    ).toMatchObject({
      canEquip: true,
      reasons: []
    });
  });

  it("materializes plus variants with level gates and display names", () => {
    const panPlusFive = findLootExpansionVariantByItemId("item.loot-v1-w001-plus-5");

    expect(panPlusFive).toMatchObject({
      baseId: "w001",
      enhancement: 5,
      minLevel: 18,
      item: {
        name: "Пательня Перемовин +5"
      }
    });
  });

  it("scales generated equipment effects with enhancement inside each practical family", () => {
    const effectKeys = [
      "hpMax",
      "manaMax",
      "strength",
      "dexterity",
      "intelligence",
      "charisma",
      "luck",
      "armor",
      "resist",
      "weaponDamage",
      "spellPower"
    ] as const;

    for (const base of lootExpansionV1Data.items.filter((item) =>
      ["weapon", "armor", "accessory", "tool"].includes(item.category)
    )) {
      for (let enhancement = 1; enhancement <= base.max_enhancement; enhancement += 1) {
        const previous = buildLootExpansionVariant(
          base,
          (enhancement - 1) as 0 | 1 | 2 | 3 | 4 | 5
        ).item;
        const current = buildLootExpansionVariant(
          base,
          enhancement as 0 | 1 | 2 | 3 | 4 | 5
        ).item;

        expect(current.goldValue ?? 0, current.id).toBeGreaterThan(previous.goldValue ?? 0);
        expect(
          effectKeys.every((key) => (current.effect?.[key] ?? 0) >= (previous.effect?.[key] ?? 0)),
          current.id
        ).toBe(true);
        expect(
          effectKeys.some((key) => (current.effect?.[key] ?? 0) > (previous.effect?.[key] ?? 0)),
          current.id
        ).toBe(true);
      }
    }

    expect(findLootExpansionVariantByItemId("item.loot-v1-w001")).toMatchObject({
      item: { effect: { weaponDamage: 2 } }
    });
    expect(findLootExpansionVariantByItemId("item.loot-v1-w001-plus-1")).toMatchObject({
      item: { effect: { weaponDamage: 3 } }
    });
    expect(findLootExpansionVariantByItemId("item.loot-v1-a001-plus-1")).toMatchObject({
      item: { effect: { armor: 2, hpMax: 3 } }
    });
    expect(findLootExpansionVariantByItemId("item.loot-v1-x007")).toMatchObject({
      item: { effect: { dexterity: 2 } }
    });
    expect(findLootExpansionVariantByItemId("item.loot-v1-t002-plus-1")).toMatchObject({
      item: { effect: { armor: 1, manaMax: 2 } }
    });
  });
});

function isGeneratedLegGear(itemId: string): boolean {
  return generatedLegGearBaseIds.some((baseId) =>
    itemId === `item.loot-v1-${baseId}` || itemId.startsWith(`item.loot-v1-${baseId}-plus-`)
  );
}

function isGeneratedHeadGear(itemId: string): boolean {
  return generatedHeadGearBaseIds.some((baseId) =>
    itemId === `item.loot-v1-${baseId}` || itemId.startsWith(`item.loot-v1-${baseId}-plus-`)
  );
}
