import { describe, expect, it } from "vitest";
import {
  resolveTurnBasedDuelAction,
  resolveTurnBasedDuelTimeout,
  rollTurnBasedDuelXpRewards,
  startTurnBasedDuel,
  TURN_BASED_DUEL_MAX_TURNS
} from "../../src/domain/duels/turnBasedDuel";
import type { DuelistSummary } from "../../src/domain/duels/duelResolver";
import { FakeRandomSource } from "../../src/shared/random";
import { findMantokAbilityGrantByKey } from "../../src/content";
import { getVarenykSatedRemainingCombatTurns } from "../../src/domain/noncombat/varenykSatedSupport";
import { getBardInspirationRemainingCombatTurns } from "../../src/domain/noncombat/bardSupport";

describe("turn-based duel domain", () => {
  it("pulses Sated once after the committed duel exchange resolves", () => {
    const now = new Date("2026-07-14T10:01:00.000Z");
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger" }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "challenger";
    state.participants.challenger.hp = state.participants.challenger.hpMax;
    state.participants.challenger.mana = 0;
    state.participants.challenger.varenykSated = {
      version: 1,
      activationId: "sated-duel",
      recipientCharacterId: "challenger",
      recipientRemortCount: state.participants.challenger.remortCount,
      rank: 1,
      expiresAt: new Date(now.getTime() + 12 * 60_000).toISOString(),
      cursorAt: new Date(now.getTime() - 60_000).toISOString(),
      leaseStartedAt: new Date(now.getTime() - 60_000).toISOString(),
      outsideRemainderMs: 0,
      pulseIds: []
    };
    state.participants.challenger.bardInspiration = {
      version: 1,
      activationId: "inspiration-duel",
      sourcePerformanceId: "performance-duel",
      sourceLocationId: "location.korchma.bar",
      recipientCharacterId: "challenger",
      recipientRemortCount: state.participants.challenger.remortCount,
      grade: "pleasant",
      accuracyBonusPp: 2,
      expiresAt: new Date(now.getTime() + 12 * 60_000).toISOString(),
      cursorAt: new Date(now.getTime() - 60_000).toISOString(),
      leaseStartedAt: new Date(now.getTime() - 60_000).toISOString(),
      outsideRemainderMs: 0,
      pulseIds: []
    };
    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "target",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!queued.ok) throw new Error("Expected queued action.");
    const round = resolveTurnBasedDuelAction({
      state: queued.state,
      actorCharacterId: "challenger",
      action: "defend",
      sated: { sessionId: "duel-session", committedTurn: 1, now },
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!round.ok || round.resolution !== "resolved") throw new Error("Expected resolved round.");

    const pulsed = round.state;
    const action = pulsed.lastRound?.actions.find((entry) => entry.actorCharacterId === "challenger");
    const targetAction = pulsed.lastRound?.actions.find((entry) => entry.actorCharacterId === "target");
    expect(action?.satedRecovery).toEqual({ hpRestored: 1, manaRestored: 1 });
    expect(targetAction?.damage).toBeGreaterThan(0);
    expect(pulsed.participants.challenger.hp).toBe(
      pulsed.participants.challenger.hpMax - targetAction!.damage + 1
    );
    expect(pulsed.participants.challenger.varenykSated?.pulseIds).toEqual([
      "sated-duel:turn-based-duel:duel-session:1:challenger"
    ]);
    expect(getVarenykSatedRemainingCombatTurns(
      pulsed.participants.challenger.varenykSated!
    )).toBe(12);
    expect(pulsed.lastRound?.varenykSatedAfter?.challenger?.pulseIds).toEqual([
      "sated-duel:turn-based-duel:duel-session:1:challenger"
    ]);
    expect(pulsed.lastRound?.varenykSatedAfter?.target).toBeNull();
    expect(pulsed.participants.challenger.bardInspiration?.pulseIds).toEqual([
      "inspiration-duel:turn-based-duel:duel-session:1:challenger"
    ]);
    expect(getBardInspirationRemainingCombatTurns(
      pulsed.participants.challenger.bardInspiration!
    )).toBe(12);
    expect(pulsed.lastRound?.bardInspirationAfter?.challenger?.pulseIds).toEqual([
      "inspiration-duel:turn-based-duel:duel-session:1:challenger"
    ]);
    expect(pulsed.lastRound?.bardInspirationAfter?.target).toBeNull();
    expect(pulsed.statistics?.challenger).toMatchObject({
      healing: 1,
      damageTaken: targetAction!.damage,
      actions: 1,
      guardedTurns: 1
    });
  });

  it("stores a stable first actor from initiative instead of always using the challenger", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "slow", dexterity: 2, luck: 2 }),
      target: makeDuelist({ id: "fast", dexterity: 10, luck: 8 }),
      rng: new FakeRandomSource([0.99, 0])
    });

    expect(state.mode).toBe("turn-based");
    expect(state.status).toBe("active");
    expect(state.turn).toBe(1);
    expect(state.actingCharacterId).toBe("fast");
    expect(state.rulesVersion).toBe("turn-based-duel-v1");
    expect(state.balanceVersion).toBe("instant-duel-v2");
  });

  it("queues each participant choice and resolves only after both have acted", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger" }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    const otherActor = state.actingCharacterId === "challenger" ? "target" : "challenger";
    const initialChallengerHp = state.participants.challenger.hp;
    const initialTargetHp = state.participants.target.hp;

    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: otherActor,
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });

    expect(queued.ok).toBe(true);
    if (!queued.ok) {
      throw new Error("Expected queued action.");
    }
    expect(queued.resolution).toBe("queued");
    expect(queued.state.turn).toBe(1);
    expect(queued.state.participants.challenger.hp).toBe(initialChallengerHp);
    expect(queued.state.participants.target.hp).toBe(initialTargetHp);

    expect(
      resolveTurnBasedDuelAction({
        state: queued.state,
        actorCharacterId: otherActor,
        action: "skill",
        rng: new FakeRandomSource([0.1, 0.9])
      })
    ).toMatchObject({ ok: false, reason: "already-acted" });

    const resolved = resolveTurnBasedDuelAction({
      state: queued.state,
      actorCharacterId: state.actingCharacterId,
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected resolved round.");
    }
    expect(resolved.state.turn).toBe(2);
    expect(resolved.state.pendingActions).toBeUndefined();
    expect(resolved.round.actions.map((action) => action.actorCharacterId)).toEqual([
      state.actingCharacterId,
      otherActor
    ]);
  });

  it("keeps visible levels real while using normalized effective combat levels", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "newer", level: 3, remortCount: 0 }),
      target: makeDuelist({ id: "veteran", level: 13, remortCount: 2 }),
      rng: new FakeRandomSource([0.99, 0])
    });

    expect(state.participants.challenger.level).toBe(3);
    expect(state.participants.target.level).toBe(13);
    expect(state.participants.challenger.combatStats.level).toBe(13);
    expect(state.participants.target.combatStats.level).toBe(13);
    expect(state.participants.challenger.balanceAudit.effectiveCombatLevel).toBe(13);
  });

  it("resolves surrender without rolling combat", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger" }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    const winner = state.actingCharacterId === "challenger" ? "target" : "challenger";

    const resolved = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: state.actingCharacterId,
      action: "surrender",
      rng: new FakeRandomSource([0])
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected resolved surrender.");
    }
    expect(resolved.state.status).toBe("forfeited");
    expect(resolved.state.outcome).toMatchObject({
      winnerCharacterId: winner,
      loserCharacterId: state.actingCharacterId,
      reason: "surrender"
    });
    expect(resolved.round.actions[0]).toMatchObject({
      action: "surrender",
      damage: 0,
      manaSpent: 0
    });
  });

  it("applies a support ability fumble in turn-based duels instead of spending an empty action", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({
        id: "priest",
        classId: "class.priest",
        className: "Жрець",
        charisma: 10,
        manaCurrent: 14,
        manaMax: 14
      }),
      target: makeDuelist({ id: "target", hpCurrent: 10, hpMax: 28 }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.participants.challenger.playerAbilityFumbles = {
      version: 1,
      abilities: {
        "skill.strict-blessing": {
          version: 1,
          cycle: 0,
          usesInCycle: 0,
          triggerAt: 1
        }
      }
    };

    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "target",
      action: "defend",
      rng: new FakeRandomSource([0])
    });

    expect(queued.ok).toBe(true);
    if (!queued.ok) {
      throw new Error("Expected queued action.");
    }

    const resolved = resolveTurnBasedDuelAction({
      state: queued.state,
      actorCharacterId: "priest",
      action: "skill",
      rng: new FakeRandomSource([0.99, 0.99])
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected resolved round.");
    }
    const priestAction = resolved.round.actions.find((action) => action.actorCharacterId === "priest");

    expect(priestAction).toMatchObject({
      outcome: "critical-fumble",
      damage: 0,
      manaSpent: 4,
      fumble: {
        abilityId: "skill.strict-blessing",
        kind: "enemy-heal"
      }
    });
    expect(resolved.state.participants.target.hp).toBeGreaterThan(10);
    expect(resolved.state.participants.challenger.cooldowns?.skill?.id).toBe("skill.strict-blessing");
    expect(resolved.state.participants.challenger.playerAbilityFumbles?.abilities["skill.strict-blessing"]?.usesInCycle).toBe(1);
  });

  it("produces a deterministic draw at the maximum turn safety limit", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger" }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.turn = TURN_BASED_DUEL_MAX_TURNS;

    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: state.actingCharacterId,
      action: "attack",
      rng: new FakeRandomSource([0.99])
    });
    if (!queued.ok) {
      throw new Error("Expected queued action.");
    }
    const resolved = resolveTurnBasedDuelAction({
      state: queued.state,
      actorCharacterId: state.actingCharacterId === "challenger" ? "target" : "challenger",
      action: "attack",
      rng: new FakeRandomSource([0.99, 0.99])
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected resolved round.");
    }
    expect(resolved.state.status).toBe("resolved");
    expect(resolved.state.outcome).toEqual({
      outcome: "draw",
      winnerCharacterId: null,
      loserCharacterId: null,
      reason: "max-turns"
    });
    expect(resolved.round.actions.at(-1)?.outcome).toBe("draw");
  });

  it("resolves missing choices as timeout attacks", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger" }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: state.actingCharacterId,
      action: "skill",
      rng: new FakeRandomSource([0])
    });

    expect(queued.ok && queued.resolution).toBe("queued");
    if (!queued.ok) {
      throw new Error("Expected queued action.");
    }

    const resolved = resolveTurnBasedDuelTimeout({
      state: queued.state,
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });

    expect(resolved.ok).toBe(true);
    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected timeout round.");
    }
    expect(resolved.round.actions.map((action) => action.action)).toContain("timeout-attack");
  });

  it("rejects a repeated zero-mana class action without queueing a round", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger", classId: "class.rogue", dexterity: 12, hpCurrent: 100, hpMax: 100 }),
      target: makeDuelist({ id: "target", classId: "class.rogue", dexterity: 12, hpCurrent: 100, hpMax: 100 }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "challenger";

    const firstQueued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "challenger",
      action: "skill",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!firstQueued.ok) {
      throw new Error("Expected first skill to queue.");
    }

    const firstResolved = resolveTurnBasedDuelAction({
      state: firstQueued.state,
      actorCharacterId: "target",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    if (!firstResolved.ok || firstResolved.resolution !== "resolved") {
      throw new Error("Expected first round to resolve.");
    }
    expect(firstResolved.state.participants.challenger.cooldowns?.skill).toEqual({
      id: "skill.shadow-cut",
      remainingTurns: 2
    });

    const rejected = resolveTurnBasedDuelAction({
      state: firstResolved.state,
      actorCharacterId: "challenger",
      action: "skill",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    expect(rejected).toMatchObject({
      ok: false,
      reason: "skill-on-cooldown",
      state: firstResolved.state
    });
    expect(rejected.state.participants.challenger.cooldowns?.skill).toEqual({
      id: "skill.shadow-cut",
      remainingTurns: 2
    });
  });

  it("resolves race actions with an ability cooldown separate from class skills", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger", raceId: "race.human-ish", dexterity: 14 }),
      target: makeDuelist({ id: "target", raceId: "race.human-ish" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "challenger";

    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "challenger",
      action: "race",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!queued.ok) {
      throw new Error("Expected race action to queue.");
    }

    const resolved = resolveTurnBasedDuelAction({
      state: queued.state,
      actorCharacterId: "target",
      action: "defend",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected race round to resolve.");
    }

    expect(resolved.round.actions[0]).toMatchObject({
      actorCharacterId: "challenger",
      action: "race",
      skillId: "ability.race.practical-improvisation"
    });
    expect(resolved.state.participants.challenger.cooldowns?.skill).toBeUndefined();
    expect(
      resolved.state.participants.challenger.cooldowns?.abilities?.["ability.race.practical-improvisation"]
    ).toEqual({
      id: "ability.race.practical-improvisation",
      remainingTurns: 3
    });
  });

  it("resolves gear actions in turn-based duels with separate cooldowns", () => {
    const grant = findMantokAbilityGrantByKey("rldagr");
    if (!grant?.combat) {
      throw new Error("Expected red-line dagger combat grant.");
    }
    const state = startTurnBasedDuel({
      challenger: makeDuelist({
        id: "challenger",
        level: 10,
        dexterity: 14,
        manaCurrent: 10,
        equipmentAbilityGrantIds: [grant.id]
      }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "challenger";

    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "challenger",
      action: "gear",
      gearAbility: {
        profile: grant.combat.profile,
        ...(grant.combat.bleed
          ? {
              bleed: {
                sourceAbilityId: grant.combat.profile.id,
                ...grant.combat.bleed
              }
            }
          : {})
      },
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!queued.ok) {
      throw new Error("Expected gear action to queue.");
    }

    const resolved = resolveTurnBasedDuelAction({
      state: queued.state,
      actorCharacterId: "target",
      action: "defend",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected gear round to resolve.");
    }

    expect(resolved.round.actions[0]).toMatchObject({
      actorCharacterId: "challenger",
      action: "gear",
      skillId: "gear.red-line-dagger"
    });
    expect(
      resolved.state.participants.challenger.cooldowns?.abilities?.["gear.red-line-dagger"]
    ).toEqual({
      id: "gear.red-line-dagger",
      remainingTurns: 3
    });
  });

  it("rejects turn-based gear actions without enough mana", () => {
    const grant = findMantokAbilityGrantByKey("rldagr");
    if (!grant?.combat) {
      throw new Error("Expected red-line dagger combat grant.");
    }
    const state = startTurnBasedDuel({
      challenger: makeDuelist({
        id: "challenger",
        level: 10,
        manaCurrent: 0,
        equipmentAbilityGrantIds: [grant.id]
      }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "challenger";

    const result = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "challenger",
      action: "gear",
      gearAbility: {
        profile: grant.combat.profile
      },
      rng: new FakeRandomSource([0.1, 0.9])
    });

    expect(result).toMatchObject({
      ok: false,
      reason: "not-enough-mana",
      state
    });
    expect(state.pendingActions).toBeUndefined();
  });

  it("rejects turn-based gear actions while their equipment cooldown is active", () => {
    const grant = findMantokAbilityGrantByKey("rldagr");
    if (!grant?.combat) {
      throw new Error("Expected red-line dagger combat grant.");
    }
    const state = startTurnBasedDuel({
      challenger: makeDuelist({
        id: "challenger",
        level: 10,
        equipmentAbilityGrantIds: [grant.id]
      }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "challenger";
    state.participants.challenger.cooldowns = {
      abilities: {
        [grant.combat.profile.id]: {
          id: grant.combat.profile.id,
          remainingTurns: 2
        }
      }
    };

    const result = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "challenger",
      action: "gear",
      gearAbility: {
        profile: grant.combat.profile
      },
      rng: new FakeRandomSource([0.1, 0.9])
    });

    expect(result).toMatchObject({
      ok: false,
      reason: "skill-on-cooldown",
      state
    });
    expect(state.pendingActions).toBeUndefined();
  });

  it("applies borrowed equipment support effects in turn-based duels", () => {
    const grant = findMantokAbilityGrantByKey("ascstf");
    if (!grant?.combat) {
      throw new Error("Expected Asclepius staff combat grant.");
    }
    const state = startTurnBasedDuel({
      challenger: makeDuelist({
        id: "challenger",
        level: 11,
        hpCurrent: 10,
        hpMax: 30,
        manaCurrent: 10,
        equipmentAbilityGrantIds: [grant.id]
      }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "challenger";

    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "challenger",
      action: "gear",
      gearAbility: {
        profile: grant.combat.profile
      },
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!queued.ok) {
      throw new Error("Expected borrowed support gear action to queue.");
    }

    const resolved = resolveTurnBasedDuelAction({
      state: queued.state,
      actorCharacterId: "target",
      action: "defend",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected borrowed support gear round to resolve.");
    }

    expect(resolved.round.actions[0]).toMatchObject({
      actorCharacterId: "challenger",
      action: "gear",
      skillId: "gear.asclepius-instruction",
      healing: 4,
      guard: 1
    });
    expect(resolved.state.participants.challenger.hp).toBe(14);
  });

  it("applies support-only class action effects in turn-based duel summaries", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({
        id: "priest",
        classId: "class.priest",
        className: "Жрець",
        charisma: 14,
        hpCurrent: 10,
        hpMax: 30
      }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "priest";

    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "priest",
      action: "skill",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!queued.ok) {
      throw new Error("Expected priest action to queue.");
    }

    const resolved = resolveTurnBasedDuelAction({
      state: queued.state,
      actorCharacterId: "target",
      action: "defend",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected priest round to resolve.");
    }

    expect(resolved.round.actions[0]).toMatchObject({
      actorCharacterId: "priest",
      action: "skill",
      skillId: "skill.strict-blessing",
      healing: 7,
      guard: 1
    });
    expect(resolved.state.participants.challenger.hp).toBe(17);
    expect(resolved.state.statistics?.challenger).toMatchObject({
      healing: 7,
      actions: 1,
      specialActions: 1
    });
  });

  it("reduces incoming damage when defend is queued in a hidden round", () => {
    const base = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger", classId: "class.warrior", strength: 12, hpCurrent: 100, hpMax: 100 }),
      target: makeDuelist({ id: "target", classId: "class.warrior", strength: 12, hpCurrent: 100, hpMax: 100 }),
      rng: new FakeRandomSource([0.99, 0])
    });
    base.actingCharacterId = "challenger";

    const baselineQueued = resolveTurnBasedDuelAction({
      state: base,
      actorCharacterId: "challenger",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!baselineQueued.ok) {
      throw new Error("Expected baseline attack to queue.");
    }
    const baseline = resolveTurnBasedDuelAction({
      state: baselineQueued.state,
      actorCharacterId: "target",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    if (!baseline.ok || baseline.resolution !== "resolved") {
      throw new Error("Expected baseline round.");
    }
    const baselineDamage = baseline.round.actions.find(
      (action) => action.actorCharacterId === "challenger"
    )?.damage ?? 0;

    const defendedQueued = resolveTurnBasedDuelAction({
      state: base,
      actorCharacterId: "challenger",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!defendedQueued.ok) {
      throw new Error("Expected defended attack to queue.");
    }
    const defended = resolveTurnBasedDuelAction({
      state: defendedQueued.state,
      actorCharacterId: "target",
      action: "defend",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    if (!defended.ok || defended.resolution !== "resolved") {
      throw new Error("Expected defended round.");
    }
    const defendedDamage = defended.round.actions.find(
      (action) => action.actorCharacterId === "challenger"
    )?.damage ?? 0;

    expect(baselineDamage).toBeGreaterThan(0);
    expect(defendedDamage).toBeLessThan(baselineDamage);
  });

  it("uses the next defend fatigue tier for repeated hidden-round defends", () => {
    let state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger", classId: "class.warrior", strength: 12, hpCurrent: 100, hpMax: 100 }),
      target: makeDuelist({ id: "target", classId: "class.warrior", strength: 12, hpCurrent: 100, hpMax: 100 }),
      rng: new FakeRandomSource([0.99, 0])
    });

    const damages: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      state.actingCharacterId = "target";
      const queued = resolveTurnBasedDuelAction({
        state,
        actorCharacterId: "challenger",
        action: "defend",
        rng: new FakeRandomSource([0.1, 0.9])
      });
      if (!queued.ok) {
        throw new Error("Expected defend to queue.");
      }
      const resolved = resolveTurnBasedDuelAction({
        state: queued.state,
        actorCharacterId: "target",
        action: "attack",
        rng: new FakeRandomSource([0.1, 0.9])
      });
      if (!resolved.ok || resolved.resolution !== "resolved") {
        throw new Error("Expected defended round.");
      }

      damages.push(resolved.round.actions.find((action) => action.actorCharacterId === "target")?.damage ?? 0);
      state = resolved.state;
    }

    expect(damages).toEqual([6, 7, 8]);
    expect(state.participants.challenger.guard).toEqual({ consecutiveDefends: 3 });
  });

  it("clears a duel defend streak when the participant commits a non-defend action", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger", classId: "class.warrior", strength: 12, hpCurrent: 100, hpMax: 100 }),
      target: makeDuelist({ id: "target", classId: "class.warrior", strength: 12, hpCurrent: 100, hpMax: 100 }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "target";

    const defended = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "challenger",
      action: "defend",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!defended.ok) {
      throw new Error("Expected defend to queue.");
    }
    const firstRound = resolveTurnBasedDuelAction({
      state: defended.state,
      actorCharacterId: "target",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!firstRound.ok || firstRound.resolution !== "resolved") {
      throw new Error("Expected first round.");
    }
    expect(firstRound.state.participants.challenger.guard).toEqual({ consecutiveDefends: 1 });

    firstRound.state.actingCharacterId = "challenger";
    const attackQueued = resolveTurnBasedDuelAction({
      state: firstRound.state,
      actorCharacterId: "challenger",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!attackQueued.ok) {
      throw new Error("Expected attack to queue.");
    }
    const secondRound = resolveTurnBasedDuelAction({
      state: attackQueued.state,
      actorCharacterId: "target",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    if (!secondRound.ok || secondRound.resolution !== "resolved") {
      throw new Error("Expected second round.");
    }

    expect(secondRound.state.participants.challenger.guard).toBeUndefined();
  });

  it("applies defensive class skill mitigation to opponent damage in the same hidden round", () => {
    const base = startTurnBasedDuel({
      challenger: makeDuelist({
        id: "bureaucramancer",
        classId: "class.bureaucramancer",
        intelligence: 12,
        manaCurrent: 20,
        manaMax: 20,
        hpCurrent: 100,
        hpMax: 100
      }),
      target: makeDuelist({
        id: "warrior",
        classId: "class.warrior",
        strength: 12,
        hpCurrent: 100,
        hpMax: 100
      }),
      rng: new FakeRandomSource([0.99, 0])
    });
    base.actingCharacterId = "warrior";

    const withoutDefenseQueued = resolveTurnBasedDuelAction({
      state: base,
      actorCharacterId: "warrior",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!withoutDefenseQueued.ok) {
      throw new Error("Expected queued attack.");
    }
    const withoutDefense = resolveTurnBasedDuelAction({
      state: withoutDefenseQueued.state,
      actorCharacterId: "bureaucramancer",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    if (!withoutDefense.ok || withoutDefense.resolution !== "resolved") {
      throw new Error("Expected baseline round.");
    }
    const baselineWarriorDamage = withoutDefense.round.actions.find(
      (action) => action.actorCharacterId === "warrior"
    )?.damage ?? 0;

    const defendedQueued = resolveTurnBasedDuelAction({
      state: base,
      actorCharacterId: "warrior",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!defendedQueued.ok) {
      throw new Error("Expected queued defended attack.");
    }
    const defended = resolveTurnBasedDuelAction({
      state: defendedQueued.state,
      actorCharacterId: "bureaucramancer",
      action: "skill",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    if (!defended.ok || defended.resolution !== "resolved") {
      throw new Error("Expected defended round.");
    }
    const mitigatedWarriorDamage = defended.round.actions.find(
      (action) => action.actorCharacterId === "warrior"
    )?.damage ?? 0;

    expect(baselineWarriorDamage).toBeGreaterThan(0);
    expect(mitigatedWarriorDamage).toBe(Math.max(0, baselineWarriorDamage - 2));
    expect(defended.state.statistics?.challenger).toMatchObject({
      control: 2,
      guardPrevented: 0,
      actions: 1,
      specialActions: 1
    });
  });

  it("does not apply queued class mitigation when that queued ability fumbles", () => {
    const base = startTurnBasedDuel({
      challenger: makeDuelist({
        id: "bureaucramancer",
        classId: "class.bureaucramancer",
        intelligence: 12,
        manaCurrent: 20,
        manaMax: 20,
        hpCurrent: 100,
        hpMax: 100
      }),
      target: makeDuelist({
        id: "warrior",
        classId: "class.warrior",
        strength: 12,
        hpCurrent: 100,
        hpMax: 100
      }),
      rng: new FakeRandomSource([0.99, 0])
    });
    base.actingCharacterId = "warrior";

    const baselineQueued = resolveTurnBasedDuelAction({
      state: base,
      actorCharacterId: "warrior",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!baselineQueued.ok) {
      throw new Error("Expected queued attack.");
    }
    const baseline = resolveTurnBasedDuelAction({
      state: baselineQueued.state,
      actorCharacterId: "bureaucramancer",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    if (!baseline.ok || baseline.resolution !== "resolved") {
      throw new Error("Expected baseline round.");
    }
    const baselineWarriorDamage = baseline.round.actions.find(
      (action) => action.actorCharacterId === "warrior"
    )?.damage ?? 0;

    const fumbleState = JSON.parse(JSON.stringify(base)) as typeof base;
    fumbleState.participants.challenger.playerAbilityFumbles = {
      version: 1,
      abilities: {
        "skill.form-thirteen-b": {
          version: 1,
          cycle: 0,
          usesInCycle: 0,
          triggerAt: 1
        }
      }
    };
    const fumbledQueued = resolveTurnBasedDuelAction({
      state: fumbleState,
      actorCharacterId: "warrior",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!fumbledQueued.ok) {
      throw new Error("Expected queued attack against fumble.");
    }
    const fumbled = resolveTurnBasedDuelAction({
      state: fumbledQueued.state,
      actorCharacterId: "bureaucramancer",
      action: "skill",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    if (!fumbled.ok || fumbled.resolution !== "resolved") {
      throw new Error("Expected fumbled round.");
    }
    const fumbledWarriorDamage = fumbled.round.actions.find(
      (action) => action.actorCharacterId === "warrior"
    )?.damage ?? 0;

    expect(baselineWarriorDamage).toBeGreaterThan(0);
    expect(fumbledWarriorDamage).toBe(baselineWarriorDamage);
    expect(fumbled.round.actions.find((action) => action.actorCharacterId === "bureaucramancer")).toMatchObject({
      outcome: "critical-fumble",
      skillId: "skill.form-thirteen-b"
    });
  });

  it("records capped HP damage instead of overkill in turn-duel statistics", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger", strength: 30, hpCurrent: 100, hpMax: 100 }),
      target: makeDuelist({ id: "target", hpCurrent: 1, hpMax: 100 }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.actingCharacterId = "challenger";
    const queued = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "target",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!queued.ok) throw new Error("Expected target action to queue.");
    const resolved = resolveTurnBasedDuelAction({
      state: queued.state,
      actorCharacterId: "challenger",
      action: "attack",
      rng: new FakeRandomSource([0, 0])
    });
    if (!resolved.ok || resolved.resolution !== "resolved") throw new Error("Expected terminal round.");

    expect(resolved.state.statistics?.challenger.damage).toBe(1);
    expect(resolved.state.statistics?.target.damageTaken).toBe(1);
  });

  it("rolls small replay-storable XP for terminal wins and losses", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger", luck: 6 }),
      target: makeDuelist({ id: "target", luck: 6 }),
      rng: new FakeRandomSource([0.99, 0])
    });
    const resolved = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: "target",
      action: "surrender",
      rng: new FakeRandomSource([0])
    });

    if (!resolved.ok || resolved.resolution !== "resolved") {
      throw new Error("Expected terminal surrender.");
    }

    expect(rollTurnBasedDuelXpRewards(resolved.state, new FakeRandomSource([0.5, 0.99]))).toEqual({
      challenger: 6,
      target: 1
    });
  });

  it("rolls luck-biased draw XP inside the draw range", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger", luck: 20 }),
      target: makeDuelist({ id: "target", luck: 0 }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.status = "resolved";
    state.outcome = {
      outcome: "draw",
      winnerCharacterId: null,
      loserCharacterId: null,
      reason: "max-turns"
    };

    expect(rollTurnBasedDuelXpRewards(state, new FakeRandomSource([0.5, 0, 0.5, 0]))).toEqual({
      challenger: 5,
      target: 4
    });
  });

  it("does not grant XP for abandoned expired duel sessions", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger" }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.status = "expired";
    state.outcome = {
      outcome: "draw",
      winnerCharacterId: null,
      loserCharacterId: null,
      reason: "expired"
    };

    expect(rollTurnBasedDuelXpRewards(state, new FakeRandomSource([0]))).toBeNull();
  });
});

function makeDuelist(
  overrides: Partial<DuelistSummary> & {
    strength?: number;
    dexterity?: number;
    intelligence?: number;
    charisma?: number;
    luck?: number;
  } = {}
): DuelistSummary {
  return {
    id: overrides.id ?? "duelist",
    name: overrides.name ?? "Пригодник",
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: overrides.classId ?? "class.warrior",
    className: overrides.className ?? "Воїн",
    title: "Той, хто тестує",
    level: overrides.level ?? 3,
    xp: 25,
    nextLevelXp: 45,
    xpToNextLevel: 20,
    gold: 0,
    hpCurrent: overrides.hpCurrent ?? 24,
    hpMax: overrides.hpMax ?? 28,
    manaCurrent: overrides.manaCurrent ?? 12,
    manaMax: overrides.manaMax ?? 14,
    stats: {
      strength: overrides.strength ?? overrides.stats?.strength ?? 7,
      dexterity: overrides.dexterity ?? overrides.stats?.dexterity ?? 7,
      intelligence: overrides.intelligence ?? overrides.stats?.intelligence ?? 6,
      charisma: overrides.charisma ?? overrides.stats?.charisma ?? 6,
      luck: overrides.luck ?? overrides.stats?.luck ?? 6
    },
    levelBonus: {
      hpMax: 8,
      manaMax: 4,
      stats: {
        strength: 2,
        dexterity: 0,
        intelligence: 0,
        charisma: 0,
        luck: 0
      },
      primaryStat: {
        stat: "strength",
        bonus: 2
      }
    },
    ...overrides
  };
}
