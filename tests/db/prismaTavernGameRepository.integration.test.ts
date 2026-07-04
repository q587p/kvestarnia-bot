import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaTavernGameRepository } from "../../src/db/repositories/prismaTavernGameRepository";
import { evaluateQuickHand, startQuickDicePoker, startScorecardDicePoker } from "../../src/domain/dicePoker";

describe("PrismaTavernGameRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaTavernGameRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-tavern-games-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaTavernGameRepository(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.tavernGameParticipant.deleteMany();
    await prisma.tavernGameSession.deleteMany();
    await prisma.activeCombatLease.deleteMany();
    await prisma.characterRemort.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps an open Kosti table joinable after two early decisions", async () => {
    await seedCharacter({ telegramUserId: 101n, characterId: "character-kosti-creator", name: "РљРёРґСѓРЅ", gold: 10 });
    await seedCharacter({ telegramUserId: 102n, characterId: "character-kosti-second", name: "Р—РЅР°РєРѕР·РЅР°РІРµС†СЊ", gold: 10 });
    await seedCharacter({ telegramUserId: 103n, characterId: "character-kosti-third", name: "РўСЂРµС‚СЏ РєС–СЃС‚РєР°", gold: 10 });

    const created = await repository.createForTelegramUser(101n, createInput("kosti", "12345678-1234-4234-9234-000000000101"));
    expect(created.state).toBe("created");
    const joined = await repository.joinByTokenForTelegramUser(102n, "12345678-1234-4234-9234-000000000101", joinInput());
    expect(joined.state).toBe("joined");

    const creatorDecision = await repository.submitDecisionForTelegramUser(101n, "12345678-1234-4234-9234-000000000101", {
      gameKey: "kosti",
      style: "steady",
      sign: "no_sign"
    }, now());
    const secondDecision = await repository.submitDecisionForTelegramUser(102n, "12345678-1234-4234-9234-000000000101", {
      gameKey: "kosti",
      style: "push",
      sign: "high_hand"
    }, now());

    expect(creatorDecision.state).toBe("decided");
    expect(secondDecision.state).toBe("decided");
    await expect(prisma.tavernGameSession.findUnique({
      where: { token: "12345678-1234-4234-9234-000000000101" },
      select: { status: true, potGold: true }
    })).resolves.toEqual({ status: "open", potGold: 6 });

    const thirdJoin = await repository.joinByTokenForTelegramUser(103n, "12345678-1234-4234-9234-000000000101", joinInput());

    expect(thirdJoin.state).toBe("joined");
    expect(thirdJoin.state === "joined" ? thirdJoin.session.status : null).toBe("open");
    expect(thirdJoin.state === "joined" ? thirdJoin.session.participants : []).toHaveLength(3);
    await expect(prisma.tavernGameSession.findUnique({
      where: { token: "12345678-1234-4234-9234-000000000101" },
      select: { status: true, potGold: true }
    })).resolves.toEqual({ status: "open", potGold: 9 });
  });

  it("keeps Kosti open through six players and marks it ready on the seventh", async () => {
    const token = "12345678-1234-4234-9234-000000000107";
    for (let index = 1; index <= 8; index += 1) {
      await seedCharacter({
        telegramUserId: BigInt(300 + index),
        characterId: `character-kosti-seven-${index}`,
        name: `Гравець ${index}`,
        gold: 10
      });
    }

    const created = await repository.createForTelegramUser(301n, createInput("kosti", token));
    expect(created.state).toBe("created");

    for (let index = 2; index <= 6; index += 1) {
      const joined = await repository.joinByTokenForTelegramUser(BigInt(300 + index), token, joinInput());
      expect(joined.state).toBe("joined");
      expect(joined.state === "joined" ? joined.session.status : null).toBe("open");
    }

    const seventh = await repository.joinByTokenForTelegramUser(307n, token, joinInput());
    const eighth = await repository.joinByTokenForTelegramUser(308n, token, joinInput());

    expect(seventh.state).toBe("joined");
    expect(seventh.state === "joined" ? seventh.session.status : null).toBe("ready");
    expect(seventh.state === "joined" ? seventh.session.participants : []).toHaveLength(7);
    expect(eighth.state).toBe("closed");
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, potGold: true }
    })).resolves.toEqual({ status: "ready", potGold: 21 });
  });

  it("lists completed sessions since the requested cutoff with participants", async () => {
    const recentToken = "12345678-1234-4234-9234-000000000401";
    const oldToken = "12345678-1234-4234-9234-000000000403";
    const recentCompletedAt = new Date("2026-07-02T09:00:00.000Z");
    const oldCompletedAt = new Date("2026-06-01T09:00:00.000Z");
    await seedCharacter({ telegramUserId: 401n, characterId: "character-recent-creator", name: "Recent Creator", gold: 10 });
    await seedCharacter({ telegramUserId: 402n, characterId: "character-recent-joiner", name: "Recent Joiner", gold: 10 });
    await seedCharacter({ telegramUserId: 403n, characterId: "character-old-creator", name: "Old Creator", gold: 10 });
    await seedCharacter({ telegramUserId: 404n, characterId: "character-old-joiner", name: "Old Joiner", gold: 10 });

    await repository.createForTelegramUser(401n, createInput("tavlei", recentToken));
    await repository.joinByTokenForTelegramUser(402n, recentToken, joinInput());
    await repository.createForTelegramUser(403n, createInput("tavlei", oldToken));
    await repository.joinByTokenForTelegramUser(404n, oldToken, joinInput());
    await completeTavleiSession(recentToken, "character-recent-creator", recentCompletedAt);
    await completeTavleiSession(oldToken, "character-old-creator", oldCompletedAt);

    const records = await repository.listCompletedSince(new Date("2026-07-01T00:00:00.000Z"), 10);

    expect(records.map((record) => record.token)).toEqual([recentToken]);
    expect(records[0]?.completedAt).toEqual(recentCompletedAt);
    expect(records[0]?.participants.map((participant) => participant.characterId).sort()).toEqual([
      "character-recent-creator",
      "character-recent-joiner"
    ]);
  });

  it("terminalizes payout invariant failures as a failed safe refund and replays without double refund", async () => {
    await seedCharacter({ telegramUserId: 201n, characterId: "character-fail-creator", name: "Р Р°С…С–РІРЅРёРє", gold: 10 });
    await seedCharacter({ telegramUserId: 202n, characterId: "character-fail-joiner", name: "РЎРІС–РґРѕРє", gold: 10 });

    await repository.createForTelegramUser(201n, createInput("kosti", "12345678-1234-4234-9234-000000000201"));
    await repository.joinByTokenForTelegramUser(202n, "12345678-1234-4234-9234-000000000201", joinInput());
    await prisma.tavernGameSession.update({
      where: { token: "12345678-1234-4234-9234-000000000201" },
      data: { potGold: 999 }
    });

    const failed = await repository.resolveKostiForTelegramUser(201n, "12345678-1234-4234-9234-000000000201", now());
    const replay = await repository.resolveKostiForTelegramUser(201n, "12345678-1234-4234-9234-000000000201", now());

    expect(failed.state).toBe("failed-refund");
    expect(replay.state).toBe("replayed");
    const failedRow = await prisma.tavernGameSession.findUnique({
      where: { token: "12345678-1234-4234-9234-000000000201" },
      select: { status: true, completedAt: true, resultJson: true }
    });
    const failedResult = failedRow?.resultJson && typeof failedRow.resultJson === "object" && !Array.isArray(failedRow.resultJson)
      ? failedRow.resultJson as Record<string, unknown>
      : {};

    expect(failedRow?.status).toBe("failed_safe_refund");
    expect(failedRow?.completedAt).toBeInstanceOf(Date);
    expect(failedResult.kind).toBe("failed_safe_refund");
    expect(failedResult.refundedGold).toBe(6);
    await expect(prisma.tavernGameParticipant.findMany({
      where: {
        session: { token: "12345678-1234-4234-9234-000000000201" }
      },
      select: { status: true, refundedGold: true, activeStakeKey: true },
      orderBy: { joinedAt: "asc" }
    })).resolves.toEqual([
      { status: "left_refunded", refundedGold: 3, activeStakeKey: null },
      { status: "left_refunded", refundedGold: 3, activeStakeKey: null }
    ]);
    await expect(characterGold("character-fail-creator")).resolves.toBe(10);
    await expect(characterGold("character-fail-joiner")).resolves.toBe(10);
  });

  it("completes dice poker once and does not duplicate rewards on replay", async () => {
    const token = "12345678-1234-4234-9234-000000000587";
    await seedCharacter({ telegramUserId: 587n, characterId: "character-dice-poker", name: "Костяр", gold: 10 });
    const state = startQuickDicePoker("dice-poker-replay");

    const created = await repository.createDicePokerForTelegramUser(587n, {
      mode: "quick",
      token,
      seed: "dice-poker-replay",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 5 * 60_000),
      cooldownMs: 0,
      now: now(),
      state
    });
    expect(created.state).toBe("created");
    await expect(characterGold("character-dice-poker")).resolves.toBe(7);

    const terminal = {
      kind: "dice_poker" as const,
      mode: "quick" as const,
      phase: "terminal" as const,
      outcome: "win" as const,
      drawRound: 1,
      playerDice: [6, 6, 6, 6, 6],
      opponentDice: [1, 2, 3, 4, 5],
      playerHand: evaluateQuickHand([6, 6, 6, 6, 6]),
      opponentHand: evaluateQuickHand([1, 2, 3, 4, 5]),
      reason: "Покер сильніший за малий стріт."
    };
    const completed = await repository.completeDicePokerForTelegramUser(587n, token, {
      state: terminal,
      outcome: "win",
      payoutGold: 3,
      refundedGold: 0,
      now: now()
    });
    const replay = await repository.completeDicePokerForTelegramUser(587n, token, {
      state: terminal,
      outcome: "win",
      payoutGold: 3,
      refundedGold: 0,
      now: now()
    });

    expect(completed.state).toBe("completed");
    expect(replay.state).toBe("closed");
    await expect(characterGold("character-dice-poker")).resolves.toBe(10);
    await expect(prisma.tavernGameParticipant.findMany({
      where: { session: { token } },
      select: { payoutGold: true, refundedGold: true, activeStakeKey: true }
    })).resolves.toEqual([{ payoutGold: 3, refundedGold: 0, activeStakeKey: null }]);
  });

  it("keeps scorecard dice poker alive beyond quick ttl and refunds after scorecard deadline", async () => {
    const token = "12345678-1234-4234-9234-000000000588";
    await seedCharacter({ telegramUserId: 588n, characterId: "character-scorecard-expiry", name: "Табличник", gold: 10 });
    const state = startScorecardDicePoker("scorecard-expiry");
    const created = await repository.createDicePokerForTelegramUser(588n, {
      mode: "scorecard",
      token,
      seed: "scorecard-expiry",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 93 * 60_000),
      cooldownMs: 0,
      now: now(),
      state
    });
    expect(created.state).toBe("created");
    await expect(characterGold("character-scorecard-expiry")).resolves.toBe(7);

    await expect(repository.expireDue(new Date(now().getTime() + 6 * 60_000))).resolves.toBe(0);
    await expect(characterGold("character-scorecard-expiry")).resolves.toBe(7);

    await expect(repository.expireDue(new Date(now().getTime() + 94 * 60_000))).resolves.toBe(1);
    await expect(characterGold("character-scorecard-expiry")).resolves.toBe(10);
    await expect(prisma.tavernGameSession.findUnique({
      where: { token },
      select: { status: true, resultJson: true }
    })).resolves.toMatchObject({
      status: "expired_refund",
      resultJson: { kind: "dice_poker_expired", refundedGold: 3 }
    });
  });

  it("refreshes scorecard dice poker deadline on saved state changes", async () => {
    const token = "12345678-1234-4234-9234-000000000589";
    await seedCharacter({ telegramUserId: 589n, characterId: "character-scorecard-refresh", name: "Перекидач", gold: 10 });
    const state = startScorecardDicePoker("scorecard-refresh");
    const created = await repository.createDicePokerForTelegramUser(589n, {
      mode: "scorecard",
      token,
      seed: "scorecard-refresh",
      stakeGold: 3,
      maxStake: 25,
      expiresAt: new Date(now().getTime() + 93 * 60_000),
      cooldownMs: 0,
      now: now(),
      state
    });
    expect(created.state).toBe("created");

    const refreshAt = new Date(now().getTime() + 60 * 60_000);
    const refreshed = await repository.saveDicePokerStateForTelegramUser(
      589n,
      token,
      { ...state, selectedMask: 1 },
      refreshAt,
      new Date(refreshAt.getTime() + 93 * 60_000)
    );
    expect(refreshed.state).toBe("saved");

    await expect(repository.expireDue(new Date(now().getTime() + 94 * 60_000))).resolves.toBe(0);
    await expect(characterGold("character-scorecard-refresh")).resolves.toBe(7);

    await expect(repository.expireDue(new Date(now().getTime() + 154 * 60_000))).resolves.toBe(1);
    await expect(characterGold("character-scorecard-refresh")).resolves.toBe(10);
  });

  it("resets recent tavern game create cooldown without touching stakes", async () => {
    const token = "12345678-1234-4234-9234-000000000590";
    await seedCharacter({ telegramUserId: 590n, characterId: "character-create-cooldown", name: "Стільник", gold: 10 });
    const created = await repository.createForTelegramUser(590n, {
      ...createInput("tavlei", token),
      cooldownMs: 0
    });
    expect(created.state).toBe("created");
    await expect(characterGold("character-create-cooldown")).resolves.toBe(7);

    const reset = await repository.resetCreateCooldownForTelegramUser(590n, {
      now: now(),
      cooldownMs: 120_000
    });
    const openedAt = await prisma.tavernGameSession.findUnique({
      where: { token },
      select: { openedAt: true, stakeGold: true, potGold: true }
    });

    expect(reset).toEqual({ state: "reset", updated: 1 });
    expect(openedAt).toEqual({
      openedAt: new Date("2026-07-02T09:57:59.000Z"),
      stakeGold: 3,
      potGold: 3
    });
    await expect(characterGold("character-create-cooldown")).resolves.toBe(7);
  });

  function now(): Date {
    return new Date("2026-07-02T10:00:00.000Z");
  }

  function createInput(gameKey: "tavlei" | "kosti", token: string) {
    const base = now();
    return {
      gameKey,
      token,
      seed: `${gameKey}:seed:${token}`,
      stakeGold: 3,
      maxStake: 25,
      joinExpiresAt: new Date(base.getTime() + 13 * 60_000),
      decisionExpiresAt: new Date(base.getTime() + 5 * 60_000),
      cooldownMs: 0,
      now: base
    };
  }

  function joinInput() {
    const base = now();
    return {
      now: base,
      decisionExpiresAt: new Date(base.getTime() + 5 * 60_000)
    };
  }

  async function seedCharacter(input: {
    telegramUserId: bigint;
    characterId: string;
    name: string;
    gold: number;
  }): Promise<void> {
    const userId = `user-${input.characterId}`;
    await prisma.user.create({
      data: {
        id: userId,
        telegramUserId: input.telegramUserId,
        displayName: input.name,
        lastSeenLocationId: "location.korchma.bar"
      }
    });
    await prisma.character.create({
      data: {
        id: input.characterId,
        userId,
        name: input.name,
        pronoun: "they",
        path: "boundary",
        raceId: "race.human-ish",
        classId: "class.warrior",
        level: 5,
        xp: 0,
        gold: input.gold,
        hpCurrent: 25,
        hpMax: 25,
        manaCurrent: 10,
        manaMax: 10,
        statsJson: { intelligence: 7, luck: 6 }
      }
    });
  }

  async function characterGold(characterId: string): Promise<number | null> {
    const row = await prisma.character.findUnique({
      where: { id: characterId },
      select: { gold: true }
    });
    return row?.gold ?? null;
  }

  async function completeTavleiSession(token: string, winnerCharacterId: string, completedAt: Date): Promise<void> {
    const session = await prisma.tavernGameSession.findUniqueOrThrow({
      where: { token },
      select: {
        id: true,
        participants: {
          select: { characterId: true }
        }
      }
    });
    await prisma.tavernGameSession.update({
      where: { token },
      data: {
        status: "completed",
        completedAt,
        resultJson: {
          gameKey: "tavlei",
          outcome: "win",
          winnerCharacterId,
          players: session.participants.map((participant) => ({
            characterId: participant.characterId
          }))
        }
      }
    });
    await prisma.tavernGameParticipant.updateMany({
      where: { sessionId: session.id },
      data: {
        status: "completed",
        completedAt,
        activeStakeKey: null
      }
    });
  }
});

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT,
      language_code TEXT,
      last_action_at DATETIME,
      last_seen_location_id TEXT,
      current_raid_id TEXT,
      current_adventure_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE characters (
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
      active_cosmetic_title_grant_id TEXT,
      stats_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE tavern_game_sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      game_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      creator_character_id TEXT NOT NULL,
      stake_gold INTEGER NOT NULL,
      pot_gold INTEGER NOT NULL DEFAULT 0,
      seed TEXT NOT NULL,
      rules_version TEXT NOT NULL,
      result_json JSONB,
      opened_at DATETIME NOT NULL,
      join_expires_at DATETIME NOT NULL,
      decision_expires_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_character_id) REFERENCES characters(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE tavern_game_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      telegram_user_id BIGINT NOT NULL,
      display_name TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'joined',
      stake_gold INTEGER NOT NULL,
      payout_gold INTEGER NOT NULL DEFAULT 0,
      refunded_gold INTEGER NOT NULL DEFAULT 0,
      decision_json JSONB,
      result_json JSONB,
      active_stake_key TEXT UNIQUE,
      joined_at DATETIME NOT NULL,
      decided_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES tavern_game_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      UNIQUE (session_id, character_id)
    )
  `);
}
