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

describe("turn-based duel domain", () => {
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

  it("treats a repeated zero-mana class action as a cooldown turn without damage", () => {
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
      id: "skill.trick-shot",
      remainingTurns: 3
    });

    const secondQueued = resolveTurnBasedDuelAction({
      state: firstResolved.state,
      actorCharacterId: "challenger",
      action: "skill",
      rng: new FakeRandomSource([0.1, 0.9])
    });
    if (!secondQueued.ok) {
      throw new Error("Expected repeated skill to queue.");
    }

    const secondResolved = resolveTurnBasedDuelAction({
      state: secondQueued.state,
      actorCharacterId: "target",
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9, 0.1, 0.9])
    });
    if (!secondResolved.ok || secondResolved.resolution !== "resolved") {
      throw new Error("Expected second round to resolve.");
    }

    const repeatedSkill = secondResolved.round.actions.find(
      (action) => action.actorCharacterId === "challenger"
    );
    expect(repeatedSkill).toMatchObject({
      action: "skill",
      outcome: "skill-on-cooldown",
      damage: 0,
      manaSpent: 0
    });
    expect(secondResolved.state.participants.challenger.cooldowns?.skill).toEqual({
      id: "skill.trick-shot",
      remainingTurns: 2
    });
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
