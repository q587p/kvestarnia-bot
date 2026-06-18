import { describe, expect, it } from "vitest";
import { classes } from "../../src/content/classes";
import { monsters } from "../../src/content/monsters";
import {
  deriveMonsterCombatStats,
  expireCombat,
  getCombatSkillProfile,
  getCombatActionAvailability,
  rollBasicAttack,
  rollFleeSuccess,
  rollMonsterDamage,
  rollSkillAttack,
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
        damageKind: "spell",
        manaCost: 3,
        stat: "intelligence"
      },
      "class.bard": {
        id: "skill.dangerous-couplet",
        damageKind: "social",
        manaCost: 2,
        stat: "charisma"
      },
      "class.rogue": {
        id: "skill.trick-shot",
        damageKind: "trick",
        manaCost: 0,
        stat: "dexterity"
      },
      "class.priest": {
        id: "skill.strict-blessing",
        damageKind: "spell",
        manaCost: 2,
        stat: "charisma"
      },
      "class.varenyk-mancer": {
        id: "skill.hot-spell",
        damageKind: "spell",
        manaCost: 3,
        stat: "intelligence"
      },
      "class.bureaucramancer": {
        id: "skill.form-thirteen-b",
        damageKind: "spell",
        manaCost: 2,
        stat: "intelligence"
      },
      "class.ranger": {
        id: "skill.trick-shot",
        damageKind: "trick",
        manaCost: 0,
        stat: "dexterity"
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

  it("lets a basic attack win without requiring a starter weapon", () => {
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
      rng: new FakeRandomSource([0.1, 0.9])
    });

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("won");
    expect(result.state.monster.hp).toBe(0);
    expect(result.summary).toMatchObject({
      action: "attack",
      heroOutcome: "won",
      heroDamage: 4,
      manaSpent: 0
    });
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

  it("wastes the turn when a current skill action lacks mana", () => {
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

    expect(result.ok).toBe(true);
    expect(state).toEqual(before);
    expect(result.state.turn).toBe(2);
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

  it("puts zero-mana class skills on deterministic cooldown and treats cooldown presses as failed turns", () => {
    const first = resolveCombatTurn({
      state: startCombat({ hero: warrior, monster }),
      action: "skill",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0])
    });

    expect(first.ok).toBe(true);
    expect(first.state.cooldowns?.skill).toEqual({
      id: "skill.forceful-strike",
      remainingTurns: 3
    });

    const second = resolveCombatTurn({
      state: first.state,
      action: "skill",
      hero: warrior,
      monster,
      rng: new FakeRandomSource([0])
    });

    expect(second.ok).toBe(true);
    expect(second.state.turn).toBe(first.state.turn + 1);
    expect(second.state.cooldowns?.skill).toEqual({
      id: "skill.forceful-strike",
      remainingTurns: 2
    });
    expect(second.summary).toMatchObject({
      heroOutcome: "skill-on-cooldown",
      heroDamage: 0,
      manaSpent: 0
    });
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
});
