import { describe, expect, it } from "vitest";
import { monsterAbilities } from "../../src/content/monsterAbilities";
import { monsterCombatProfiles } from "../../src/content/monsterCombatProfiles";
import { monsters } from "../../src/content/monsters";
import {
  cloneCombatState,
  createMonsterAbilityRuntime,
  getMonsterAbilitySlotCount,
  applyHeroActivationMonsterEffects,
  applyMonsterRuntimeHeroDamage,
  isHeroClassSkillLockedByMonster,
  resolveMonsterShieldDamage,
  resolveCombatTurn,
  resolveMonsterLoadoutIds,
  resolveMonsterRuntimeAction,
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

  it("keeps optional heal from gating other actionable components", () => {
    const cabbage = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.cabbage-plate"),
      hero,
      monster: mimic,
      rng: new FakeRandomSource([0, 0, 0])
    });
    const compound = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.compound-interest"),
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0, 0, 0])
    });
    const archive = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.archive-chew"),
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0, 0, 0, 0])
    });

    expect(cabbage.ability?.id).toBe("monster.cabbage-plate");
    expect(cabbage.state.monsterRuntime?.shield?.sourceAbilityId).toBe("monster.cabbage-plate");
    expect(compound.ability?.id).toBe("monster.compound-interest");
    expect(compound.state.monsterRuntime?.effects).toContainEqual(expect.objectContaining({
      target: "monster",
      kind: "outgoing-damage",
      value: 1.2
    }));
    expect(archive.ability?.id).toBe("monster.archive-chew");
    expect(archive.damage).toBeGreaterThan(0);
    expect(archive.effectText).toBeUndefined();
  });

  it("treats low-HP damage parameters as bonuses at the half-HP boundary", () => {
    const crumbAbove = resolveMonsterRuntimeAction({
      state: {
        ...startRuntimeAbilityState("monster.crumb-ambush"),
        monster: { id: taxDragon.monsterId, hp: 41, hpMax: 80 }
      },
      hero,
      monster: { ...taxDragon, hpMax: 80, attack: 11 },
      rng: new FakeRandomSource([0, 0, 0, 0])
    });
    const crumbAtHalf = resolveMonsterRuntimeAction({
      state: {
        ...startRuntimeAbilityState("monster.crumb-ambush"),
        monster: { id: taxDragon.monsterId, hp: 40, hpMax: 80 }
      },
      hero,
      monster: { ...taxDragon, hpMax: 80, attack: 11 },
      rng: new FakeRandomSource([0, 0, 0, 0])
    });
    const crumbBelow = resolveMonsterRuntimeAction({
      state: {
        ...startRuntimeAbilityState("monster.crumb-ambush"),
        monster: { id: taxDragon.monsterId, hp: 20, hpMax: 80 }
      },
      hero,
      monster: { ...taxDragon, hpMax: 80, attack: 11 },
      rng: new FakeRandomSource([0, 0, 0, 0])
    });
    const timesheetAbove = resolveMonsterRuntimeAction({
      state: {
        ...startRuntimeAbilityState("monster.timesheet-maul"),
        monster: { id: taxDragon.monsterId, hp: 41, hpMax: 80 }
      },
      hero,
      monster: { ...taxDragon, hpMax: 80, attack: 11 },
      rng: new FakeRandomSource([0, 0, 0, 0])
    });
    const timesheetAtHalf = resolveMonsterRuntimeAction({
      state: {
        ...startRuntimeAbilityState("monster.timesheet-maul"),
        monster: { id: taxDragon.monsterId, hp: 40, hpMax: 80 }
      },
      hero,
      monster: { ...taxDragon, hpMax: 80, attack: 11 },
      rng: new FakeRandomSource([0, 0, 0, 0])
    });

    expect(crumbAbove.state.monster.hp).toBe(41);
    expect(crumbAtHalf.damage).toBeGreaterThan(crumbAbove.damage);
    expect(crumbBelow.damage).toBeGreaterThan(crumbAbove.damage);
    expect(timesheetAtHalf.damage).toBeGreaterThan(timesheetAbove.damage);
  });

  it("applies parity riders from the committed combat turn", () => {
    const state = startRuntimeAbilityState("monster.temperature-offense");
    const odd = resolveMonsterRuntimeAction({
      state: cloneCombatState({ ...state, turn: 1 }),
      hero,
      monster: mimic,
      rng: new FakeRandomSource([0, 0, 0, 0, 0])
    });
    const even = resolveMonsterRuntimeAction({
      state: cloneCombatState({ ...state, turn: 2 }),
      hero,
      monster: mimic,
      rng: new FakeRandomSource([0, 0, 0, 0, 0])
    });

    expect(odd.ability?.id).toBe("monster.temperature-offense");
    expect(even.ability?.id).toBe("monster.temperature-offense");
    expect(odd.state.monsterRuntime?.effects.some((effect) => effect.kind === "burn")).toBe(true);
    expect(even.state.monsterRuntime?.effects.some((effect) => effect.kind === "slow")).toBe(true);
  });

  it("advances cycle riders by persisted monster own action count", () => {
    const first = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.fire-safety-cycle"),
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0, 0, 0, 0, 0])
    });
    const second = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.fire-safety-cycle", { ownActionCount: 1 }),
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0, 0, 0, 0, 0])
    });
    const third = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.fire-safety-cycle", { ownActionCount: 2 }),
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0, 0, 0, 0, 0])
    });

    expect(first.state.monsterRuntime?.effects.some((effect) => effect.kind === "burn")).toBe(true);
    expect(first.damage).toBeGreaterThan(0);
    expect(first.state.monsterRuntime?.shield).toBeUndefined();
    expect(first.state.monsterRuntime?.effects.some((effect) => (
      effect.target === "hero" && effect.kind === "outgoing-damage" && effect.value < 1
    ))).toBe(false);
    expect(second.state.monsterRuntime?.shield?.sourceAbilityId).toBe("monster.fire-safety-cycle");
    expect(second.damage).toBe(0);
    expect(second.state.monsterRuntime?.effects.some((effect) => effect.kind === "burn")).toBe(false);
    expect(second.state.monsterRuntime?.effects.some((effect) => (
      effect.target === "hero" && effect.kind === "outgoing-damage" && effect.value < 1
    ))).toBe(false);
    expect(third.state.monsterRuntime?.effects.some((effect) => (
      effect.target === "hero" && effect.kind === "outgoing-damage" && effect.value < 1
    ))).toBe(true);
    expect(third.damage).toBe(0);
    expect(third.state.monsterRuntime?.shield).toBeUndefined();
    expect(third.state.monsterRuntime?.effects.some((effect) => effect.kind === "burn")).toBe(false);
  });

  it("applies repeat penalty only when the committed hero action repeats", () => {
    const repeated = startRuntimeAbilityState("monster.mirror-doubt", {
      lastHeroAction: "attack",
      effects: [{
        id: "repeat:test",
        sourceAbilityId: "monster.mirror-doubt",
        target: "hero",
        kind: "repeat-penalty",
        value: 20,
        remainingTargetActivations: 2,
        charges: 1
      }]
    });
    const changed = cloneCombatState(repeated);

    expect(applyMonsterRuntimeHeroDamage({
      state: repeated,
      heroDamage: 20,
      monsterHpBeforeDamage: 80,
      heroAction: "attack"
    }).heroDamage).toBe(16);
    expect(repeated.monsterRuntime?.effects.some((effect) => effect.kind === "repeat-penalty")).toBe(false);

    expect(applyMonsterRuntimeHeroDamage({
      state: changed,
      heroDamage: 20,
      monsterHpBeforeDamage: 80,
      heroAction: "skill"
    }).heroDamage).toBe(20);
    expect(changed.monsterRuntime?.effects.some((effect) => effect.kind === "repeat-penalty")).toBe(true);
  });

  it("records eligible committed misses and defend for repeat prediction without letting it persist forever", () => {
    const missed = startRuntimeAbilityState("monster.mirror-doubt", {
      effects: [{
        id: "repeat:test",
        sourceAbilityId: "monster.mirror-doubt",
        target: "hero",
        kind: "repeat-penalty",
        value: 20,
        remainingTargetActivations: 2,
        charges: 1
      }]
    });

    expect(applyMonsterRuntimeHeroDamage({
      state: missed,
      heroDamage: 0,
      monsterHpBeforeDamage: 80,
      heroAction: "defend"
    }).heroDamage).toBe(0);
    expect(missed.monsterRuntime?.lastHeroAction).toBe("defend");
    expect(missed.monsterRuntime?.effects.find((effect) => effect.kind === "repeat-penalty")?.charges).toBe(1);

    applyHeroActivationMonsterEffects(missed);
    expect(missed.monsterRuntime?.effects.find((effect) => effect.kind === "repeat-penalty")?.remainingTargetActivations).toBe(1);

    expect(applyMonsterRuntimeHeroDamage({
      state: missed,
      heroDamage: 0,
      monsterHpBeforeDamage: 80,
      heroAction: "attack"
    }).heroDamage).toBe(0);
    expect(missed.monsterRuntime?.lastHeroAction).toBe("attack");
    applyHeroActivationMonsterEffects(missed);
    expect(missed.monsterRuntime?.effects.some((effect) => effect.kind === "repeat-penalty")).toBe(false);

    const rejected = resolveCombatTurn({
      state: startRuntimeAbilityState("monster.mirror-doubt", {
        effects: [{
          id: "lock:test",
          sourceAbilityId: "monster.stamp-denied",
          target: "hero",
          kind: "ability-lock",
          value: 1,
          remainingTargetActivations: 1,
          charges: 1
        }]
      }),
      action: "skill",
      hero,
      monster: mimic,
      rng: new FakeRandomSource([0])
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.state.monsterRuntime?.lastHeroAction).toBeUndefined();
  });

  it("reapplies the actual last expired negative effect snapshot", () => {
    const result = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.reopen-case", {
        expiredEffectIds: ["bleed:old"],
        expiredEffects: [{
          target: "hero",
          kind: "bleed",
          value: 0.22,
          remainingTargetActivations: 2
        }]
      }),
      hero,
      monster: mimic,
      rng: new FakeRandomSource([0, 0, 0, 0, 0])
    });

    expect(result.state.monsterRuntime?.effects).toContainEqual(expect.objectContaining({
      target: "hero",
      kind: "bleed",
      value: 0.22,
      remainingTargetActivations: 2
    }));
    expect(result.state.monsterRuntime?.effects.some((effect) => effect.kind === "repeat-penalty")).toBe(false);
  });

  it("routes mixed-scope buffs to their authored actors", () => {
    const result = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.mountain-on-installments"),
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0, 0, 0, 0])
    });

    expect(result.ability?.id).toBe("monster.mountain-on-installments");
    expect(result.state.monsterRuntime?.effects).toContainEqual(expect.objectContaining({
      target: "hero",
      kind: "mark",
      value: 1.15
    }));
    expect(result.state.monsterRuntime?.effects).toContainEqual(expect.objectContaining({
      target: "monster",
      kind: "outgoing-damage",
      value: 1.1
    }));
    expect(result.state.monsterRuntime?.effects.some((effect) => (
      effect.target === "hero" && effect.kind === "outgoing-damage" && effect.value > 1
    ))).toBe(false);
  });

  it("does not map race-source locks to class-skill locks", () => {
    const raceLock = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.denied-closure"),
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0, 0, 0, 0])
    });
    const classLock = resolveMonsterRuntimeAction({
      state: startRuntimeAbilityState("monster.stamp-denied"),
      hero,
      monster: taxDragon,
      rng: new FakeRandomSource([0, 0, 0, 0])
    });

    expect(raceLock.ability?.id).toBe("monster.denied-closure");
    expect(raceLock.damage).toBeGreaterThan(0);
    expect(isHeroClassSkillLockedByMonster(raceLock.state)).toBe(false);
    expect(classLock.ability?.id).toBe("monster.stamp-denied");
    expect(isHeroClassSkillLockedByMonster(classLock.state)).toBe(true);
  });

  it("arms shield-survival next attack bonus only after shield survives damage", () => {
    const shielded = startRuntimeAbilityState("monster.no-change", {
      shield: {
        sourceAbilityId: "monster.no-change",
        points: 10
      }
    });
    const broken = cloneCombatState(shielded);

    applyMonsterRuntimeHeroDamage({
      state: shielded,
      heroDamage: 4,
      monsterHpBeforeDamage: 80,
      heroAction: "attack"
    });
    applyMonsterRuntimeHeroDamage({
      state: broken,
      heroDamage: 12,
      monsterHpBeforeDamage: 80,
      heroAction: "attack"
    });

    expect(shielded.monsterRuntime?.effects.some((effect) => effect.kind === "next-attack-bonus")).toBe(true);
    expect(broken.monsterRuntime?.effects.some((effect) => effect.kind === "next-attack-bonus")).toBe(false);
  });

  it("rolls counter chance with injected RNG instead of guaranteed reflect", () => {
    const counterState = startRuntimeAbilityState("monster.salted-oath", {
      effects: [{
        id: "counter:test",
        sourceAbilityId: "monster.salted-oath",
        target: "monster",
        kind: "reflect",
        value: 3,
        remainingOwnActivations: 2,
        charges: 1
      }]
    });
    const missedCounter = cloneCombatState(counterState);
    const landedCounter = cloneCombatState(counterState);

    expect(applyMonsterRuntimeHeroDamage({
      state: missedCounter,
      heroDamage: 6,
      monsterHpBeforeDamage: 80,
      heroAction: "attack",
      rng: new FakeRandomSource([0.99])
    }).reflectedDamage).toBe(0);
    expect(applyMonsterRuntimeHeroDamage({
      state: landedCounter,
      heroDamage: 6,
      monsterHpBeforeDamage: 80,
      heroAction: "attack",
      rng: new FakeRandomSource([0.01])
    }).reflectedDamage).toBe(3);
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

  it("keeps one-charge marks through the hero action and consumes them on a later direct hit", () => {
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

    expect(result.state.monsterRuntime?.effects.some((effect) => effect.kind === "mark")).toBe(false);
  });

  it("amplifies and consumes a one-charge mark on the forced next successful basic attack", () => {
    const markedState: CombatState = {
      ...startCombat({ id: "mark-basic-hit", hero, monster: taxDragon }),
      monster: {
        ...startCombat({ hero, monster: taxDragon }).monster,
        hp: 120,
        hpMax: 120
      },
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "boss",
        loadoutIds: ["monster.asset-freeze"],
        cooldowns: {},
        onceUsedAbilityIds: [],
        lastActionKind: "ability",
        lastAbilityId: "monster.asset-freeze",
        consecutiveAbilityUses: 1,
        effects: [{
          id: "mark:basic",
          sourceAbilityId: "monster.asset-freeze",
          target: "hero",
          kind: "mark",
          value: 1.4,
          remainingTargetActivations: 2,
          charges: 1
        }],
        ownActionCount: 1
      }
    };
    const baselineState: CombatState = {
      ...markedState,
      monsterRuntime: {
        ...markedState.monsterRuntime!,
        effects: []
      }
    };

    const rngValues = [0.1, 0.9, 0.9, 0.1, 0.5];
    const baseline = resolveCombatTurn({
      state: baselineState,
      action: "attack",
      hero,
      monster: { ...taxDragon, hpMax: 120 },
      rng: new FakeRandomSource(rngValues)
    });
    const marked = resolveCombatTurn({
      state: markedState,
      action: "attack",
      hero,
      monster: { ...taxDragon, hpMax: 120 },
      rng: new FakeRandomSource(rngValues)
    });

    expect(baseline.ok).toBe(true);
    expect(marked.ok).toBe(true);
    if (!baseline.ok || !marked.ok) {
      throw new Error("Expected forced basic attacks to resolve.");
    }

    expect(baseline.summary.monsterAction).toBe("attack");
    expect(marked.summary.monsterAction).toBe("attack");
    expect(marked.summary.monsterDamage).toBeGreaterThan(baseline.summary.monsterDamage);
    expect(marked.state.monsterRuntime?.effects.some((effect) => effect.kind === "mark")).toBe(false);
  });

  it("does not consume a one-charge mark when the forced basic attack misses", () => {
    const state: CombatState = {
      ...startCombat({ id: "mark-basic-miss", hero, monster: taxDragon }),
      monster: {
        ...startCombat({ hero, monster: taxDragon }).monster,
        hp: 120,
        hpMax: 120
      },
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "boss",
        loadoutIds: ["monster.asset-freeze"],
        cooldowns: {},
        onceUsedAbilityIds: [],
        lastActionKind: "ability",
        lastAbilityId: "monster.asset-freeze",
        consecutiveAbilityUses: 1,
        effects: [{
          id: "mark:miss",
          sourceAbilityId: "monster.asset-freeze",
          target: "hero",
          kind: "mark",
          value: 1.4,
          remainingTargetActivations: 2,
          charges: 1
        }],
        ownActionCount: 1
      }
    };

    const missed = resolveCombatTurn({
      state,
      action: "attack",
      hero,
      monster: { ...taxDragon, hpMax: 120 },
      rng: new FakeRandomSource([0.1, 0.9, 0.9, 0.99])
    });

    expect(missed.ok).toBe(true);
    if (!missed.ok) {
      throw new Error("Expected forced basic attack to resolve.");
    }

    expect(missed.summary.monsterAction).toBe("attack");
    expect(missed.summary.monsterDamage).toBe(0);
    const mark = missed.state.monsterRuntime?.effects.find((effect) => effect.kind === "mark");
    expect(mark?.charges).toBe(1);
  });

  it("does not consume direct-hit charges when defend evades a runtime basic attack", () => {
    const state: CombatState = {
      ...startCombat({ id: "mark-basic-defend-evade", hero, monster: taxDragon }),
      monster: {
        ...startCombat({ hero, monster: taxDragon }).monster,
        hp: 120,
        hpMax: 120
      },
      monsterRuntime: {
        version: 1,
        rulesVersion: "monster-abilities-v1",
        aiProfile: "brute",
        loadoutIds: [],
        cooldowns: {},
        onceUsedAbilityIds: [],
        lastActionKind: "ability",
        lastAbilityId: "monster.asset-freeze",
        consecutiveAbilityUses: 1,
        effects: [
          {
            id: "mark:defend",
            sourceAbilityId: "monster.asset-freeze",
            target: "hero",
            kind: "mark",
            value: 1.4,
            remainingTargetActivations: 3,
            charges: 1
          },
          {
            id: "next:defend",
            sourceAbilityId: "monster.echo-of-audit",
            target: "monster",
            kind: "next-attack-bonus",
            value: 1.4,
            remainingOwnActivations: 3,
            charges: 1
          }
        ],
        ownActionCount: 1
      }
    };

    const evaded = resolveCombatTurn({
      state,
      action: "defend",
      hero,
      monster: { ...taxDragon, hpMax: 120 },
      rng: new FakeRandomSource([0.9, 0.1, 0, 0, 0])
    });

    expect(evaded.ok).toBe(true);
    if (!evaded.ok) {
      throw new Error("Expected defended runtime basic attack to resolve.");
    }
    expect(evaded.summary.monsterAction).toBe("attack");
    expect(evaded.summary.monsterDamage).toBe(0);
    expect(evaded.state.monsterRuntime?.effects.find((effect) => effect.kind === "mark")?.charges).toBe(1);
    expect(evaded.state.monsterRuntime?.effects.find((effect) => effect.kind === "next-attack-bonus")?.charges).toBe(1);
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

function startRuntimeAbilityState(
  abilityId: string,
  overrides: Partial<NonNullable<CombatState["monsterRuntime"]>> = {}
): CombatState {
  return {
    ...startCombat({ id: `runtime-${abilityId}`, hero, monster: mimic }),
    monster: {
      ...startCombat({ hero, monster: mimic }).monster,
      hp: 80,
      hpMax: 80
    },
    monsterRuntime: {
      version: 1,
      rulesVersion: "monster-abilities-v1",
      aiProfile: "boss",
      loadoutIds: [abilityId],
      cooldowns: {},
      onceUsedAbilityIds: [],
      consecutiveAbilityUses: 0,
      effects: [],
      ownActionCount: 0,
      ...overrides
    }
  };
}
