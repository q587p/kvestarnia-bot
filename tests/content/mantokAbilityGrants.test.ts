import { describe, expect, it } from "vitest";
import { makeFightGearActionCallbackData } from "../../src/bot/callbacks/fightCallbackData";
import { TELEGRAM_CALLBACK_DATA_LIMIT } from "../../src/bot/callbacks/onboardingCallbackData";
import { items, monsterLoot } from "../../src/content";
import {
  findMantokAbilityGrantByKey,
  mantokAbilityGrantDefinitions,
  mantokAbilityGrantItemContents,
  mantokAbilityGrantLootAdditions,
  type MantokAbilityGrantDefinition
} from "../../src/content/mantokAbilityGrants";
import { getCombatClassAbilityProfile } from "../../src/domain/combat";

type CombatMantokAbilityGrantDefinition = MantokAbilityGrantDefinition & {
  combat: NonNullable<MantokAbilityGrantDefinition["combat"]>;
};

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

  it("keeps borrowed gear actions weaker than the native actions they echo", () => {
    const borrowedPairs = [
      { key: "harpcp", nativeClassId: "class.bard" },
      { key: "ascstf", nativeClassId: "class.priest" }
    ] as const;

    for (const pair of borrowedPairs) {
      const grant = findMantokAbilityGrantByKey(pair.key);
      const native = getCombatClassAbilityProfile(pair.nativeClassId);

      expect(grant?.combat?.kind).toBe("borrowed-player-ability");
      expect(grant?.combat?.profile.source).toBe("equipment");
      expect(grant?.combat?.profile.action).toBe("gear");
      expect(grant?.combat?.profile.tags ?? []).toContain("borrowed");
      expect(native).toBeDefined();
      if (!grant?.combat || !native) {
        throw new Error(`Expected borrowed gear and native profile for ${pair.key}.`);
      }

      expect(grant.combat.profile.manaCost).toBeGreaterThan(native.manaCost);
      expect(grant.combat.profile.cooldownOwnActions).toBeGreaterThan(native.cooldownOwnActions);
      expect(grant.combat.profile.multiplier).toBeLessThanOrEqual(native.multiplier);
      if (native.healAmount !== undefined) {
        expect(grant.combat.profile.healAmount ?? 0).toBeLessThan(native.healAmount);
      }
    }
  });

  it("keeps bleed grants small and gear-action scoped", () => {
    const grants: readonly MantokAbilityGrantDefinition[] = mantokAbilityGrantDefinitions;
    const bleedGrants = grants.filter(hasCombatBleedGrant);

    expect(bleedGrants.length).toBeGreaterThan(0);
    for (const grant of bleedGrants) {
      expect(grant.kind).toBe("combat-action");
      expect(grant.combat.profile.action).toBe("gear");
      expect(grant.combat.profile.source).toBe("equipment");
      expect(grant.combat.bleed.damagePerActivation).toBeLessThanOrEqual(1);
      expect(grant.combat.bleed.remainingHeroActivations).toBeLessThanOrEqual(3);
    }
  });
});

function hasCombatBleedGrant(
  grant: MantokAbilityGrantDefinition
): grant is CombatMantokAbilityGrantDefinition & {
  combat: CombatMantokAbilityGrantDefinition["combat"] & {
    bleed: NonNullable<CombatMantokAbilityGrantDefinition["combat"]["bleed"]>;
  };
} {
  return Boolean(grant.combat?.bleed);
}
