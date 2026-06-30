import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPartyBossRepository } from "../../src/db/repositories/prismaPartyBossRepository";
import { PrismaPartySessionRepository } from "../../src/db/repositories/prismaPartySessionRepository";
import type {
  PartyBossActionResult,
  PartyBossSessionRecord
} from "../../src/db/repositories/partyBossRepository";

function expectPartyBossSession(result: PartyBossActionResult): PartyBossSessionRecord {
  if (!("session" in result)) {
    throw new Error(`Expected party boss session result, got ${result.state}`);
  }

  return result.session;
}

describe("PrismaPartyBossRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let partyRepository: PrismaPartySessionRepository;
  let bossRepository: PrismaPartyBossRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-party-boss-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    partyRepository = new PrismaPartySessionRepository(prisma);
    bossRepository = new PrismaPartyBossRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("starts from recruiting party, dedupes actions, and timeout-resolves past the old cap without terminalizing by turn count", async () => {
    await seedCharacter(prisma, "leader-user", 1001n, "Лідерка", { hp: 300 });
    await seedCharacter(prisma, "joiner-user", 1002n, "Помічник", { hp: 300 });
    await partyRepository.createForTelegramUser(1001n, partyInput("party-token-a"));
    await partyRepository.joinByTokenForTelegramUser(1002n, "party-token-a", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(1001n, {
      partyInviteToken: "party-token-a",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss" } })).toBe(2);

    const first = await bossRepository.submitActionForTelegramUser(1001n, "party-token-a", 1, "attack", resolveInput());
    const duplicate = await bossRepository.submitActionForTelegramUser(1001n, "party-token-a", 1, "defend", resolveInput());

    expect(first.state).toBe("queued");
    expect(duplicate.state).toBe("duplicate");
    expect(await prisma.partyBossAction.count()).toBe(1);

    let latest = expectPartyBossSession(duplicate);
    for (let turn = latest.turn; turn <= 6; turn += 1) {
      const resolved = await bossRepository.resolveTimedOutByToken("party-token-a", {
        now: new Date(`2026-06-30T10:0${turn}:00.000Z`),
        nextTurnExpiresAt: new Date(`2026-06-30T10:0${turn}:23.000Z`)
      });
      expect(resolved.state).toBe("resolved");
      latest = expectPartyBossSession(resolved);
    }

    expect(latest.status).toBe("active");
    expect(latest.turn).toBe(7);
    expect(latest.state.boss.hp).toBeGreaterThan(0);
    expect(latest.state.participants.some((participant) => participant.resources.hp > 0)).toBe(true);
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss" } })).toBe(2);
    expect(await prisma.partyParticipant.count({
      where: {
        activeMembershipKey: {
          not: null
        }
      }
    })).toBe(2);
  });

  it("releases leases and live party keys when timeout resolution knocks out all participants", async () => {
    await seedCharacter(prisma, "knockout-leader-user", 2001n, "Крихка Лідерка", { hp: 1 });
    await seedCharacter(prisma, "knockout-joiner-user", 2002n, "Крихкий Помічник", { hp: 1 });
    await partyRepository.createForTelegramUser(2001n, partyInput("party-token-knockout"));
    await partyRepository.joinByTokenForTelegramUser(2002n, "party-token-knockout", joinInput());

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(2001n, {
      partyInviteToken: "party-token-knockout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });

    expect(started.state).toBe("started");
    const resolved = await bossRepository.resolveTimedOutByToken("party-token-knockout", {
      now: new Date("2026-06-30T10:01:00.000Z"),
      nextTurnExpiresAt: new Date("2026-06-30T10:01:23.000Z")
    });
    const latest = expectPartyBossSession(resolved);

    expect(resolved.state).toBe("resolved");
    expect(latest.status).toBe("lost");
    expect(await prisma.activeCombatLease.count({ where: { kind: "party-boss", referenceId: latest.partySessionId } })).toBe(0);
    expect(await prisma.partyParticipant.count({
      where: {
        sessionId: latest.partySessionId,
        activeMembershipKey: {
          not: null
        }
      }
    })).toBe(0);
  });

  it("treats knocked-out participant action callbacks as stale without creating an action row", async () => {
    await seedCharacter(prisma, "stale-knockout-leader-user", 3001n, "Вибита Лідерка", { hp: 25 });
    await partyRepository.createForTelegramUser(3001n, partyInput("party-token-stale-knockout"));

    const started = await bossRepository.startFromRecruitingPartyForTelegramUser(3001n, {
      partyInviteToken: "party-token-stale-knockout",
      now: now(),
      turnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
    });
    if (!("session" in started)) {
      throw new Error(`Expected started session, got ${started.state}`);
    }

    const knockedOutState = {
      ...started.session.state,
      participants: started.session.state.participants.map((participant) => ({
        ...participant,
        status: "knocked-out" as const,
        resources: {
          ...participant.resources,
          hp: 0
        }
      }))
    };
    await prisma.partyBossSession.update({
      where: { id: started.session.id },
      data: {
        stateJson: knockedOutState
      }
    });

    const stale = await bossRepository.submitActionForTelegramUser(
      3001n,
      "party-token-stale-knockout",
      1,
      "attack",
      resolveInput()
    );

    expect(stale.state).toBe("stale");
    expect(await prisma.partyBossAction.count({ where: { sessionId: started.session.id } })).toBe(0);
  });
});

function now(): Date {
  return new Date("2026-06-30T10:00:00.000Z");
}

function resolveInput() {
  return {
    now: now(),
    nextTurnExpiresAt: new Date("2026-06-30T10:00:23.000Z")
  };
}

function partyInput(inviteToken: string) {
  return {
    inviteToken,
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-30T10:13:00.000Z"),
    expiresAt: new Date("2026-06-30T10:13:00.000Z"),
    now: now(),
    periodId: "12026-06-30",
    originLocationId: "korchma.board",
    chatId: 587n,
    messageId: 13
  };
}

function joinInput() {
  return {
    joinSource: "deep-link" as const,
    now: now(),
    chatId: 587n,
    messageId: 23
  };
}

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  telegramUserId: bigint,
  name: string,
  options: { hp?: number } = {}
): Promise<void> {
  const hp = options.hp ?? 25;
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      lastSeenLocationId: "korchma.board",
      character: {
        create: {
          id: `${userId}-character`,
          name,
          raceId: "race.human-ish",
          classId: "class.warrior",
          level: 3,
          hpCurrent: hp,
          hpMax: hp,
          statsJson: {
            strength: 8,
            dexterity: 6,
            intelligence: 5,
            charisma: 5,
            luck: 5
          }
        }
      }
    }
  });
}

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
      active_cosmetic_title_grant_id TEXT,
      stats_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE character_remorts (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      remort_number INTEGER NOT NULL,
      previous_level INTEGER NOT NULL,
      previous_xp INTEGER NOT NULL,
      previous_gold INTEGER NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      preserved_payload_json JSONB NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE active_combat_leases (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_sessions (
      id TEXT PRIMARY KEY,
      invite_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'recruiting',
      leader_character_id TEXT NOT NULL,
      period_id TEXT,
      origin_location_id TEXT,
      participant_cap INTEGER NOT NULL DEFAULT 8,
      minimum_participants INTEGER NOT NULL DEFAULT 1,
      join_until_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      active_leader_key TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      remort_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'joined',
      join_source TEXT NOT NULL,
      joined_at DATETIME NOT NULL,
      left_at DATETIME,
      snapshot_json JSONB,
      chat_id INTEGER,
      message_id INTEGER,
      active_membership_key TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_sessions (
      id TEXT PRIMARY KEY,
      party_session_id TEXT NOT NULL,
      leader_character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      turn INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      rules_version TEXT NOT NULL,
      boss_key TEXT NOT NULL,
      state_json JSONB NOT NULL,
      result_json JSONB,
      turn_expires_at DATETIME NOT NULL,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE party_boss_actions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      actor_character_id TEXT NOT NULL,
      turn INTEGER NOT NULL,
      action_key TEXT NOT NULL,
      result_json JSONB,
      submitted_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX party_sessions_invite_token_key ON party_sessions(invite_token)`,
    `CREATE UNIQUE INDEX party_sessions_active_leader_key_key ON party_sessions(active_leader_key)`,
    `CREATE UNIQUE INDEX party_participants_active_membership_key_key ON party_participants(active_membership_key)`,
    `CREATE UNIQUE INDEX party_participants_session_id_character_id_key ON party_participants(session_id, character_id)`,
    `CREATE UNIQUE INDEX party_boss_sessions_party_session_id_key ON party_boss_sessions(party_session_id)`,
    `CREATE UNIQUE INDEX party_boss_actions_session_id_turn_actor_character_id_key ON party_boss_actions(session_id, turn, actor_character_id)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
