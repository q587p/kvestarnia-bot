import { describe, expect, it } from "vitest";
import { monsters } from "../../src/content/monsters";
import {
  deriveMonsterCombatStats,
  expireCombat,
  resolveCombatTurn,
  startCombat,
  type CombatActorStats,
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
        hp: 18,
        hpMax: 18
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

  it("returns not-enough-mana without mutating state", () => {
    const state = startCombat({
      hero: {
        ...unarmedMage,
        manaCurrent: 1
      },
      monster
    });

    const result = resolveCombatTurn({
      state,
      action: "skill",
      hero: unarmedMage,
      monster,
      rng: new FakeRandomSource([0])
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not-enough-mana");
    expect(result.state).toEqual(state);
    expect(result.summary).toMatchObject({
      heroOutcome: "not-enough-mana",
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
});
