import { describe, expect, it } from "vitest";
import { makeFightGearActionCallbackData } from "../../src/bot/callbacks/fightCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";
import { items, monsterLoot } from "../../src/content";
import {
  mantokAbilityGrantDefinitions,
  mantokAbilityGrantItemContents,
  mantokAbilityGrantLootAdditions
} from "../../src/content/mantokAbilityGrants";

describe("Mantok ability grant registry", () => {
  it("uses stable compact collision-free keys instead of item ordering", () => {
    const keys = mantokAbilityGrantDefinitions.map((grant) => grant.key);
    const ids = mantokAbilityGrantDefinitions.map((grant) => grant.id);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(ids).size).toBe(ids.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9]{1,10}$/);
    }

    for (const grant of mantokAbilityGrantDefinitions) {
      const callbackData = makeFightGearActionCallbackData({
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        turn: 587,
        grantKey: grant.key
      });

      expect(Buffer.byteLength(callbackData, "utf8")).toBeLessThanOrEqual(TELEGRAM_CALLBACK_DATA_LIMIT);
      expect(callbackData.endsWith(`:${grant.key}`)).toBe(true);
    }
  });

  it("keeps authored grants in the level nine to thirteen epic soulbound band", () => {
    for (const grant of mantokAbilityGrantDefinitions) {
      expect(grant.minLevel).toBeGreaterThanOrEqual(9);
      expect(grant.minLevel).toBeLessThanOrEqual(13);

      const item = items.find((candidate) => candidate.id === grant.itemId);
      expect(item?.rarity).toBe("epic");
      expect(item?.tags ?? []).toContain("soulbound");
    }

    expect(mantokAbilityGrantItemContents).toHaveLength(1);
    expect(mantokAbilityGrantItemContents[0]).toMatchObject({
      id: "item.ability.last-page-rapier",
      rarity: "epic",
      tags: ["soulbound"],
      equipmentRequirements: {
        minLevel: 13
      }
    });
  });

  it("adds only explicit high-level monster loot entries", () => {
    for (const [monsterId, grants] of Object.entries(mantokAbilityGrantLootAdditions)) {
      const loot = monsterLoot[monsterId] ?? [];
      for (const grant of grants) {
        const itemId = typeof grant === "string" ? grant : grant.itemId;
        expect(loot.some((entry) =>
          typeof entry === "string" ? entry === itemId : entry.itemId === itemId
        )).toBe(true);
      }
    }
  });

  it("keeps the Yeger cloak service perk narrow", () => {
    const cloak = mantokAbilityGrantDefinitions.find((grant) => grant.key === "ycloak");

    expect(cloak).toMatchObject({
      kind: "service-perk",
      itemId: "item.set.yeger-shadow.cloak"
    });
    expect(cloak?.combat).toBeUndefined();
    expect(cloak?.description).toContain("звичайних бинтів");
    expect(cloak?.description).toContain("без щільних бинтів");
    expect(cloak?.description).toContain("аптечок");
    expect(cloak?.description).toContain("дощечок");
  });
});
