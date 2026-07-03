import { describe, expect, it } from "vitest";
import { classes } from "../../src/content/classes";
import { activeRaces } from "../../src/content/races";
import {
  checkLootExpansionEquipRequirement,
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
});
