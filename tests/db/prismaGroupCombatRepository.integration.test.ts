import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaGroupCombatRepository } from "../../src/db/repositories/prismaGroupCombatRepository";
import { PrismaCharacterRepository } from "../../src/db/repositories/prismaCharacterRepository";

const NOW = new Date("2026-07-22T10:00:00.000Z");
const QUERY_BUDGETS = {
  start: 30,
  queue: 16,
  resolve: 35,
  dueScan: 1
} as const;
const actualQueryCounts: Partial<Record<keyof typeof QUERY_BUDGETS, number>> = {};

describe("PrismaGroupCombatRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaGroupCombatRepository;
  let queries: string[];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-group-combat-"));
    prisma = new PrismaClient({
      datasources: { db: { url: `file:${join(dir, "test.db").replace(/\\/g, "/")}` } },
      log: [{ emit: "event", level: "query" }]
    });
    queries = [];
    prisma.$on("query", (event: { query: string }) => queries.push(event.query));
    await createMinimalSchema(prisma);
    await applyGroupCombatMigration(prisma);
    repository = new PrismaGroupCombatRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("atomically starts 2x2, freezes the same-life roster, and blocks partial invalid starts", async () => {
    await seedParty(prisma, "group-start", [1101n, 1102n]);
    const before = await resourceSnapshot(prisma, [1101n, 1102n]);
    queries.length = 0;
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1101n,
      partyInviteToken: "group-start",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const startQueries = queries.length;
    actualQueryCounts.start = startQueries;

    expect(started.state).toBe("started");
    expect(startQueries).toBeLessThanOrEqual(QUERY_BUDGETS.start);
    expect("session" in started ? started.session.state.enemies : []).toHaveLength(2);
    expect(await prisma.activeCombatLease.count({ where: { kind: "group-combat" } })).toBe(2);
    expect(await resourceSnapshot(prisma, [1101n, 1102n])).toEqual(before);
    await expect(new PrismaCharacterRepository(prisma).restartByTelegramUserId(1101n)).resolves.toBe("active-combat");

    await seedParty(prisma, "group-four", [1201n, 1202n, 1203n, 1204n]);
    const invalid = await repository.startProofForTelegramUser({
      telegramUserId: 1201n,
      partyInviteToken: "group-four",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(invalid.state).toBe("invalid-size");
    expect(await prisma.groupCombatSession.count({ where: { partySession: { inviteToken: "group-four" } } })).toBe(0);
    expect(await prisma.activeCombatLease.count({ where: { character: { user: { telegramUserId: { in: [1201n, 1202n, 1203n, 1204n] } } } } })).toBe(0);

    await seedParty(prisma, "group-wrong-life", [1211n, 1212n]);
    await prisma.partyParticipant.update({
      where: { activeMembershipKey: "party-member:group-wrong-life-user-1-character" },
      data: { remortCount: 1 }
    });
    const wrongLife = await repository.startProofForTelegramUser({
      telegramUserId: 1211n,
      partyInviteToken: "group-wrong-life",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(wrongLife.state).toBe("invalid-life");
    expect(await prisma.groupCombatSession.count({ where: { partySession: { inviteToken: "group-wrong-life" } } })).toBe(0);

    await seedParty(prisma, "group-busy", [1221n, 1222n]);
    await prisma.activeCombatLease.create({
      data: {
        id: "group-busy-existing-lease",
        characterId: "group-busy-user-1-character",
        kind: "solo-combat",
        referenceId: "existing-solo-combat"
      }
    });
    const busy = await repository.startProofForTelegramUser({
      telegramUserId: 1221n,
      partyInviteToken: "group-busy",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(busy.state).toBe("blocked");
    expect(await prisma.groupCombatSession.count({ where: { partySession: { inviteToken: "group-busy" } } })).toBe(0);
    expect(await prisma.activeCombatLease.count({
      where: { characterId: { in: ["group-busy-user-0-character", "group-busy-user-1-character"] } }
    })).toBe(1);
  });

  it("rejects wrong-side and stale targets without writes, then resolves a duplicate last-action race once", async () => {
    const session = await repository.findByPartyInviteToken("group-start");
    expect(session).not.toBeNull();
    const initial = session!;
    const leader = initial.participants[0]!;
    const joiner = initial.participants[1]!;

    const beforeActions = await prisma.groupCombatAction.count();
    const invalid = await repository.submitActionForTelegramUser({
      telegramUserId: leader.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: initial.turn,
      action: "attack",
      targetKind: "ally",
      targetId: joiner.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(invalid.state).toBe("invalid-target");
    expect(await prisma.groupCombatAction.count()).toBe(beforeActions);

    queries.length = 0;
    const queued = await repository.submitActionForTelegramUser({
      telegramUserId: leader.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: initial.turn,
      action: "attack",
      targetKind: "enemy",
      targetId: initial.state.enemies[0]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const queueQueries = queries.length;
    actualQueryCounts.queue = queueQueries;
    expect(queued.state).toBe("queued");
    expect(queueQueries).toBeLessThanOrEqual(QUERY_BUDGETS.queue);

    const submitLast = () => repository.submitActionForTelegramUser({
      telegramUserId: joiner.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: initial.turn,
      action: "guard" as const,
      targetKind: "self" as const,
      targetId: joiner.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    queries.length = 0;
    const results = await Promise.all([submitLast(), submitLast()]);
    const resolveQueries = queries.length;
    actualQueryCounts.resolve = resolveQueries;
    const latest = await repository.findByPartyInviteToken("group-start");

    expect(results.some((result) => result.state === "resolved")).toBe(true);
    expect(latest?.turn).toBe(2);
    expect(await prisma.groupCombatAction.count({ where: { sessionId: initial.id, turn: 1 } })).toBe(2);
    expect(resolveQueries).toBeLessThanOrEqual(QUERY_BUDGETS.resolve * 2);

    const stale = await repository.submitActionForTelegramUser({
      telegramUserId: leader.telegramUserId,
      partyInviteToken: initial.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: leader.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(stale.state).toBe("stale");
  });

  it("uses a lean due scan and a resource-free timeout fallback", async () => {
    const before = await resourceSnapshot(prisma, [1101n, 1102n]);
    await prisma.groupCombatSession.updateMany({
      where: { partySession: { inviteToken: "group-start" } },
      data: { turnExpiresAt: new Date(NOW.getTime() - 1) }
    });
    queries.length = 0;
    const ids = await repository.listDueSessionIds(NOW, 13);
    const dueQueries = queries.length;
    actualQueryCounts.dueScan = dueQueries;
    expect(ids).toHaveLength(1);
    expect(dueQueries).toBe(QUERY_BUDGETS.dueScan);

    const result = await repository.resolveTimedOutSession({
      sessionId: ids[0]!,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(result.state).toBe("resolved");
    expect("session" in result ? result.session.queuedActions : []).toHaveLength(0);
    expect(await resourceSnapshot(prisma, [1101n, 1102n])).toEqual(before);
    expect(await prisma.characterItem.count()).toBe(0);
  });

  it("resolves an action-versus-timeout overlap at most once", async () => {
    await seedParty(prisma, "group-race", [1251n, 1252n]);
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1251n,
      partyInviteToken: "group-race",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() - 1)
    });
    if (!("session" in started)) {
      throw new Error(`Expected started group race, got ${started.state}`);
    }
    const session = started.session;
    const first = session.participants[0]!;
    const second = session.participants[1]!;
    await repository.submitActionForTelegramUser({
      telegramUserId: first.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "guard",
      targetKind: "self",
      targetId: first.characterId,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    await prisma.groupCombatSession.update({
      where: { id: session.id },
      data: { turnExpiresAt: new Date(NOW.getTime() - 1) }
    });

    const [manual, timeout] = await Promise.all([
      repository.submitActionForTelegramUser({
        telegramUserId: second.telegramUserId,
        partyInviteToken: session.partyInviteToken,
        turn: 1,
        action: "attack",
        targetKind: "enemy",
        targetId: session.state.enemies[0]!.id,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      }),
      repository.resolveTimedOutSession({
        sessionId: session.id,
        now: NOW,
        nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
      })
    ]);
    const latest = await repository.findByPartyInviteToken(session.partyInviteToken);
    expect([manual.state, timeout.state]).toContain("resolved");
    expect(latest?.turn).toBe(2);
    expect(await prisma.groupCombatAction.count({ where: { sessionId: session.id, turn: 1 } })).toBe(2);
    expect(await prisma.groupCombatParticipant.findMany({
      where: { sessionId: session.id },
      select: { contributionJson: true }
    })).toHaveLength(2);
  });

  it("settles a normal victory with no economy writes and releases every lock", async () => {
    await seedParty(prisma, "group-win", [1271n, 1272n]);
    const before = await resourceSnapshot(prisma, [1271n, 1272n]);
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1271n,
      partyInviteToken: "group-win",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    if (!("session" in started)) {
      throw new Error(`Expected started group win, got ${started.state}`);
    }
    const session = started.session;
    const state = {
      ...session.state,
      enemies: session.state.enemies.map((enemy) => ({ ...enemy, hp: 1, hpMax: 1, defense: 0 }))
    };
    await prisma.groupCombatSession.update({ where: { id: session.id }, data: { stateJson: state } });
    const first = session.participants[0]!;
    const second = session.participants[1]!;
    await repository.submitActionForTelegramUser({
      telegramUserId: first.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: state.enemies[0]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    const terminal = await repository.submitActionForTelegramUser({
      telegramUserId: second.telegramUserId,
      partyInviteToken: session.partyInviteToken,
      turn: 1,
      action: "attack",
      targetKind: "enemy",
      targetId: state.enemies[1]!.id,
      now: NOW,
      nextTurnExpiresAt: new Date(NOW.getTime() + 23_000)
    });

    expect(terminal.state).toBe("terminal");
    expect("session" in terminal ? terminal.session.result : null).toEqual({
      kind: "rewardless-proof",
      outcome: "won",
      completedTurn: 1,
      rewards: { xp: 0, gold: 0, items: [] }
    });
    expect(await prisma.activeCombatLease.count({ where: { referenceId: session.id } })).toBe(0);
    expect(await resourceSnapshot(prisma, [1271n, 1272n])).toEqual(before);
    expect(await prisma.characterItem.count({ where: { character: { user: { telegramUserId: { in: [1271n, 1272n] } } } } })).toBe(0);
  });

  it("CAS-invalidates malformed state, releases all leases, and writes only rewardless proof", async () => {
    await seedParty(prisma, "group-broken", [1301n, 1302n, 1303n]);
    const started = await repository.startProofForTelegramUser({
      telegramUserId: 1301n,
      partyInviteToken: "group-broken",
      now: NOW,
      turnExpiresAt: new Date(NOW.getTime() + 23_000)
    });
    expect(started.state).toBe("started");
    const sessionId = "session" in started ? started.session.id : "";
    await prisma.groupCombatSession.update({
      where: { id: sessionId },
      data: { rulesVersion: "group-combat.future" }
    });

    expect(await repository.repairInvalidOrOrphaned(NOW, 13)).toBeGreaterThanOrEqual(1);
    const row = await prisma.groupCombatSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row.status).toBe("invalid");
    expect(row.resultJson).toEqual({
      kind: "rewardless-proof",
      outcome: "invalid",
      completedTurn: 1,
      rewards: { xp: 0, gold: 0, items: [] }
    });
    expect(await prisma.activeCombatLease.count({ where: { referenceId: sessionId } })).toBe(0);
    expect(await prisma.partySession.findFirstOrThrow({ where: { inviteToken: "group-broken" }, select: { status: true } })).toEqual({ status: "completed" });
  });

  it("reports actual query-event budgets", () => {
    console.info("Group combat query-event counts", actualQueryCounts, "budgets", QUERY_BUDGETS);
  });
});

async function seedParty(prisma: PrismaClient, token: string, telegramIds: bigint[]): Promise<void> {
  for (const [index, telegramUserId] of telegramIds.entries()) {
    const userId = `${token}-user-${index}`;
    await prisma.user.create({
      data: {
        id: userId,
        telegramUserId,
        character: {
          create: {
            id: `${userId}-character`,
            name: `Пригодник ${index + 1}`,
            raceId: "race.human-ish",
            classId: index === 1 ? "class.bard" : "class.warrior",
            level: 3,
            xp: 42,
            gold: 93,
            hpCurrent: 30,
            hpMax: 30,
            manaCurrent: 13,
            manaMax: 13,
            statsJson: { strength: 8, dexterity: 6, intelligence: 7, charisma: 7, luck: 5 },
            equipment: { create: [{ slot: "weapon", itemId: "item.rusty-sword" }] }
          }
        }
      }
    });
  }
  const leaderCharacterId = `${token}-user-0-character`;
  await prisma.partySession.create({
    data: {
      id: `${token}-party`,
      inviteToken: token,
      status: "recruiting",
      leaderCharacterId,
      originLocationId: "korchma.board",
      participantCap: Math.max(3, telegramIds.length),
      minimumParticipants: 2,
      joinUntilAt: new Date(NOW.getTime() + 13 * 60_000),
      expiresAt: new Date(NOW.getTime() + 13 * 60_000),
      activeLeaderKey: `party-leader:${leaderCharacterId}`,
      participants: {
        create: telegramIds.map((_, index) => ({
          id: `${token}-participant-${index}`,
          characterId: `${token}-user-${index}-character`,
          remortCount: 0,
          status: "joined",
          joinSource: index === 0 ? "leader" : "dev",
          joinedAt: new Date(NOW.getTime() + index),
          chatId: telegramIds[index],
          activeMembershipKey: `party-member:${token}-user-${index}-character`
        }))
      }
    }
  });
}

async function resourceSnapshot(prisma: PrismaClient, telegramIds: bigint[]) {
  return prisma.character.findMany({
    where: { user: { telegramUserId: { in: telegramIds } } },
    orderBy: { id: "asc" },
    select: { id: true, hpCurrent: true, manaCurrent: true, xp: true, gold: true }
  });
}

async function applyGroupCombatMigration(prisma: PrismaClient): Promise<void> {
  const sql = await readFile(resolve("prisma/migrations/20260722090000_group_combat_proof/migration.sql"), "utf8");
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function createMinimalSchema(prisma: PrismaClient): Promise<void> {
  for (const statement of [
    `CREATE TABLE users (
      id TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL UNIQUE, username TEXT, display_name TEXT,
      language_code TEXT, last_action_at DATETIME, last_seen_location_id TEXT, current_raid_id TEXT,
      current_adventure_id TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE characters (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pronoun TEXT NOT NULL DEFAULT 'they',
      path TEXT NOT NULL DEFAULT 'boundary', race_id TEXT NOT NULL, class_id TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, gold INTEGER NOT NULL DEFAULT 0,
      hp_current INTEGER NOT NULL DEFAULT 25, hp_max INTEGER NOT NULL DEFAULT 25,
      mana_current INTEGER NOT NULL DEFAULT 10, mana_max INTEGER NOT NULL DEFAULT 10,
      hp_regen_at DATETIME, mana_regen_at DATETIME, active_cosmetic_title_grant_id TEXT,
      stats_json JSONB NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE, remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL, previous_xp INTEGER NOT NULL, previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL, preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_equipment (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, slot TEXT NOT NULL, item_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_items (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, item_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_cooldowns (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL, available_at DATETIME NOT NULL,
      result_json JSONB, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_sessions (
      id TEXT PRIMARY KEY, invite_token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'recruiting',
      leader_character_id TEXT NOT NULL, period_id TEXT, origin_location_id TEXT,
      participant_cap INTEGER NOT NULL DEFAULT 8, minimum_participants INTEGER NOT NULL DEFAULT 1,
      join_until_at DATETIME NOT NULL, expires_at DATETIME NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      chat_revision INTEGER NOT NULL DEFAULT 0, raid_chat_retention_until DATETIME, active_leader_key TEXT UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_participants (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, character_id TEXT NOT NULL, remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'joined', join_source TEXT NOT NULL, joined_at DATETIME NOT NULL, left_at DATETIME,
      snapshot_json JSONB, chat_id INTEGER, message_id INTEGER, active_membership_key TEXT UNIQUE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_sessions (
      id TEXT PRIMARY KEY, party_session_id TEXT NOT NULL UNIQUE, leader_character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', turn INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
      rules_version TEXT NOT NULL, boss_key TEXT NOT NULL, state_json JSONB NOT NULL, result_json JSONB,
      turn_expires_at DATETIME NOT NULL, completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX party_participants_session_id_character_id_key ON party_participants(session_id, character_id)`,
    `CREATE UNIQUE INDEX character_equipment_character_id_slot_key ON character_equipment(character_id, slot)`,
    `CREATE UNIQUE INDEX character_cooldowns_character_id_key_key ON character_cooldowns(character_id, key)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
