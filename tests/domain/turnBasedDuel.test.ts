import { describe, expect, it } from "vitest";
import {
  resolveTurnBasedDuelAction,
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

  it("allows only the current participant to advance a turn", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger" }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    const wrongActor = state.actingCharacterId === "challenger" ? "target" : "challenger";

    expect(
      resolveTurnBasedDuelAction({
        state,
        actorCharacterId: wrongActor,
        action: "attack",
        rng: new FakeRandomSource([0.1, 0.9])
      })
    ).toMatchObject({ ok: false, reason: "wrong-actor", state });

    const resolved = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: state.actingCharacterId,
      action: "attack",
      rng: new FakeRandomSource([0.1, 0.9])
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.state.turn).toBe(2);
      expect(resolved.state.actingCharacterId).toBe(wrongActor);
      expect(resolved.summary.actorCharacterId).toBe(state.actingCharacterId);
      expect(resolved.summary.action).toBe("attack");
    }
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
    if (resolved.ok) {
      expect(resolved.state.status).toBe("forfeited");
      expect(resolved.state.outcome).toMatchObject({
        winnerCharacterId: winner,
        loserCharacterId: state.actingCharacterId,
        reason: "surrender"
      });
      expect(resolved.summary).toMatchObject({
        action: "surrender",
        damage: 0,
        manaSpent: 0
      });
    }
  });

  it("produces a deterministic draw at the maximum turn safety limit", () => {
    const state = startTurnBasedDuel({
      challenger: makeDuelist({ id: "challenger" }),
      target: makeDuelist({ id: "target" }),
      rng: new FakeRandomSource([0.99, 0])
    });
    state.turn = TURN_BASED_DUEL_MAX_TURNS;

    const resolved = resolveTurnBasedDuelAction({
      state,
      actorCharacterId: state.actingCharacterId,
      action: "attack",
      rng: new FakeRandomSource([0.99])
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.state.status).toBe("resolved");
      expect(resolved.state.outcome).toEqual({
        outcome: "draw",
        winnerCharacterId: null,
        loserCharacterId: null,
        reason: "max-turns"
      });
      expect(resolved.summary.outcome).toBe("draw");
    }
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
