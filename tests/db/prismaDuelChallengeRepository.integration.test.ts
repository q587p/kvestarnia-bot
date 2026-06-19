import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaDuelChallengeRepository } from "../../src/db/repositories/prismaDuelChallengeRepository";
import type {
  DuelCombatSessionRecord,
  DuelResultPayload
} from "../../src/db/repositories/duelChallengeRepository";
import { startTurnBasedDuel, type TurnBasedDuelState } from "../../src/domain/duels/turnBasedDuel";
import type { DuelistSummary } from "../../src/domain/duels/duelResolver";
import { FakeRandomSource } from "../../src/shared/random";

describe("PrismaDuelChallengeRepository turn-based integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaDuelChallengeRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-duel-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaDuelChallengeRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("enforces player-action and timeout deadline predicates in CAS updates", async () => {
    const session = await seedActiveSession("deadline-a", new Date("2026-06-17T18:00:23.000Z"));
    const before = await repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
      state: {
        ...session.state,
        pendingActions: {
          challenger: {
            actorCharacterId: session.challengerCharacterId,
            action: "attack"
          }
        }
      },
      status: "active",
      now: new Date("2026-06-17T18:00:22.999Z"),
      deadlineMode: "player-action",
      turnExpiresAt: session.turnExpiresAt
    });

    expect(before?.version).toBe(2);

    const lateSession = await seedActiveSession("deadline-b", new Date("2026-06-17T18:00:23.000Z"));
    await expect(repository.updateTurnBasedIfActiveVersion(lateSession.id, 1, 1, {
      state: lateSession.state,
      status: "active",
      now: new Date("2026-06-17T18:00:23.000Z"),
      deadlineMode: "player-action",
      turnExpiresAt: lateSession.turnExpiresAt
    })).resolves.toBeNull();

    await expect(repository.updateTurnBasedIfActiveVersion(lateSession.id, 1, 1, {
      state: lateSession.state,
      status: "active",
      now: new Date("2026-06-17T18:00:22.999Z"),
      deadlineMode: "timeout",
      turnExpiresAt: lateSession.turnExpiresAt
    })).resolves.toBeNull();

    const timeout = await repository.updateTurnBasedIfActiveVersion(lateSession.id, 1, 1, {
      state: { ...lateSession.state, turn: 2 },
      status: "active",
      now: new Date("2026-06-17T18:00:23.000Z"),
      deadlineMode: "timeout",
      turnExpiresAt: new Date("2026-06-17T18:00:46.000Z")
    });

    expect(timeout?.version).toBe(2);
    expect(timeout?.turn).toBe(2);
  });

  it("starts one turn-based session and two leases under concurrent accept attempts", async () => {
    const seeded = await seedPendingChallenge("start-race");
    const [first, second] = await Promise.all([
      repository.startTurnBasedByTokenForTelegramUser(
        "start-race",
        seeded.target.telegramUserId,
        new Date("2026-06-17T18:00:00.000Z"),
        {
          sessionId: "session-start-race-a",
          state: seeded.state,
          turnExpiresAt: new Date("2026-06-17T18:00:23.000Z")
        }
      ),
      repository.startTurnBasedByTokenForTelegramUser(
        "start-race",
        seeded.target.telegramUserId,
        new Date("2026-06-17T18:00:00.000Z"),
        {
          sessionId: "session-start-race-b",
          state: seeded.state,
          turnExpiresAt: new Date("2026-06-17T18:00:23.000Z")
        }
      )
    ]);
    const started = [first, second].filter((result) => result.record !== null);

    expect(started).toHaveLength(1);
    expect([first.transitioned, second.transitioned].filter(Boolean)).toHaveLength(1);
    await expect(prisma.duelCombatSession.count({
      where: {
        duelChallenge: {
          inviteToken: "start-race"
        }
      }
    })).resolves.toBe(1);
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        characterId: {
          in: [seeded.challenger.id, seeded.target.id]
        }
      }
    })).resolves.toBe(2);
    await expect(prisma.duelChallenge.findUnique({
      where: {
        inviteToken: "start-race"
      }
    })).resolves.toMatchObject({
      status: "active",
      targetCharacterId: seeded.target.id
    });
  });

  it("resolves terminal sessions, grants XP once and releases both leases", async () => {
    const session = await seedActiveSession("terminal-surrender", new Date("2026-06-17T18:00:23.000Z"));
    const completedAt = new Date("2026-06-17T18:00:11.000Z");
    const terminalState = makeTerminalState(session.state, "target", "surrender");
    const result = makeTerminalResult(session, "target", "surrender", { challenger: 1, target: 4 });

    const resolved = await repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
      state: terminalState,
      status: "forfeited",
      now: completedAt,
      deadlineMode: "player-action",
      turnExpiresAt: session.turnExpiresAt,
      completedAt,
      result,
      action: {
        actorCharacterId: session.challengerCharacterId,
        turn: 1,
        actionKey: "surrender",
        result: { reason: "surrender" }
      }
    });
    const replay = await repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
      state: terminalState,
      status: "forfeited",
      now: completedAt,
      deadlineMode: "player-action",
      turnExpiresAt: session.turnExpiresAt,
      completedAt,
      result
    });

    expect(resolved).toMatchObject({
      status: "forfeited",
      completedAt
    });
    expect(replay).toBeNull();
    const challenge = await prisma.duelChallenge.findUnique({
      where: {
        inviteToken: "terminal-surrender"
      }
    });

    expect(challenge).toMatchObject({
      status: "resolved",
      resolvedAt: completedAt
    });
    expect(challenge?.resultJson as unknown as DuelResultPayload).toMatchObject({
      terminalReason: "surrender",
      outcome: "target",
      xpRewards: {
        challenger: 1,
        target: 4
      }
    });
    await expect(prisma.character.findUnique({ where: { id: session.challengerCharacterId } })).resolves.toMatchObject({ xp: 26 });
    await expect(prisma.character.findUnique({ where: { id: session.targetCharacterId } })).resolves.toMatchObject({ xp: 29 });
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        referenceId: session.id
      }
    })).resolves.toBe(0);
    await expect(prisma.duelCombatAction.count({
      where: {
        sessionId: session.id,
        turn: 1
      }
    })).resolves.toBe(1);
  });

  it("lets only one callback-vs-timeout terminal update win the same turn/version", async () => {
    const session = await seedActiveSession("terminal-race", new Date("2026-06-17T18:00:23.000Z"));
    const callbackResult = makeTerminalResult(session, "challenger", "defeat", {
      challenger: 4,
      target: 1
    });
    const timeoutResult = makeTerminalResult(session, "target", "defeat", {
      challenger: 1,
      target: 4
    });
    const [callback, timeout] = await Promise.all([
      repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
        state: makeTerminalState(session.state, "challenger", "defeat"),
        status: "resolved",
        now: new Date("2026-06-17T18:00:22.999Z"),
        deadlineMode: "player-action",
        turnExpiresAt: session.turnExpiresAt,
        completedAt: new Date("2026-06-17T18:00:22.999Z"),
        result: callbackResult,
        action: {
          actorCharacterId: session.challengerCharacterId,
          turn: 1,
          actionKey: "round",
          result: { path: "callback" }
        }
      }),
      repository.updateTurnBasedIfActiveVersion(session.id, 1, 1, {
        state: makeTerminalState(session.state, "target", "defeat"),
        status: "resolved",
        now: new Date("2026-06-17T18:00:23.000Z"),
        deadlineMode: "timeout",
        turnExpiresAt: session.turnExpiresAt,
        completedAt: new Date("2026-06-17T18:00:23.000Z"),
        result: timeoutResult,
        action: {
          actorCharacterId: session.targetCharacterId,
          turn: 1,
          actionKey: "timeout-attack",
          result: { path: "timeout" }
        }
      })
    ]);

    expect([callback, timeout].filter((record) => record !== null)).toHaveLength(1);
    await expect(prisma.duelChallenge.findUnique({
      where: {
        inviteToken: "terminal-race"
      }
    })).resolves.toMatchObject({
      status: "resolved"
    });
    await expect(prisma.duelCombatAction.count({
      where: {
        sessionId: session.id,
        turn: 1
      }
    })).resolves.toBe(1);
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        referenceId: session.id
      }
    })).resolves.toBe(0);

    const challenger = await prisma.character.findUnique({ where: { id: session.challengerCharacterId } });
    const target = await prisma.character.findUnique({ where: { id: session.targetCharacterId } });
    const totalAwardedXp = (challenger?.xp ?? 0) + (target?.xp ?? 0) - 50;

    expect(totalAwardedXp).toBe(5);
  });

  it("repairs malformed active sessions and removes orphan turn-based duel leases", async () => {
    const session = await seedActiveSession("repair", new Date("2026-06-17T18:00:23.000Z"));
    await prisma.duelCombatSession.update({
      where: { id: session.id },
      data: {
        stateJson: { mode: "turn-based", status: "active" }
      }
    });
    await seedCharacter("char-orphan", 999_001n);
    await prisma.activeCombatLease.create({
      data: {
        characterId: "char-orphan",
        kind: "turn-based-duel",
        referenceId: "missing-session"
      }
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repaired = await repository.repairTurnBasedCombatState(new Date("2026-06-17T18:01:00.000Z"));
    warn.mockRestore();

    expect(repaired).toEqual({ repairedSessions: 1, removedOrphanLeases: 1 });
    await expect(prisma.duelCombatSession.findUnique({ where: { id: session.id } })).resolves.toMatchObject({
      status: "expired",
      completedAt: new Date("2026-06-17T18:01:00.000Z")
    });
    await expect(prisma.duelChallenge.findUnique({ where: { inviteToken: "repair" } })).resolves.toMatchObject({
      status: "expired"
    });
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        referenceId: {
          in: [session.id, "missing-session"]
        }
      }
    })).resolves.toBe(0);
  });

  it("repairs active sessions whose acting participant or optional state blocks are malformed", async () => {
    const badActor = await seedActiveSession("repair-actor", new Date("2026-06-17T18:00:23.000Z"));
    await prisma.duelCombatSession.update({
      where: { id: badActor.id },
      data: {
        stateJson: {
          ...badActor.state,
          actingCharacterId: "char-not-in-this-duel"
        }
      }
    });
    const badOptional = await seedActiveSession("repair-optional", new Date("2026-06-17T18:00:23.000Z"));
    await prisma.duelCombatSession.update({
      where: { id: badOptional.id },
      data: {
        stateJson: {
          ...badOptional.state,
          pendingActions: {
            challenger: {
              actorCharacterId: badOptional.challengerCharacterId,
              action: "dance"
            }
          }
        }
      }
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repaired = await repository.repairTurnBasedCombatState(new Date("2026-06-17T18:02:00.000Z"));
    const repeated = await repository.repairTurnBasedCombatState(new Date("2026-06-17T18:03:00.000Z"));
    warn.mockRestore();

    expect(repaired.repairedSessions).toBe(2);
    expect(repeated.repairedSessions).toBe(0);
    await expect(prisma.duelCombatSession.count({
      where: {
        id: {
          in: [badActor.id, badOptional.id]
        },
        status: "expired"
      }
    })).resolves.toBe(2);
    await expect(prisma.activeCombatLease.count({
      where: {
        kind: "turn-based-duel",
        referenceId: {
          in: [badActor.id, badOptional.id]
        }
      }
    })).resolves.toBe(0);
  });

  async function seedPendingChallenge(token: string) {
    const tokenId = [...token].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const challenger = await seedCharacter(`char-a-${token}`, BigInt(30_000 + tokenId));
    const target = await seedCharacter(`char-b-${token}`, BigInt(40_000 + tokenId));
    const state = makeState(challenger.id, target.id);

    await prisma.duelChallenge.create({
      data: {
        inviteToken: token,
        challengerCharacterId: challenger.id,
        targetCharacterId: target.id,
        mode: "turn-based",
        status: "pending",
        expiresAt: new Date("2026-06-17T18:13:00.000Z")
      }
    });

    return { challenger, target, state };
  }

  async function seedActiveSession(token: string, turnExpiresAt: Date) {
    const tokenId = [...token].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const challenger = await seedCharacter(`char-a-${token}`, BigInt(10_000 + tokenId));
    const target = await seedCharacter(`char-b-${token}`, BigInt(20_000 + tokenId));
    const state = makeState(challenger.id, target.id);
    const challenge = await prisma.duelChallenge.create({
      data: {
        inviteToken: token,
        challengerCharacterId: challenger.id,
        targetCharacterId: target.id,
        mode: "turn-based",
        status: "active",
        expiresAt: new Date("2026-06-17T18:13:00.000Z")
      }
    });
    const session = await prisma.duelCombatSession.create({
      data: {
        id: `session-${token}`,
        duelChallengeId: challenge.id,
        challengerCharacterId: challenger.id,
        targetCharacterId: target.id,
        status: "active",
        actingCharacterId: state.actingCharacterId,
        stateJson: state,
        turn: 1,
        version: 1,
        turnExpiresAt
      }
    });
    await prisma.activeCombatLease.createMany({
      data: [
        { characterId: challenger.id, kind: "turn-based-duel", referenceId: session.id },
        { characterId: target.id, kind: "turn-based-duel", referenceId: session.id }
      ]
    });

    const record = await repository.findTurnBasedByToken(token);
    if (!record) {
      throw new Error("Expected seeded session to map.");
    }
    return record;
  }

  async function seedCharacter(id: string, telegramUserId: bigint) {
    const user = await prisma.user.create({
      data: {
        telegramUserId
      }
    });

    const character = await prisma.character.create({
      data: {
        id,
        userId: user.id,
        name: id,
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 3,
        xp: 25,
        hpCurrent: 24,
        hpMax: 24,
        manaCurrent: 12,
        manaMax: 12,
        statsJson: {
          strength: 7,
          dexterity: 7,
          intelligence: 6,
          charisma: 6,
          luck: 6
        }
      }
    });

    return { ...character, telegramUserId };
  }
});

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY,
      telegram_user_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT,
      language_code TEXT,
      last_action_at DATETIME,
      last_seen_location_id TEXT,
      current_raid_id TEXT,
      current_adventure_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      pronoun TEXT NOT NULL DEFAULT 'they',
      path TEXT NOT NULL DEFAULT 'boundary',
      race_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25,
      hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10,
      mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME,
      mana_regen_at DATETIME,
      stats_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      slot TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      remort_number INTEGER NOT NULL,
      from_level INTEGER NOT NULL,
      from_xp INTEGER NOT NULL,
      preserved_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE solo_combat_sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      monster_id TEXT NOT NULL,
      state_json JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      reward_xp INTEGER,
      reward_gold INTEGER,
      reward_items_json JSONB,
      reward_claimed_at DATETIME,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE duel_challenges (
      id TEXT PRIMARY KEY,
      challenger_character_id TEXT NOT NULL,
      target_character_id TEXT,
      context_chat_id INTEGER,
      invite_token TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL DEFAULT 'quick',
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at DATETIME NOT NULL,
      resolved_at DATETIME,
      result_json JSONB,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE duel_combat_sessions (
      id TEXT PRIMARY KEY,
      duel_challenge_id TEXT NOT NULL UNIQUE,
      challenger_character_id TEXT NOT NULL,
      target_character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      acting_character_id TEXT NOT NULL,
      state_json JSONB NOT NULL,
      turn INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      turn_expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      challenger_chat_id INTEGER,
      challenger_message_id INTEGER,
      target_chat_id INTEGER,
      target_message_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE duel_combat_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      actor_character_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      action_key TEXT NOT NULL,
      result_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(session_id, turn)
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}

function makeState(challengerId: string, targetId: string): TurnBasedDuelState {
  const state = startTurnBasedDuel({
    challenger: makeDuelist(challengerId),
    target: makeDuelist(targetId),
    rng: new FakeRandomSource([0.99, 0])
  });
  state.actingCharacterId = challengerId;
  return state;
}

function makeTerminalState(
  state: TurnBasedDuelState,
  outcome: "challenger" | "target" | "draw",
  reason: NonNullable<DuelResultPayload["terminalReason"]>
): TurnBasedDuelState {
  const next = JSON.parse(JSON.stringify(state)) as TurnBasedDuelState;
  const winnerCharacterId =
    outcome === "challenger"
      ? next.participants.challenger.characterId
      : outcome === "target"
        ? next.participants.target.characterId
        : null;
  const loserCharacterId =
    outcome === "challenger"
      ? next.participants.target.characterId
      : outcome === "target"
        ? next.participants.challenger.characterId
        : null;

  delete next.pendingActions;
  next.status = reason === "surrender"
    ? "forfeited"
    : reason === "expired"
      ? "expired"
      : "resolved";
  next.outcome = {
    outcome,
    winnerCharacterId,
    loserCharacterId,
    reason
  };
  next.lastRound = {
    turn: next.turn,
    actions: []
  };

  return next;
}

function makeTerminalResult(
  session: DuelCombatSessionRecord,
  outcome: "challenger" | "target" | "draw",
  reason: NonNullable<DuelResultPayload["terminalReason"]>,
  xpRewards: NonNullable<DuelResultPayload["xpRewards"]>
): DuelResultPayload {
  const winnerCharacterId =
    outcome === "challenger"
      ? session.challengerCharacterId
      : outcome === "target"
        ? session.targetCharacterId
        : null;
  const loserCharacterId =
    outcome === "challenger"
      ? session.targetCharacterId
      : outcome === "target"
        ? session.challengerCharacterId
        : null;

  return {
    mode: "turn-based",
    rulesVersion: session.state.rulesVersion,
    balanceVersion: session.state.balanceVersion,
    terminalReason: reason,
    xpRewards,
    outcome,
    winnerCharacterId,
    loserCharacterId,
    challengerScore: outcome === "challenger" ? 1 : 0,
    targetScore: outcome === "target" ? 1 : 0,
    swing: 0,
    flavorKey: "integration-test"
  };
}

function makeDuelist(id: string): DuelistSummary {
  return {
    id,
    name: id,
    pronoun: "they",
    pronounLabel: "Вони",
    path: "boundary",
    raceId: "race.human-ish",
    raceName: "Людисько",
    classId: "class.warrior",
    className: "Воїн",
    title: "Тестовий",
    level: 3,
    xp: 25,
    nextLevelXp: 45,
    xpToNextLevel: 20,
    gold: 0,
    hpCurrent: 24,
    hpMax: 24,
    manaCurrent: 12,
    manaMax: 12,
    stats: {
      strength: 7,
      dexterity: 7,
      intelligence: 6,
      charisma: 6,
      luck: 6
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
      }
    }
  };
}
