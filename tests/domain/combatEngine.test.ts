import { describe, expect, it } from "vitest";
import { parseCombatState } from "../../src/db/repositories/prismaSoloCombatSessionRepository";
import { classes } from "../../src/content/classes";
import { monsters } from "../../src/content/monsters";
import {
  deriveMonsterCombatStats,
  expireCombat,
  cloneCombatState,
  getCombatSkillProfile,
  getCombatActionAvailability,
  getPrimaryCombatEnemy,
  MONSTER_ABILITY_RUNTIME_RULES_VERSION,
  normalizeCombatEnemies,
  rollBasicAttack,
  rollFleeSuccess,
  rollMonsterDamage,
  rollSkillAttack,
  resolveCombatItemTurn,
  resolveCombatTurn,
  startCombat,
  type CombatActorStats,
  type CombatStatus,
  type CombatState,
  type MonsterCombatStats
} from "../../src/domain/combat";
import { FakeRandomSource } from "../../src/shared/random";

const warrior: CombatActorStats = {
  level: 2,
  hpMax: 24,
  manaMax: 12,
  strength: 9,
  dexterity: 7,
  intelligence: 5,
  charisma: 5,
  luck: 6,
  classId: "class.warrior",
  weaponDamage: 3
};

const unarmedMage: CombatActorStats = {
  level: 2,
  hpMax: 22,
  manaMax: 12,
  strength: 4,
  dexterity: 6,
  intelligence: 10,
  charisma: 6,
  luck: 5,
  classId: "class.mage"
};

const monster: MonsterCombatStats = {
  monsterId: "monster.test-problem",
  level: 2,
  hpMax: 18,
  attack: 4,
  armor: 1,
  resist: 1,
  dexterity: 6,
  tags: ["test"]
};

const secondMonster: MonsterCombatStats = {
  ...monster,
  monsterId: "monster.test-auditor",
  hpMax: 16,
  attack: 3
};

const oldHotSpellNumbers = {
  damageKind: "spell",
  stat: "intelligence",
  manaCost: 3,
  cooldownOwnActions: 1,
  baseDamage: 5,
  multiplier: 1.2,
  accuracyBonus: 0.06,
  critBonus: 0.01,
  monsterDamageReduction: 0
} as const;

const oldTrickShotNumbers = {
  damageKind: "trick",
  stat: "dexterity",
  manaCost: 0,
  cooldownOwnActions: 1,
  baseDamage: 4,
  multiplier: 1.15,
  accuracyBonus: 0.06,
  critBonus: 0.08,
  monsterDamageReduction: 0
} as const;

describe("combat domain engine", () => {
  it("maps every supported class to the intended MVP skill profile", () => {
    const expectedProfiles = {
      "class.warrior": {
        id: "skill.forceful-strike",
        damageKind: "physical",
        manaCost: 0,
        stat: "strength"
      },
      "class.mage": {
        id: "skill.hot-spell",
        ...oldHotSpellNumbers
      },
      "class.bard": {
        id: "skill.dangerous-couplet",
        damageKind: "social",
        manaCost: 2,
        stat: "charisma"
      },
      "class.rogue": {
        id: "skill.shadow-cut",
        legacyCooldownIds: ["skill.trick-shot"],
        ...oldTrickShotNumbers
      },
      "class.priest": {
        id: "skill.strict-blessing",
        damageKind: "spell",
        manaCost: 2,
        stat: "charisma"
      },
      "class.varenyk-mancer": {
        id: "skill.boiling-filling",
        legacyCooldownIds: ["skill.hot-spell"],
        ...oldHotSpellNumbers
      },
      "class.bureaucramancer": {
        id: "skill.form-thirteen-b",
        damageKind: "spell",
        manaCost: 2,
        stat: "intelligence"
      },
      "class.ranger": {
        id: "skill.trick-shot",
        ...oldTrickShotNumbers
      },
      "class.kharakternyk": {
        id: "skill.steppe-side-eye",
        damageKind: "trick",
        manaCost: 1,
        stat: "luck"
      }
    } as const;

    expect(classes.map((characterClass) => characterClass.id).sort()).toEqual(
      Object.keys(expectedProfiles).sort()
    );
    expect(new Set(classes.map((characterClass) => getCombatSkillProfile(characterClass.id).id)).size).toBe(
      classes.length
    );

    for (const [classId, expectedProfile] of Object.entries(expectedProfiles)) {
      expect(getCombatSkillProfile(classId)).toMatchObject(expectedProfile);
    }

    expect(getCombatSkillProfile(undefined)).toMatchObject({
      id: "skill.careful-strike",
      damageKind: "physical",
      manaCost: 0,
      stat: "strength"
    });
  });

  it("starts a serializable active combat state from hero and monster inputs", () => {
    expect(
      startCombat({
        id: "combat.test",
        hero: {
          ...warrior,
          hpCurrent: 99,
          manaCurrent: 3
        },
        monster
      })
    ).toEqual({
      id: "combat.test",
      turn: 1,
      status: "active",
      hero: {
        hp: 24,
        hpMax: 24,
        mana: 3,
        manaMax: 12
      },
      monster: {
        id: "monster.test-problem",
        level: 2,
        hp: 18,
        hpMax: 18,
        attack: 4,
        armor: 1,
        resist: 1,
        dexterity: 6
      }
    });
  });

  it("lets a defeated single monster answer in the same turn", () => {
    const result = resolveCombatTurn({
      state: {
        ...startCombat({ hero: unarmedMage, monster }),
        monster: {
          id: monster.monsterId,
          hp: 4,
          hpMax: monster.hpMax
        }
      },
      action: "attack",
      hero: unarmedMage,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.1])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("won");
    expect(result.state.monster.hp).toBe(0);
    expect(result.summary).toMatchObject({
      action: "attack",
      heroOutcome: "won",
      heroDamage: 4,
      monsterOutcome: "hit",
      monsterDamage: 4,
      monsterAction: "attack",
      manaSpent: 0
    });
  });

  it("resolves a combat item as the current turn", () => {
    const result = resolveCombatItemTurn({
      state: {
        ...startCombat({ hero: warrior, monster }),
        hero: {
          hp: 10,
          hpMax: warrior.hpMax,
          mana: warrior.manaMax,
          manaMax: warrior.manaMax
        }
      },
      item: {
        id: "item.test-combat-mantok",
        name: "Тестова бойова манатка",
        effect: { kind: "heal-hp", amount: 7 }
      },
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.99, 0.99, 0.99])
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      action: "item",
      heroOutcome: "item-used",
      itemId: "item.test-combat-mantok",
      heroHealing: 7,
      heroDamage: 0
    });
    expect(result.state.turn).toBe(2);
    expect(result.state.lastTurn?.action).toBe("item");
    expect(result.state.turnLog?.at(-1)?.summary.action).toBe("item");
    expect(result.state.hero.hp).toBeGreaterThanOrEqual(10);
  });

  it("applies hero-side activation effects during a two-enemy item turn", () => {
    const state = startCombat({ hero: warrior, monster: { ...monster, attack: 6 }, enemies: [monster, secondMonster] });
    state.hero.hp = 10;
    state.cooldowns = {
      skill: {
        id: "skill.forceful-strike",
        remainingTurns: 2
      }
    };
    state.monsterRuntime = makeHeroBurnRuntime(2);

    const result = resolveCombatItemTurn({
      state,
      item: {
        id: "item.test-combat-bandage",
        name: "Тестовий бойовий бинт",
        effect: { kind: "heal-hp", amount: 2 }
      },
      hero: warrior,
      monster: { ...monster, attack: 6 },
      enemies: [{ ...monster, attack: 6 }, secondMonster],
      rng: new FakeRandomSource([0.99, 0.99, 0.99, 0.99])
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      action: "item",
      heroHealing: 2,
      heroEffectDamage: 3
    });
    expect(result.summary.enemyActions).toHaveLength(2);
    expect(result.state.cooldowns?.skill?.remainingTurns).toBe(1);
    expect(result.state.lastTurn?.heroEffectDamage).toBe(3);
    expect(result.state.turnLog?.at(-1)?.summary.heroEffectDamage).toBe(3);
  });

  it("does not let enemies act when a two-enemy item activation effect defeats the hero", () => {
    const state = startCombat({ hero: warrior, monster: { ...monster, attack: 6 }, enemies: [monster, secondMonster] });
    state.hero.hp = 1;
    state.monsterRuntime = makeHeroBurnRuntime(1);

    const result = resolveCombatItemTurn({
      state,
      item: {
        id: "item.test-combat-bandage",
        name: "Тестовий бойовий бинт",
        effect: { kind: "heal-hp", amount: 1 }
      },
      hero: warrior,
      monster: { ...monster, attack: 6 },
      enemies: [{ ...monster, attack: 6 }, secondMonster],
      rng: new FakeRandomSource([0.99, 0.99, 0.99, 0.99])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("lost");
    expect(result.summary).toMatchObject({
      action: "item",
      heroHealing: 1,
      heroEffectDamage: 3,
      monsterDamage: 3,
      monsterOutcome: "lost"
    });
    expect(result.summary.enemyActions).toBeUndefined();
    expect(result.state.hero.hp).toBe(0);
  });

  it("counts a final-enemy same-turn response KO as a hero win", () => {
    const result = resolveCombatTurn({
      state: {
        ...startCombat({ hero: unarmedMage, monster }),
        hero: {
          hp: 1,
          hpMax: unarmedMage.hpMax,
          mana: unarmedMage.manaMax,
          manaMax: unarmedMage.manaMax
        },
        monster: {
          id: monster.monsterId,
          hp: 4,
          hpMax: monster.hpMax
        }
      },
      action: "attack",
      hero: unarmedMage,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.1])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("won");
    expect(result.state.hero.hp).toBe(0);
    expect(result.state.monster.hp).toBe(0);
    expect(result.summary).toMatchObject({
      action: "attack",
      heroOutcome: "won",
      heroDamage: 4,
      monsterOutcome: "hit",
      monsterDamage: 4,
      monsterAction: "attack",
      manaSpent: 0
    });
    expect(result.state.turnLog?.[0]?.eventId).toBe("terminal:won");
  });

  it("does not mutate the input state when resolving an active turn", () => {
    const state = startCombat({ hero: warrior, monster });
    const before = structuredClone(state);

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });

    expect(result.ok).toBe(true);
    expect(state).toEqual(before);
    expect(result.state).not.toBe(state);
  });

  it("targets only the primary living enemy in a two-enemy fight", () => {
    const state = startCombat({ hero: warrior, monster, enemies: [secondMonster] });
    state.enemies![0]!.hp = 1;
    state.monster.hp = 1;

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: warrior,
      monster,
      enemies: [monster, secondMonster],
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.1])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("active");
    expectPrimaryEnemyMirror(result.state, "enemy:2");
    expect(normalizeCombatEnemies(result.state).map((enemy) => [enemy.enemyId, enemy.hp])).toEqual([
      ["enemy:2", expect.any(Number)],
      ["enemy:1", 0]
    ]);
    expect(getPrimaryCombatEnemy(result.state).id).toBe(secondMonster.monsterId);
  });

  it("lets a primary enemy defeated by the hero answer before target handoff", () => {
    const state = startCombat({ hero: warrior, monster, enemies: [secondMonster] });
    state.enemies![0]!.hp = 1;
    state.monster.hp = 1;

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: warrior,
      monster,
      enemies: [monster, secondMonster],
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.1])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("active");
    expect(result.summary.enemyActions?.map((entry) => entry.enemyId)).toEqual([
      "enemy:1",
      "enemy:2"
    ]);
    const defeatedEnemyAction = result.summary.enemyActions?.[0];

    expect(defeatedEnemyAction?.enemyId).toBe("enemy:1");
    expect(defeatedEnemyAction?.monsterAction).toBe("attack");
    expect(defeatedEnemyAction?.simultaneousFinalResponse).toBe(true);
    expect(defeatedEnemyAction?.monsterDamage).toBeGreaterThanOrEqual(0);
    expectPrimaryEnemyMirror(result.state, "enemy:2");
  });

  it("keeps the multi-enemy collection canonical when only one enemy remains", () => {
    const first = makeStateAfterPrimaryEnemyDeath();
    const firstRoundTrip = parseCombatState(JSON.parse(JSON.stringify(first)));

    expect(firstRoundTrip).not.toBeNull();
    expectPrimaryEnemyMirror(firstRoundTrip ?? first, "enemy:2");

    const beforeSecondHp = normalizeCombatEnemies(firstRoundTrip ?? first)[0]!.hp;
    const second = resolveCombatTurn({
      state: firstRoundTrip ?? first,
      action: "attack",
      hero: warrior,
      monster: secondMonster,
      enemies: [monster, secondMonster],
      rng: new FakeRandomSource([0.1, 0.9, 0.99, 0.99])
    });

    expect(second.ok).toBe(true);
    expect(second.state.status).toBe("active");
    expectPrimaryEnemyMirror(second.state, "enemy:2");
    expect(parseCombatState(JSON.parse(JSON.stringify(second.state)))).not.toBeNull();
    expect(normalizeCombatEnemies(second.state).map((enemy) => enemy.enemyId)).toEqual([
      "enemy:2",
      "enemy:1"
    ]);
    expect(normalizeCombatEnemies(second.state)[0]!.hp).toBeLessThan(beforeSecondHp);
    expect(normalizeCombatEnemies(second.state)[1]).toMatchObject({ enemyId: "enemy:1", hp: 0 });
    expect(second.summary.enemyActions?.map((entry) => entry.enemyId)).toEqual(["enemy:2"]);
  });

  it("lets every living enemy act separately during the enemy phase", () => {
    const result = resolveCombatTurn({
      state: startCombat({ hero: warrior, monster, enemies: [secondMonster] }),
      action: "defend",
      hero: warrior,
      monster,
      enemies: [monster, secondMonster],
      rng: new FakeRandomSource([0.99, 0.99, 0.99, 0.99])
    });

    expect(result.ok).toBe(true);
    expect(result.summary.enemyActions?.map((entry) => entry.monsterId)).toEqual([
      monster.monsterId,
      secondMonster.monsterId
    ]);
  });

  it("wins a two-enemy fight only after every enemy is defeated", () => {
    const state = startCombat({ hero: { ...warrior, weaponDamage: 50 }, monster, enemies: [secondMonster] });
    state.enemies![0]!.hp = 1;
    state.enemies![1]!.hp = 1;
    state.monster.hp = 1;

    const first = resolveCombatTurn({
      state,
      action: "attack",
      hero: { ...warrior, weaponDamage: 50 },
      monster,
      enemies: [monster, secondMonster],
      rng: new FakeRandomSource([0.1, 0.9, 0.99, 0.99])
    });

    expect(first.ok).toBe(true);
    expect(first.state.status).toBe("active");

    const second = resolveCombatTurn({
      state: first.state,
      action: "attack",
      hero: { ...warrior, weaponDamage: 50 },
      monster: secondMonster,
      enemies: [monster, secondMonster],
      rng: new FakeRandomSource([0.1, 0.9])
    });

    expect(second.ok).toBe(true);
    expect(second.state.status).toBe("won");
    expect(normalizeCombatEnemies(second.state).every((enemy) => enemy.hp === 0)).toBe(true);
    expect(second.summary.enemyActions?.map((entry) => entry.enemyId)).toEqual(["enemy:2"]);
    expect(second.summary.enemyActions?.[0]?.simultaneousFinalResponse).toBe(true);
    expect(parseCombatState(JSON.parse(JSON.stringify(second.state)))).not.toBeNull();
  });

  it("counts a final two-enemy same-turn response KO as a hero win", () => {
    const state = makeStateAfterPrimaryEnemyDeath();
    state.hero.hp = 1;
    state.enemies![0]!.hp = 1;
    state.enemies![0]!.hpMax = secondMonster.hpMax;
    state.monster.hp = 1;
    state.monster.hpMax = secondMonster.hpMax;

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: { ...warrior, weaponDamage: 50 },
      monster: secondMonster,
      enemies: [monster, secondMonster],
      rng: new FakeRandomSource([0.1, 0.9, 0.1])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("won");
    expect(result.state.hero.hp).toBe(0);
    expect(normalizeCombatEnemies(result.state).every((enemy) => enemy.hp === 0)).toBe(true);
    expect(result.summary.heroOutcome).toBe("won");
    expect(result.summary.enemyActions?.map((entry) => entry.enemyId)).toEqual(["enemy:2"]);
    expect(result.summary.enemyActions?.[0]?.simultaneousFinalResponse).toBe(true);
    expect(result.state.turnLog?.at(-1)?.summary.enemyActions?.[0]?.simultaneousFinalResponse).toBe(true);
    expect(result.state.turnLog?.at(-1)?.eventId).toBe("terminal:won");
  });

  it("counts a final single-enemy same-turn response KO as a hero win", () => {
    const state = startCombat({ hero: { ...warrior, weaponDamage: 50 }, monster });
    state.hero.hp = 1;
    state.monster.hp = 1;

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: { ...warrior, weaponDamage: 50 },
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("won");
    expect(result.state.hero.hp).toBe(0);
    expect(result.state.monster.hp).toBe(0);
    expect(result.summary.simultaneousFinalResponse).toBe(true);
    expect(result.summary.monsterAction).toBe("attack");
    expect(result.state.turnLog?.at(-1)?.summary.simultaneousFinalResponse).toBe(true);
  });

  it("treats a final response KO as a loss when another enemy remains", () => {
    const state = startCombat({ hero: { ...warrior, weaponDamage: 50 }, monster, enemies: [secondMonster] });
    state.hero.hp = 1;
    state.enemies![0]!.hp = 1;
    state.monster.hp = 1;

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: { ...warrior, weaponDamage: 50 },
      monster,
      enemies: [monster, secondMonster],
      rng: new FakeRandomSource([0.1, 0.9, 0.1])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("lost");
    expect(result.state.hero.hp).toBe(0);
    expect(result.summary.enemyActions?.map((entry) => entry.enemyId)).toEqual(["enemy:1"]);
    expect(result.summary.enemyActions?.[0]?.simultaneousFinalResponse).toBe(true);
    expect(normalizeCombatEnemies(result.state).some((enemy) => enemy.enemyId === "enemy:2" && enemy.hp > 0)).toBe(true);
  });

  it("does not let a defeated final responder heal, shield, or support itself", () => {
    const state: CombatState = {
      ...startCombat({ hero: { ...warrior, weaponDamage: 50 }, monster }),
      monsterRuntime: {
        version: 1,
        rulesVersion: MONSTER_ABILITY_RUNTIME_RULES_VERSION,
        aiProfile: "defender",
        loadoutIds: ["monster.common-treasure-shield"],
        cooldowns: {},
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        ownActionCount: 0,
        effects: []
      }
    };
    state.monster.hp = 1;

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: { ...warrior, weaponDamage: 50 },
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("won");
    expect(result.state.monster.hp).toBe(0);
    expect(result.summary.simultaneousFinalResponse).toBe(true);
    expect(result.summary.monsterAction).toBe("attack");
    expect(result.summary.monsterSkillId).toBeUndefined();
    expect(result.summary.monsterEffectText).toBeUndefined();
    expect(result.state.monsterRuntime?.effects?.some((effect) => effect.kind === "shield")).not.toBe(true);
  });

  it.each([
    { name: "skip", action: "skip" as const, rng: [0.99, 0.99, 0.99] },
    { name: "defend", action: "defend" as const, rng: [0.99, 0.99, 0.99] },
    { name: "flee", action: "flee" as const, rng: [0.99, 0.99, 0.99] },
    {
      name: "timeout defend",
      action: "defend" as const,
      actionOrigin: "timeout-auto-defend" as const,
      rng: [0.99, 0.99, 0.99]
    }
  ])("preserves the enemy invariant through $name after primary death", ({ action, actionOrigin, rng }) => {
    const state = makeStateAfterPrimaryEnemyDeath();
    const result = resolveCombatTurn({
      state,
      action,
      ...(actionOrigin ? { actionOrigin } : {}),
      hero: warrior,
      monster: secondMonster,
      enemies: [monster, secondMonster],
      rng: new FakeRandomSource(rng)
    });

    expect(result.ok).toBe(true);
    expectPrimaryEnemyMirror(result.state, "enemy:2");
    expect(parseCombatState(JSON.parse(JSON.stringify(result.state)))).not.toBeNull();
    expect(normalizeCombatEnemies(result.state)[1]).toMatchObject({ enemyId: "enemy:1", hp: 0 });
    expect(result.summary.enemyActions?.map((entry) => entry.enemyId)).not.toContain("enemy:1");
  });

  it("preserves the enemy invariant when an active two-enemy fight expires after primary death", () => {
    const expired = expireCombat(makeStateAfterPrimaryEnemyDeath());

    expect(expired.status).toBe("expired");
    expectPrimaryEnemyMirror(expired, "enemy:2");
    expect(expired.turnLog?.at(-1)?.enemies).toEqual([
      { enemyId: "enemy:2", hp: expired.monster.hp },
      { enemyId: "enemy:1", hp: 0 }
    ]);
    expect(parseCombatState(JSON.parse(JSON.stringify(expired)))).not.toBeNull();
  });

  it("applies stored beer accuracy penalties to PvE hero attacks", () => {
    const baseline = resolveCombatTurn({
      state: startCombat({ hero: warrior, monster }),
      action: "attack",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.85, 0.9, 0.99])
    });
    const tipsy = resolveCombatTurn({
      state: {
        ...startCombat({ hero: warrior, monster }),
        drinkModifiers: {
          drinkKey: "drink.fine-beer",
          sourceId: "drink-state.test",
          accuracyPenaltyPp: 10
        }
      },
      action: "attack",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.85, 0.9, 0.99])
    });

    expect(baseline.ok).toBe(true);
    expect(tipsy.ok).toBe(true);
    expect(baseline.summary.heroDamage).toBeGreaterThan(0);
    expect(tipsy.summary.heroDamage).toBe(0);
    expect(tipsy.summary.heroOutcome).toBe("miss");
  });

  it("applies stored pepper-vodka damage modifiers to PvE combat", () => {
    const sturdyMonster = { ...monster, hpMax: 80, attack: 12 };
    const baseline = resolveCombatTurn({
      state: startCombat({ hero: warrior, monster: sturdyMonster }),
      action: "attack",
      hero: warrior,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    const peppered = resolveCombatTurn({
      state: {
        ...startCombat({ hero: warrior, monster: sturdyMonster }),
        drinkModifiers: {
          drinkKey: "drink.pepper-vodka",
          sourceId: "drink-state.test",
          outgoingDamageMultiplierBp: 11300,
          incomingDamageMultiplierBp: 11300
        }
      },
      action: "attack",
      hero: warrior,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });

    expect(baseline.ok).toBe(true);
    expect(peppered.ok).toBe(true);
    expect(peppered.summary.heroDamage).toBeGreaterThan(baseline.summary.heroDamage);
    expect(peppered.summary.monsterDamage).toBeGreaterThan(baseline.summary.monsterDamage);
  });

  it("lets the monster response make the hero lose", () => {
    const result = resolveCombatTurn({
      state: {
        ...startCombat({ hero: warrior, monster }),
        hero: {
          hp: 2,
          hpMax: warrior.hpMax,
          mana: warrior.manaMax,
          manaMax: warrior.manaMax
        }
      },
      action: "attack",
      hero: warrior,
      monster: {
        ...monster,
        hpMax: 30,
        attack: 6
      },
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.7])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("lost");
    expect(result.state.hero.hp).toBe(0);
    expect(result.summary.monsterOutcome).toBe("lost");
  });

  it("lets doppelganger monsters answer with a class skill and debug trace", () => {
    const result = resolveCombatTurn({
      state: {
        ...startCombat({ hero: warrior, monster }),
        turn: 2,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 3,
          monsterDamage: 2,
          manaSpent: 0,
          critical: false,
          monsterAction: "attack"
        }
      },
      action: "attack",
      hero: warrior,
      monster: {
        ...monster,
        tags: ["training", "doppelganger"],
        classId: "class.bureaucramancer",
        debugTrace: {
          spawnMode: "COPY_TARGET",
          copiedEquipmentCount: 1
        }
      },
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.2])
    });

    expect(result.ok).toBe(true);
    expect(result.summary.monsterAction).toBe("skill");
    expect(result.summary.monsterSkillId).toBe("skill.form-thirteen-b");
    expect(result.summary.debugTrace).toMatchObject({
      spawnMode: "COPY_TARGET",
      copiedEquipmentCount: 1,
      chosenAbilityId: "skill.form-thirteen-b"
    });
  });

  it("can open a doppelganger fight with a class skill on the first turn", () => {
    const result = resolveCombatTurn({
      state: startCombat({ hero: warrior, monster }),
      action: "attack",
      hero: warrior,
      monster: {
        ...monster,
        tags: ["training", "doppelganger"],
        classId: "class.mage"
      },
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.1, 0.2])
    });

    expect(result.ok).toBe(true);
    expect(result.summary.monsterAction).toBe("skill");
    expect(result.summary.monsterSkillId).toBe("skill.hot-spell");
  });

  it("lets doppelganger monsters go back to random skills after the opening", () => {
    const result = resolveCombatTurn({
      state: {
        ...startCombat({ hero: warrior, monster }),
        turn: 3,
        lastTurn: {
          action: "attack",
          heroOutcome: "hit",
          heroDamage: 3,
          monsterDamage: 4,
          manaSpent: 0,
          critical: false,
          monsterAction: "skill",
          monsterSkillId: "skill.form-thirteen-b",
          monsterDamageKind: "physical"
        }
      },
      action: "attack",
      hero: warrior,
      monster: {
        ...monster,
        tags: ["training", "doppelganger"],
        classId: "class.bureaucramancer"
      },
      rng: new FakeRandomSource([0.1, 0.9, 0.9, 0.1, 0.2])
    });

    expect(result.ok).toBe(true);
    expect(result.summary.monsterAction).toBe("attack");
    expect(result.summary.monsterSkillId).toBeUndefined();
  });

  it("can flee without marking combat as a win", () => {
    const result = resolveCombatTurn({
      state: startCombat({ hero: warrior, monster }),
      action: "flee",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.1])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("fled");
    expect(result.state.monster.hp).toBe(monster.hpMax);
    expect(result.summary).toMatchObject({
      action: "flee",
      heroOutcome: "fled",
      heroDamage: 0,
      monsterDamage: 0
    });
  });

  it("preserves the active Telegram card reference when cloning combat state", () => {
    const state: CombatState = {
      ...startCombat({ hero: warrior, monster }),
      message: {
        chatId: "42",
        messageId: 587
      }
    };
    const cloned = cloneCombatState(state);

    expect(cloned.message).toEqual({
      chatId: "42",
      messageId: 587
    });
    expect(cloned.message).not.toBe(state.message);
  });

  it.each(["attack", "defend", "skill", "flee", "skip"] as const)(
    "preserves the active Telegram card reference through a %s transition",
    (action) => {
      const state: CombatState = {
        ...startCombat({
          hero: {
            ...warrior,
            manaCurrent: warrior.manaMax
          },
          monster: {
            ...monster,
            hpMax: 80
          }
        }),
        message: {
          chatId: "42",
          messageId: 587
        }
      };

      const result = resolveCombatTurn({
        state,
        action,
        hero: warrior,
        monster: {
          ...monster,
          hpMax: 80
        },
        rng: new FakeRandomSource([0.99, 0.9, 0.99, 0.9, 0.99, 0.9])
      });

      expect(result.state.message).toEqual({
        chatId: "42",
        messageId: 587
      });
      expect(result.state.message).not.toBe(state.message);
    }
  );

  it("counts failed flee responses as monster actions for mandatory early barks", () => {
    const barkingMonster: MonsterCombatStats = {
      ...monster,
      monsterId: "monster.basement-mouse-with-title",
      level: 1,
      hpMax: 18,
      tags: ["beast", "title"]
    };
    const initialState: CombatState = {
      ...startCombat({ id: "flee-bark-session", hero: warrior, monster: barkingMonster }),
      id: "flee-bark-session"
    };
    delete initialState.monsterRuntime;

    const first = resolveCombatTurn({
      state: initialState,
      action: "flee",
      hero: warrior,
      monster: barkingMonster,
      rng: new FakeRandomSource([0.99, 0.1, 0.5])
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error("Expected first failed flee.");
    }
    expect(first.state.status).toBe("active");
    expect(first.state.barks?.ownActionCountByMonsterId[barkingMonster.monsterId]).toBe(1);
    expect(first.summary.monsterBarkId).toBeUndefined();

    const second = resolveCombatTurn({
      state: first.state,
      action: "flee",
      hero: warrior,
      monster: barkingMonster,
      rng: new FakeRandomSource([0.99, 0.1, 0.5])
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error("Expected second failed flee.");
    }
    expect(second.state.barks?.ownActionCountByMonsterId[barkingMonster.monsterId]).toBe(2);
    expect(second.summary.monsterBarkId).toBe("bark.basement-mouse-with-title.early-turn");
    expect(second.state.barks?.emittedBarkIds).toContain("bark.basement-mouse-with-title.early-turn");
  });

  it("does not count a successful flee as a monster action for bark state", () => {
    const barkingMonster: MonsterCombatStats = {
      ...monster,
      monsterId: "monster.basement-mouse-with-title",
      level: 1,
      hpMax: 18,
      tags: ["beast", "title"]
    };

    const result = resolveCombatTurn({
      state: startCombat({ id: "successful-flee-session", hero: warrior, monster: barkingMonster }),
      action: "flee",
      hero: warrior,
      monster: barkingMonster,
      rng: new FakeRandomSource([0])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected successful flee.");
    }
    expect(result.state.status).toBe("fled");
    expect(result.state.barks).toBeUndefined();
    expect(result.summary.monsterBarkId).toBeUndefined();
  });

  it("spends mana for class-shaped skills", () => {
    const result = resolveCombatTurn({
      state: startCombat({ hero: unarmedMage, monster }),
      action: "skill",
      hero: unarmedMage,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });

    expect(result.ok).toBe(true);
    expect(result.state.hero.mana).toBe(9);
    expect(result.summary).toMatchObject({
      action: "skill",
      skillId: "skill.hot-spell",
      damageKind: "spell",
      manaSpent: 3
    });
  });

  it("leaves state byte-equivalent when a current skill action lacks mana", () => {
    const state = startCombat({
      hero: {
        ...unarmedMage,
        manaCurrent: 1
      },
      monster
    });
    const before = structuredClone(state);

    const result = resolveCombatTurn({
      state,
      action: "skill",
      hero: unarmedMage,
      monster,
      rng: new FakeRandomSource([0])
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not-enough-mana");
    expect(state).toEqual(before);
    expect(result.state).toEqual(before);
    expect(result.summary).toMatchObject({
      heroOutcome: "not-enough-mana",
      heroDamage: 0,
      manaSpent: 0
    });
  });

  it("hides unavailable skill actions from current combat state", () => {
    const noMana = startCombat({
      hero: {
        ...unarmedMage,
        manaCurrent: 1
      },
      monster
    });

    expect(getCombatActionAvailability(noMana, unarmedMage).skill).toMatchObject({
      available: false,
      reason: "not-enough-mana"
    });

    const onCooldown: CombatState = {
      ...startCombat({ hero: warrior, monster }),
      cooldowns: {
        skill: {
          id: "skill.forceful-strike",
          remainingTurns: 3
        }
      }
    };

    expect(getCombatActionAvailability(onCooldown, warrior).skill).toMatchObject({
      available: false,
      reason: "cooldown",
      cooldownRemainingTurns: 3
    });
  });

  it("honors legacy cooldown ids for renamed class skills without storing them again", () => {
    const sturdyMonster = { ...monster, hpMax: 80 };
    const varenyky = {
      ...unarmedMage,
      classId: "class.varenyk-mancer",
      manaCurrent: unarmedMage.manaMax
    };
    const rogue = {
      ...warrior,
      classId: "class.rogue",
      dexterity: 12,
      manaCurrent: warrior.manaMax
    };
    const legacyVarenykyState: CombatState = {
      ...startCombat({ hero: varenyky, monster: sturdyMonster }),
      cooldowns: {
        abilities: {
          "skill.hot-spell": {
            id: "skill.hot-spell",
            remainingTurns: 1
          }
        }
      }
    };
    const legacyRogueState: CombatState = {
      ...startCombat({ hero: rogue, monster: sturdyMonster }),
      cooldowns: {
        skill: {
          id: "skill.trick-shot",
          remainingTurns: 1
        }
      }
    };

    expect(getCombatActionAvailability(legacyVarenykyState, varenyky).skill).toMatchObject({
      available: false,
      reason: "cooldown",
      cooldownRemainingTurns: 1
    });
    expect(getCombatActionAvailability(legacyRogueState, rogue).skill).toMatchObject({
      available: false,
      reason: "cooldown",
      cooldownRemainingTurns: 1
    });

    const blocked = resolveCombatTurn({
      state: legacyVarenykyState,
      action: "skill",
      hero: varenyky,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0])
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe("skill-on-cooldown");
    expect(blocked.state).toEqual(legacyVarenykyState);

    const ticked = resolveCombatTurn({
      state: legacyVarenykyState,
      action: "attack",
      hero: varenyky,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });
    expect(ticked.ok).toBe(true);
    if (!ticked.ok) {
      throw new Error("Expected attack to resolve.");
    }
    expect(ticked.state.cooldowns).toBeUndefined();

    const renamed = resolveCombatTurn({
      state: ticked.state,
      action: "skill",
      hero: varenyky,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      throw new Error("Expected renamed class skill to resolve.");
    }
    expect(renamed.state.cooldowns?.skill).toEqual({
      id: "skill.boiling-filling",
      remainingTurns: 1
    });
    expect(renamed.state.cooldowns?.abilities?.["skill.boiling-filling"]).toEqual({
      id: "skill.boiling-filling",
      remainingTurns: 1
    });
    expect(renamed.state.cooldowns?.abilities?.["skill.hot-spell"]).toBeUndefined();
  });

  it("stores successful turn summaries in a durable combat turn log", () => {
    const sturdyMonster = { ...monster, hpMax: 80 };
    const first = resolveCombatTurn({
      state: startCombat({ hero: warrior, monster: sturdyMonster }),
      action: "attack",
      hero: warrior,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error("Expected attack to resolve.");
    }
    expect(first.state.turnLog).toHaveLength(1);
    expect(first.state.turnLog?.[0]).toMatchObject({
      turn: 1,
      summary: {
        action: "attack",
        heroOutcome: "hit"
      },
      hero: {
        hp: first.state.hero.hp,
        mana: first.state.hero.mana
      },
      monster: {
        hp: first.state.monster.hp
      }
    });

    const blocked = resolveCombatTurn({
      state: {
        ...first.state,
        cooldowns: {
          skill: {
            id: "skill.forceful-strike",
            remainingTurns: 1
          }
        }
      },
      action: "skill",
      hero: warrior,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0])
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.state.turnLog).toEqual(first.state.turnLog);
  });

  it("stores skill cooldown snapshots and active effect notices in the combat turn log", () => {
    const sturdyMonster = { ...monster, hpMax: 80 };
    const skillTurn = resolveCombatTurn({
      state: startCombat({ hero: unarmedMage, monster: sturdyMonster }),
      action: "skill",
      hero: unarmedMage,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });

    expect(skillTurn.ok).toBe(true);
    if (!skillTurn.ok) {
      throw new Error("Expected skill turn to resolve.");
    }
    expect(skillTurn.state.turnLog?.[0]?.cooldowns?.skill).toEqual({
      id: "skill.hot-spell",
      remainingTurns: 1
    });

    const pressuredState: CombatState = {
      ...startCombat({ hero: warrior, monster: sturdyMonster }),
      monsterRuntime: {
        version: 1,
        rulesVersion: MONSTER_ABILITY_RUNTIME_RULES_VERSION,
        aiProfile: "controller",
        loadoutIds: [],
        cooldowns: {},
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        ownActionCount: 0,
        effects: [{
          id: "test-accuracy-pressure",
          sourceAbilityId: "monster.test-pressure",
          sourceActor: "monster",
          target: "hero",
          kind: "accuracy",
          value: 15,
          polarity: "harmful",
          removable: true,
          remainingTargetActivations: 2
        }]
      }
    };
    const effectTurn = resolveCombatTurn({
      state: pressuredState,
      action: "attack",
      hero: warrior,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });

    expect(effectTurn.ok).toBe(true);
    if (!effectTurn.ok) {
      throw new Error("Expected attack with active effect to resolve.");
    }
    expect(effectTurn.state.turnLog?.[0]?.notices).toContain(
      "Ефект триває: ваша влучність просіла на 15 пунктів, спаде після вашої наступної дії."
    );
  });

  it("treats reactive final-enemy mutual KO as a hero win", () => {
    const state: CombatState = {
      ...startCombat({ hero: warrior, monster }),
      hero: {
        hp: 1,
        hpMax: warrior.hpMax,
        mana: warrior.manaMax,
        manaMax: warrior.manaMax
      },
      monster: {
        id: monster.monsterId,
        hp: 3,
        hpMax: monster.hpMax
      },
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "defender",
        loadoutIds: ["monster.transparent-report"],
        cooldowns: {},
        onceUsedAbilityIds: [],
        consecutiveAbilityUses: 0,
        effects: [{
          id: "reflect:terminal",
          sourceAbilityId: "monster.transparent-report",
          target: "monster",
          kind: "reflect",
          value: 3,
          charges: 1
        }],
        ownActionCount: 0
      }
    };

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.1, 0.1, 0])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected reactive terminal turn to resolve.");
    }
    expect(result.state.status).toBe("won");
    expect(result.state.hero.hp).toBe(0);
    expect(result.state.monster.hp).toBe(0);
    expect(result.summary.heroOutcome).toBe("won");
    expect(result.summary.heroDamage).toBeGreaterThan(0);
    expect(result.summary.monsterDamage).toBe(3);
    expect(result.state.turnLog?.[0]?.eventId).toBe("terminal:won");
  });

  it("puts class skills on one intervening own action cooldown and treats cooldown presses as no-op", () => {
    const sturdyMonster = { ...monster, hpMax: 80 };
    const first = resolveCombatTurn({
      state: startCombat({ hero: warrior, monster: sturdyMonster }),
      action: "skill",
      hero: warrior,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });

    expect(first.ok).toBe(true);
    expect(first.state.cooldowns?.skill).toEqual({
      id: "skill.forceful-strike",
      remainingTurns: 1
    });
    expect(first.state.cooldowns?.abilities?.["skill.forceful-strike"]).toEqual({
      id: "skill.forceful-strike",
      remainingTurns: 1
    });

    const second = resolveCombatTurn({
      state: first.state,
      action: "skill",
      hero: warrior,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0])
    });

    expect(second.ok).toBe(false);
    expect(second.reason).toBe("skill-on-cooldown");
    expect(second.state).toEqual(first.state);
    const attack = resolveCombatTurn({
      state: first.state,
      action: "attack",
      hero: warrior,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });
    expect(attack.ok).toBe(true);
    if (!attack.ok) {
      throw new Error("Expected attack to resolve.");
    }
    expect(attack.state.cooldowns?.skill).toBeUndefined();
    const third = resolveCombatTurn({
      state: attack.state,
      action: "skill",
      hero: warrior,
      monster: sturdyMonster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });
    expect(third.ok).toBe(true);
    if (!third.ok) {
      throw new Error("Expected class action to resolve after one intervening action.");
    }
    expect(third.state.cooldowns?.skill).toEqual({
      id: "skill.forceful-strike",
      remainingTurns: 1
    });
  });

  it("normalizes legacy skill cooldown into the ability map", () => {
    const state: CombatState = {
      ...startCombat({ hero: warrior, monster }),
      cooldowns: {
        skill: {
          id: "skill.forceful-strike",
          remainingTurns: 1
        }
      }
    };

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected attack to resolve.");
    }
    expect(result.state.cooldowns).toBeUndefined();
  });

  it("defends against the next hostile action and tracks guard fatigue", () => {
    const first = resolveCombatTurn({
      state: startCombat({ hero: warrior, monster }),
      action: "defend",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.2, 0.1, 0.9])
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error("Expected defend to resolve.");
    }
    expect(first.summary).toMatchObject({
      action: "defend",
      heroOutcome: "defended",
      heroDamage: 0,
      manaSpent: 0
    });
    expect(first.state.guard).toEqual({ consecutiveDefends: 1 });
    expect(first.summary.monsterDamage).toBeLessThan(rollMonsterDamage(warrior, monster, new FakeRandomSource([0.1, 0.9])));

    const second = resolveCombatTurn({
      state: first.state,
      action: "defend",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error("Expected second defend to resolve.");
    }
    expect(second.state.guard).toEqual({ consecutiveDefends: 2 });

    const attack = resolveCombatTurn({
      state: second.state,
      action: "attack",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });
    expect(attack.ok).toBe(true);
    if (!attack.ok) {
      throw new Error("Expected attack to resolve.");
    }
    expect(attack.state.guard).toBeUndefined();
  });

  it("does not counter after a lethal monster hit through defend", () => {
    const state = {
      ...startCombat({ hero: warrior, monster }),
      hero: {
        ...startCombat({ hero: warrior, monster }).hero,
        hp: 1
      }
    };

    const result = resolveCombatTurn({
      state,
      action: "defend",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.9, 0])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected defend to resolve.");
    }
    expect(result.state.status).toBe("lost");
    expect(result.summary.heroCounterDamage).toBeUndefined();
  });

  it("does not resolve inactive combat", () => {
    const state: CombatState = {
      ...startCombat({ hero: warrior, monster }),
      status: "won"
    };

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0])
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("inactive");
    expect(result.state).toEqual(state);
    expect(result.summary.heroOutcome).toBe("inactive");
  });

  it.each(["won", "lost", "fled", "expired"] satisfies CombatStatus[])(
    "rejects %s combat without mutating the input state",
    (status) => {
      const state: CombatState = {
        ...startCombat({ hero: warrior, monster }),
        status
      };
      const before = structuredClone(state);

      const result = resolveCombatTurn({
        state,
        action: "skill",
        hero: warrior,
        monster,
        rng: new FakeRandomSource([0])
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("inactive");
      expect(state).toEqual(before);
      expect(result.state).toEqual(before);
      expect(result.state).not.toBe(state);
    }
  );

  it("can expire active combat for future stale session handling", () => {
    const activeState = startCombat({ hero: warrior, monster });
    const expired = expireCombat(activeState);

    expect(expired).toMatchObject({
      status: "expired",
      hero: activeState.hero,
      monster: activeState.monster,
      lastTurn: {
        action: "flee",
        heroOutcome: "inactive",
        heroDamage: 0,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false
      }
    });
    expect(expired.turnLog).toHaveLength(1);
    expect(expired.turnLog?.[0]).toMatchObject({
      eventId: "terminal:expired",
      turn: activeState.turn,
      summary: expired.lastTurn,
      hero: {
        hp: activeState.hero.hp,
        mana: activeState.hero.mana
      },
      monster: {
        hp: activeState.monster.hp
      }
    });
    expect(expireCombat(expired).turnLog).toHaveLength(1);

    const result = resolveCombatTurn({
      state: expired,
      action: "attack",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0])
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("inactive");
  });

  it("does not rewrite already completed combat when expiring", () => {
    const wonState: CombatState = {
      ...startCombat({ hero: warrior, monster }),
      status: "won",
      lastTurn: {
        action: "attack",
        heroOutcome: "won",
        heroDamage: 18,
        monsterDamage: 0,
        manaSpent: 0,
        critical: false
      }
    };

    expect(expireCombat(wonState)).toEqual(wonState);
  });

  it("is deterministic with injected RNG", () => {
    const state = startCombat({ hero: warrior, monster });
    const input = {
      state,
      action: "attack" as const,
      hero: warrior,
      monster
    };

    expect(resolveCombatTurn({ ...input, rng: new FakeRandomSource([0.1, 0.01, 0.1, 0]) })).toEqual(
      resolveCombatTurn({ ...input, rng: new FakeRandomSource([0.1, 0.01, 0.1, 0]) })
    );
  });

  it("keeps combat roll helpers deterministic with fixed RNG", () => {
    const skill = getCombatSkillProfile("class.rogue");

    expect(rollBasicAttack(warrior, monster, new FakeRandomSource([0.1, 0.02]))).toEqual(
      rollBasicAttack(warrior, monster, new FakeRandomSource([0.1, 0.02]))
    );
    expect(rollSkillAttack(warrior, monster, skill, new FakeRandomSource([0.1, 0.02]))).toEqual(
      rollSkillAttack(warrior, monster, skill, new FakeRandomSource([0.1, 0.02]))
    );
    expect(rollMonsterDamage(warrior, monster, new FakeRandomSource([0.1, 0.66]))).toBe(
      rollMonsterDamage(warrior, monster, new FakeRandomSource([0.1, 0.66]))
    );
    expect(rollFleeSuccess(warrior, monster, new FakeRandomSource([0.1]))).toBe(
      rollFleeSuccess(warrior, monster, new FakeRandomSource([0.1]))
    );
  });

  it("resolves a same-level sanity fight in roughly 2-5 turns", () => {
    const sameLevelMonster = deriveMonsterCombatStats({
      id: "monster.sanity-check",
      name: "Перевірка здорового глузду",
      description: "Не для гравця, для тесту.",
      level: 2,
      tags: []
    });
    let state = startCombat({ hero: warrior, monster: sameLevelMonster });
    let turns = 0;

    while (state.status === "active" && turns < 10) {
      const result = resolveCombatTurn({
        state,
        action: "attack",
        hero: warrior,
        monster: sameLevelMonster,
        rng: new FakeRandomSource([0.1, 0.9, 0.1, 0, 0.1, 0.9, 0.1, 0])
      });
      state = result.state;
      turns += 1;
    }

    expect(state.status).toBe("won");
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(turns).toBeLessThanOrEqual(5);
  });

  it("derives monster combat stats for the current Phase 1 bestiary subset", () => {
    for (const candidate of monsters) {
      expect(deriveMonsterCombatStats(candidate)).toMatchObject({
        monsterId: candidate.id,
        name: candidate.name,
        level: candidate.level,
        tags: candidate.tags
      });
      expect(deriveMonsterCombatStats(candidate).hpMax).toBeGreaterThan(0);
      expect(deriveMonsterCombatStats(candidate).attack).toBeGreaterThan(0);
    }
  });

  it("derives expected combat stat bonuses from important monster tags", () => {
    expect(
      deriveMonsterCombatStats({
        id: "monster.boss-test",
        name: "Бос тесту",
        description: "Великий з причин.",
        level: 5,
        tags: ["boss"]
      })
    ).toMatchObject({
      hpMax: 44,
      attack: 11,
      armor: 1,
      resist: 1,
      dexterity: 10
    });

    expect(
      deriveMonsterCombatStats({
        id: "monster.undead-test",
        name: "Неживий тест",
        description: "Вже бачив assert.",
        level: 2,
        tags: ["undead"]
      })
    ).toMatchObject({
      hpMax: 18,
      attack: 5,
      armor: 0,
      resist: 1,
      dexterity: 7
    });

    expect(
      deriveMonsterCombatStats({
        id: "monster.beast-test",
        name: "Звірячий тест",
        description: "Швидко біжить до coverage.",
        level: 2,
        tags: ["beast"]
      })
    ).toMatchObject({
      hpMax: 18,
      attack: 5,
      armor: 0,
      resist: 0,
      dexterity: 8
    });

    expect(
      deriveMonsterCombatStats({
        id: "monster.construct-test",
        name: "Складений тест",
        description: "Стоїть, бо його склали.",
        level: 3,
        tags: ["construct"]
      })
    ).toMatchObject({
      hpMax: 22,
      attack: 6,
      armor: 2,
      resist: 1,
      dexterity: 8
    });
  });

  it("makes level 5+ monsters scale harder than the early ladder", () => {
    const levelFour = deriveMonsterCombatStats({
      id: "monster.level-four-test",
      name: "Тест за вісімдесят",
      description: "Жодних підказок не буде.",
      level: 4,
      tags: []
    });
    const levelFive = deriveMonsterCombatStats({
      id: "monster.level-five-test",
      name: "Тест за п’ятером",
      description: "Надтяжкий тест на підкрутку.",
      level: 5,
      tags: []
    });
    const levelThirteen = deriveMonsterCombatStats({
      id: "monster.level-thirteen-test",
      name: "Тест за тринадцяткою",
      description: "Підвищена шкідливість та вигода.",
      level: 13,
      tags: []
    });

    expect(levelFive.hpMax - levelFour.hpMax).toBeGreaterThan(4);
    expect(levelFive.attack - levelFour.attack).toBeGreaterThan(0);
    expect(levelThirteen.hpMax).toBeGreaterThan(levelFive.hpMax * 2.5);
    expect(levelThirteen.attack).toBeGreaterThan(levelFive.attack * 2.5);
  });

  it("separates ongoing monster effect damage from the direct monster response", () => {
    const state = startCombat({ hero: warrior, monster });
    state.monster.attack = 6;
    state.monsterRuntime = {
      version: 1,
      rulesVersion: "monster-abilities-v1",
      aiProfile: "skirmisher",
      loadoutIds: ["monster.test-missing-ability"],
      cooldowns: {},
      onceUsedAbilityIds: [],
      consecutiveAbilityUses: 0,
      effects: [{
        id: "burn:test",
        sourceAbilityId: "monster.test-burn",
        sourceActor: "monster",
        target: "hero",
        kind: "burn",
        value: 0.5,
        polarity: "harmful",
        removable: true,
        remainingTargetActivations: 2
      }],
      ownActionCount: 0
    };

    const result = resolveCombatTurn({
      state,
      action: "attack",
      hero: warrior,
      monster: { ...monster, attack: 6 },
      rng: new FakeRandomSource([0.1, 0.5, 0.5, 0.5, 0])
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected combat turn to resolve.");
    }

    expect(result.summary.heroEffectDamage).toBe(3);
    expect(result.summary.monsterDamage).toBeGreaterThanOrEqual(3);
    expect(result.state.lastTurn?.heroEffectDamage).toBe(3);
  });
});

function makeStateAfterPrimaryEnemyDeath(): CombatState {
  const state = startCombat({ hero: warrior, monster, enemies: [secondMonster] });
  state.enemies![0]!.hp = 1;
  state.enemies![1]!.hp = 30;
  state.enemies![1]!.hpMax = 30;
  state.monster.hp = 1;

  const result = resolveCombatTurn({
    state,
    action: "attack",
    hero: warrior,
    monster,
    enemies: [monster, secondMonster],
    rng: new FakeRandomSource([0.1, 0.9, 0.99, 0.99])
  });

  if (!result.ok) {
    throw new Error("Expected primary enemy death setup to resolve.");
  }

  return result.state;
}

function makeHeroBurnRuntime(remainingTargetActivations: number): NonNullable<CombatState["monsterRuntime"]> {
  return {
    version: 1,
    rulesVersion: "monster-abilities-v1",
    aiProfile: "skirmisher",
    loadoutIds: ["monster.test-burn"],
    cooldowns: {},
    onceUsedAbilityIds: [],
    consecutiveAbilityUses: 0,
    effects: [{
      id: "burn:test",
      sourceAbilityId: "monster.test-burn",
      sourceActor: "monster",
      target: "hero",
      kind: "burn",
      value: 0.5,
      polarity: "harmful",
      removable: true,
      remainingTargetActivations
    }],
    ownActionCount: 0
  };
}

function expectPrimaryEnemyMirror(state: CombatState, enemyId: string): void {
  const enemies = normalizeCombatEnemies(state);

  expect(state.enemies).toBeDefined();
  expect(enemies[0]).toMatchObject({
    enemyId,
    id: state.monster.id,
    hp: state.monster.hp,
    hpMax: state.monster.hpMax
  });
}
