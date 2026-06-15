import { describe, expect, it } from "vitest";
import {
  checkLootExpansionEquipRequirement,
  findLootExpansionBaseItem,
  findLootExpansionVariantByItemId,
  getEnhancementWeight,
  getLootExpansionAffinityMultiplier,
  getLootExpansionItemId,
  getLootExpansionValidationReport,
  LOOT_EXPANSION_V1_BASE_ITEM_COUNT,
  LOOT_EXPANSION_V1_EFFECT_COUNT,
  lootExpansionV1Data,
  lootExpansionV1ItemContents,
  maxAllowedEnhancement
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

  it("keeps all item effect references valid", () => {
    const effectIds = new Set(lootExpansionV1Data.effects.map((effect) => effect.id));

    for (const item of lootExpansionV1Data.items) {
      expect(item.effect_ids.every((effectId) => effectIds.has(effectId))).toBe(true);
    }
  });

  it("keeps all affinity references valid", () => {
    const classIds = new Set(lootExpansionV1Data.classes.map((entry) => entry.id));
    const raceIds = new Set(lootExpansionV1Data.races.map((entry) => entry.id));
    const titleIds = new Set(lootExpansionV1Data.titles.map((entry) => entry.id));

    for (const item of lootExpansionV1Data.items) {
      expect(item.affinity.classes.every((entry) => classIds.has(entry.id))).toBe(true);
      expect(item.affinity.races.every((entry) => raceIds.has(entry.id))).toBe(true);
      expect(item.affinity.titles.every((entry) => titleIds.has(entry.id))).toBe(true);
    }
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

    expect(bureaucratStamp?.requirements.classes).toContain("bureaucrat");

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
