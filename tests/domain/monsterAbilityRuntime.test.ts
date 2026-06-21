import { describe, expect, it } from "vitest";
import { monsterAbilities } from "../../src/content/monsterAbilities";
import { monsterCombatProfiles } from "../../src/content/monsterCombatProfiles";
import { monsters } from "../../src/content/monsters";
import {
  cloneCombatState,
  createMonsterAbilityRuntime,
  getMonsterAbilitySlotCount,
  resolveMonsterShieldDamage,
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

  it("accounts shield absorption without healing or reviving the monster", () => {
    expect(resolveMonsterShieldDamage({
      hpBefore: 6,
      hpMax: 40,
      shieldPoints: 5,
      incomingDamage: 9
    })).toEqual({
      hpAfter: 2,
      shieldAfter: 0,
      absorbed: 5,
      appliedDamage: 4
    });

    expect(resolveMonsterShieldDamage({
      hpBefore: 0,
      hpMax: 40,
      shieldPoints: 5,
      incomingDamage: 2
    })).toEqual({
      hpAfter: 0,
      shieldAfter: 3,
      absorbed: 2,
      appliedDamage: 0
    });
  });

  it("keeps one-charge marks through the hero action and consumes them only on a later direct hit", () => {
    const state: CombatState = {
      ...startCombat({ id: "mark-lifecycle", hero, monster: taxDragon }),
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "boss",
        loadoutIds: ["monster.asset-freeze"],
        cooldowns: {},
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        effects: [{
          id: "mark:test",
          sourceAbilityId: "monster.asset-freeze",
          target: "hero",
          kind: "mark",
          value: 1.4,
          remainingTargetActivations: 2,
          charges: 1
        }],
        ownActionCount: 0
      }
    };

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0.1, 0.9, 0.99, 0.1, 0.5])
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected marked turn to resolve.");
    }

    const mark = result.state.monsterRuntime?.effects.find((effect) => effect.kind === "mark");
    expect(mark?.charges).toBe(1);
  });

  it("applies reflect only when hero damage reaches monster HP", () => {
    const state: CombatState = {
      ...startCombat({ id: "reflect", hero, monster: mimic }),
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "defender",
        loadoutIds: ["monster.transparent-report"],
        cooldowns: {},
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        shield: {
          sourceAbilityId: "monster.transparent-report",
          points: 30
        },
        effects: [{
          id: "reflect:test",
          sourceAbilityId: "monster.transparent-report",
          target: "monster",
          kind: "reflect",
          value: 4,
          remainingOwnActivations: 2,
          charges: 1
        }],
        ownActionCount: 0
      }
    };

    const blocked = resolveCombatTurn({
      state,
      action: "attack",
      hero,
      monster: mimic,
      rng: new FakeRandomSource([0.1, 0.9, 0.99, 0.1])
    });
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) {
      throw new Error("Expected shielded turn to resolve.");
    }
    expect(blocked.summary.heroDamage).toBe(0);
    expect(blocked.state.monsterRuntime?.effects.some((effect) => effect.kind === "reflect")).toBe(true);
  });

  it("routes runtime basic attacks through the ordinary defend stance", () => {
    const state: CombatState = {
      ...startCombat({ id: "runtime-basic-defend", hero, monster: mimic }),
      monster: {
        ...startCombat({ hero, monster: mimic }).monster,
        hp: 80,
        hpMax: 80
      },
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "trickster",
        loadoutIds: ["monster.sauce-spit"],
        cooldowns: {
          "monster.sauce-spit": {
            id: "monster.sauce-spit",
            remainingOwnActions: 2
          }
        },
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        shield: {
          sourceAbilityId: "monster.basic-defend",
          points: 1
        },
        effects: [],
        ownActionCount: 0
      }
    };

    const defended = resolveCombatTurn({
      state,
      action: "defend",
      hero,
      monster: { ...mimic, hpMax: 80, attack: 8 },
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.99, 0.99])
    });
    expect(defended.ok).toBe(true);
    if (!defended.ok) {
      throw new Error("Expected defended runtime basic attack.");
    }
    expect(defended.summary.monsterAction).toBe("attack");
    expect(defended.summary.monsterDamage).toBeLessThan(8);
    expect(defended.state.guard).toEqual({ consecutiveDefends: 1 });
  });

  it("uses positive monster accuracy context as a higher ability hit chance", () => {
    const state: CombatState = {
      ...startCombat({ id: "runtime-accuracy-context", hero, monster: mimic }),
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "trickster",
        loadoutIds: ["monster.sauce-spit"],
        cooldowns: {},
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        effects: [],
        ownActionCount: 0
      }
    };

    const result = resolveCombatTurn({
      state,
      action: "defend",
      hero,
      monster: {
        ...mimic,
        contextModifiers: {
          outgoingDamageMultiplier: 1,
          incomingDamageMultiplier: 1,
          accuracyDeltaPp: 20,
          evasionDeltaPp: 0,
          abilityWeightDelta: 0,
          barkWeightDelta: 0,
          signatureCooldownDelta: 0,
          flatArmorDelta: 0,
          flatResistDelta: 0,
          flatDexterityDelta: 0
        }
      },
      rng: new FakeRandomSource([0.1, 0.1, 0.7, 0.99, 0.1])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected contextual ability turn to resolve.");
    }
    expect(result.summary.monsterAction).toBe("skill");
    expect(result.summary.monsterSkillId).toBe("monster.sauce-spit");
    expect(result.summary.monsterDamage).toBeGreaterThan(0);
  });

  it("does not reduce successful hero damage by monster evasion after the hit roll", () => {
    const state: CombatState = {
      ...startCombat({ id: "runtime-evasion-hit-only", hero, monster: mimic }),
      monster: {
        ...startCombat({ hero, monster: mimic }).monster,
        hp: 80,
        hpMax: 80
      },
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "trickster",
        loadoutIds: ["monster.sauce-spit"],
        cooldowns: {
          "monster.sauce-spit": {
            id: "monster.sauce-spit",
            remainingOwnActions: 2
          }
        },
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        effects: [{
          id: "evasion:test",
          sourceAbilityId: "monster.sauce-spit",
          target: "monster",
          kind: "evasion",
          value: 35,
          remainingOwnActivations: 2
        }],
        ownActionCount: 0
      }
    };

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero,
      monster: { ...mimic, hpMax: 80 },
      rng: new FakeRandomSource([0.1, 0.99, 0.99, 0.99, 0.99])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected evasive monster turn to resolve.");
    }
    expect(result.summary.heroOutcome).toBe("hit");
    expect(result.summary.heroDamage).toBe(15);
  });
});
