import { describe, expect, it } from "vitest";
import { classes } from "../../src/content/classes";
import {
  classAbilities,
  fallbackClassAbility,
  findClassAbility,
  findRaceAbility,
  type PlayerAbilityDefinition,
  raceAbilities
} from "../../src/content/playerAbilities";
import { activeRaces, races } from "../../src/content/races";

const supportedRecipes = new Set([
  "direct-damage",
  "all-enemies-damage",
  "primary-plus-splash",
  "self-heal",
  "ally-heal",
  "ally-guard",
  "response-mitigation",
  "counter"
]);

describe("player ability catalog", () => {
  it("assigns one class ability to every playable class", () => {
    expect(classAbilities.map((ability) => ability.classId).sort()).toEqual(
      classes.map((characterClass) => characterClass.id).sort()
    );

    for (const characterClass of classes) {
      const ability = findClassAbility(characterClass.id);

      expect(ability).toMatchObject({
        source: "class",
        action: "skill",
        classId: characterClass.id
      });
      expect(ability.id).not.toBe(fallbackClassAbility.id);
    }
  });

  it("assigns one race ability to every active race and none to the class-only Kharakternyk identity", () => {
    const oldRaceId = "class.kharakternyk".replace("class.", "race.");

    expect(raceAbilities.map((ability) => ability.raceId).sort()).toEqual(
      activeRaces.map((race) => race.id).sort()
    );

    for (const race of activeRaces) {
      expect(findRaceAbility(race.id)).toMatchObject({
        source: "race",
        action: "race",
        raceId: race.id
      });
    }

    expect(races.some((race) => race.id === oldRaceId)).toBe(false);
    expect(findRaceAbility(oldRaceId)).toBeNull();
  });

  it("keeps player ability ids unique across class, fallback and race abilities", () => {
    const ids = [...classAbilities, fallbackClassAbility, ...raceAbilities].map((ability) => ability.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps 0.2.11 class combat tuning bounded", () => {
    expect(findClassAbility("class.warrior")).toMatchObject({
      id: "skill.forceful-strike",
      baseDamage: 3,
      multiplier: 1.1
    });
    expect(findClassAbility("class.bureaucramancer")).toMatchObject({
      id: "skill.form-thirteen-b",
      cooldownOwnActions: 2,
      baseDamage: 3,
      multiplier: 0.75
    });
    expect(findClassAbility("class.rogue")).toMatchObject({
      id: "skill.shadow-cut",
      baseDamage: 3,
      multiplier: 0.95,
      critBonus: 0.04
    });
    expect(findClassAbility("class.ranger")).toMatchObject({
      id: "skill.trick-shot",
      baseDamage: 3,
      multiplier: 0.82,
      secondaryMultiplier: 0.3,
      critBonus: 0.04
    });

    const priest = findClassAbility("class.priest");

    expect(priest).toMatchObject({
      id: "skill.strict-blessing",
      baseDamage: 2,
      multiplier: 0.55
    });
    expect(priest.recipe).toContain("direct-damage");
  });

  it("keeps group-ready semantics explicit and bounded", () => {
    const activeRaceIds = new Set(activeRaces.map((race) => race.id));
    const classIds = new Set(classes.map((characterClass) => characterClass.id));

    expect(raceAbilities.filter((ability) => ability.primaryTargetScope === "all-enemies").length).toBeGreaterThanOrEqual(2);
    expect(raceAbilities.filter((ability) => ability.tags.includes("ally-scope")).length).toBeGreaterThanOrEqual(2);
    expect(classAbilities.filter((ability) => ability.primaryTargetScope === "all-enemies").length).toBeGreaterThanOrEqual(3);
    expect(classAbilities.filter((ability) => ability.tags.includes("ally-scope")).length).toBeGreaterThanOrEqual(2);

    const abilities: readonly PlayerAbilityDefinition[] = [
      ...classAbilities,
      fallbackClassAbility,
      ...raceAbilities
    ];

    for (const ability of abilities) {
      expect(ability.id).toMatch(/^(skill|ability)\.[a-z0-9.-]+$/u);
      expect(ability.label.trim()).toBe(ability.label);
      expect(ability.manaCost).toBeGreaterThanOrEqual(0);
      expect(ability.manaCost).toBeLessThanOrEqual(5);
      expect(ability.cooldownOwnActions).toBeGreaterThanOrEqual(1);
      expect(ability.cooldownOwnActions).toBeLessThanOrEqual(4);
      expect(ability.recipe.every((recipe) => supportedRecipes.has(recipe))).toBe(true);

      if (ability.source === "class" && ability.classId) {
        expect(classIds.has(ability.classId)).toBe(true);
      }

      if (ability.source === "race" && ability.raceId) {
        expect(activeRaceIds.has(ability.raceId)).toBe(true);
      }
    }
  });
});
