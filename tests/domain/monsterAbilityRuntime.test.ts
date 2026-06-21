import { describe, expect, it } from "vitest";
import { monsterAbilities } from "../../src/content/monsterAbilities";
import { monsterCombatProfiles } from "../../src/content/monsterCombatProfiles";
import { monsters } from "../../src/content/monsters";
import {
  cloneCombatState,
  createMonsterAbilityRuntime,
  getMonsterAbilitySlotCount,
  resolveCombatTurn,
  resolveMonsterLoadoutIds,
  startCombat,
  validateMonsterAbilityContent,
  type CombatActorStats,
  type CombatState,
  type MonsterCombatStats
} from "../../src/domain/combat";
import { FakeRandomSource } from "../../src/shared/random";

const hero: CombatActorStats = {
  level: 5,
  hpMax: 48,
  manaMax: 14,
  strength: 12,
  dexterity: 8,
  intelligence: 6,
  charisma: 6,
  luck: 6,
  classId: "class.warrior",
  weaponDamage: 4
};

const mimic: MonsterCombatStats = {
  monsterId: "monster.mimic-shawarma",
  name: "Мімік-шаурма",
  level: 1,
  hpMax: 18,
  attack: 4,
  armor: 1,
  resist: 0,
  dexterity: 6,
  tags: ["mimic", "food", "starter", "korchma"]
};

const taxDragon: MonsterCombatStats = {
  monsterId: "monster.zero-declaration-tax-dragon",
  name: "Податковий дракон нульової декларації",
  level: 7,
  hpMax: 80,
  attack: 11,
  armor: 2,
  resist: 2,
  dexterity: 8,
  tags: ["dragon", "boss", "gold", "bureaucracy", "tax"]
};

describe("monster ability runtime", () => {
  it("validates the authored 93-profile and 132-ability proposal against the current roster", () => {
    expect(monsterAbilities).toHaveLength(132);
    expect(monsterCombatProfiles).toHaveLength(93);
    expect(new Set(monsterAbilities.map((ability) => ability.id)).size).toBe(132);
    expect(new Set(monsterCombatProfiles.map((profile) => profile.monsterId))).toEqual(
      new Set(monsters.map((monster) => monster.id))
    );
    expect(validateMonsterAbilityContent()).toEqual([]);
  });

  it("applies slot count gates and freezes explicit ids before deterministic fallback ids", () => {
    expect(getMonsterAbilitySlotCount(1, mimic.tags)).toBe(1);
    expect(getMonsterAbilitySlotCount(1, ["tiny-boss"], {
      monsterId: "monster.test",
      name: "Тест",
      authoredLevel: 1,
      aiProfile: "controller",
      abilityIds: ["monster.title-tax", "monster.royal-scurry"]
    })).toBe(2);
    expect(getMonsterAbilitySlotCount(6, [])).toBe(2);
    expect(getMonsterAbilitySlotCount(9, ["elite"], {
      monsterId: "monster.test",
      name: "Тест",
      authoredLevel: 9,
      aiProfile: "boss",
      abilityIds: ["monster.chimera-bite", "monster.chimera-veto", "monster.chimera-minority-report"]
    })).toBe(3);
    expect(getMonsterAbilitySlotCount(10, [])).toBe(3);

    const runtime = createMonsterAbilityRuntime({ monster: taxDragon, seed: "dragon" });
    expect(runtime?.loadoutIds).toEqual([
      "monster.tax-breath",
      "monster.asset-freeze",
      "monster.compound-interest"
    ]);

    const scaled = resolveMonsterLoadoutIds({
      monster: { ...mimic, level: 4 },
      profile: {
        monsterId: mimic.monsterId,
        name: mimic.name ?? "Мімік",
        authoredLevel: 1,
        aiProfile: "trickster",
        abilityIds: ["monster.sauce-spit"]
      },
      seed: "scaled-mimic"
    });
    expect(scaled[0]).toBe("monster.sauce-spit");
    expect(scaled).toHaveLength(2);
  });

  it("freezes runtime on new ordinary fights and leaves legacy/test fights predictable", () => {
    const state = startCombat({ id: "ordinary", hero, monster: mimic });
    expect(state.monsterRuntime).toMatchObject({
      rulesVersion: "monster-abilities-v1",
      aiProfile: "trickster",
      loadoutIds: ["monster.sauce-spit"]
    });

    const cloned = cloneCombatState(state);
    if (!cloned.monsterRuntime) {
      throw new Error("Expected cloned combat state to preserve monster runtime");
    }
    cloned.monsterRuntime.cooldowns["monster.sauce-spit"] = {
      id: "monster.sauce-spit",
      remainingOwnActions: 2
    };

    expect(state.monsterRuntime?.cooldowns).toEqual({});
    expect(startCombat({
      hero,
      monster: {
        ...mimic,
        monsterId: "monster.unknown-test",
        tags: ["test"]
      }
    }).monsterRuntime).toBeUndefined();
  });

  it("uses ordinary anti-spam so an ability is followed by a basic or defend action", () => {
    const first = resolveCombatTurn({
      state: startCombat({ id: "anti-spam", hero, monster: mimic }),
      action: "attack",
      hero,
      monster: mimic,
      rng: new FakeRandomSource([0.1, 0.9, 0.01, 0.1, 0.5])
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error("Expected first turn to resolve.");
    }
    expect(first.summary.monsterAction).toBe("skill");
    expect(first.summary.monsterSkillId).toBe("monster.sauce-spit");

    const second = resolveCombatTurn({
      state: first.state,
      action: "attack",
      hero,
      monster: mimic,
      rng: new FakeRandomSource([0.1, 0.9, 0.01, 0.1, 0.5])
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error("Expected second turn to resolve.");
    }
    expect(second.summary.monsterAction).not.toBe("skill");
  });

  it("persists telegraph before impact and lets defend soften the promised ability", () => {
    const state: CombatState = {
      ...startCombat({ id: "telegraph", hero, monster: taxDragon }),
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "boss",
        loadoutIds: ["monster.tax-breath"],
        cooldowns: {},
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        effects: [],
        ownActionCount: 0
      }
    };

    const telegraph = resolveCombatTurn({
      state,
      action: "attack",
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0.1, 0.9, 0.01])
    });
    expect(telegraph.ok).toBe(true);
    if (!telegraph.ok) {
      throw new Error("Expected telegraph turn to resolve.");
    }
    expect(telegraph.summary.monsterAction).toBe("telegraph");
    expect(telegraph.summary.monsterDamage).toBe(0);
    expect(telegraph.state.monsterRuntime?.pendingTelegraph?.abilityId).toBe("monster.tax-breath");

    const defended = resolveCombatTurn({
      state: telegraph.state,
      action: "defend",
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    expect(defended.ok).toBe(true);
    if (!defended.ok) {
      throw new Error("Expected defended impact to resolve.");
    }
    expect(defended.summary.monsterAction).toBe("skill");
    expect(defended.summary.monsterSkillId).toBe("monster.tax-breath");
    expect(defended.state.monsterRuntime?.pendingTelegraph).toBeUndefined();
    expect(defended.summary.monsterDamage).toBeGreaterThanOrEqual(1);
    expect(defended.summary.monsterDamage).toBeLessThan(16);
  });

  it("stores shield and target effects in runtime state", () => {
    const state: CombatState = {
      ...startCombat({ id: "shield", hero, monster: mimic }),
      monster: {
        ...startCombat({ hero, monster: mimic }).monster,
        hp: 40,
        hpMax: 40
      },
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "defender",
        loadoutIds: ["monster.transparent-report"],
        cooldowns: {},
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        effects: [],
        ownActionCount: 0
      }
    };
    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero,
      monster: { ...mimic, hpMax: 40, attack: 4 },
      rng: new FakeRandomSource([0.1, 0.9, 0.01, 0.1, 0.5])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected shield turn to resolve.");
    }
    expect(result.state.monsterRuntime?.shield?.sourceAbilityId).toBe("monster.transparent-report");
    expect(result.state.monsterRuntime?.effects.some((effect) => effect.kind === "reflect")).toBe(true);
  });
});
