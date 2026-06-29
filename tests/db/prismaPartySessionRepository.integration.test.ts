import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPartySessionRepository } from "../../src/db/repositories/prismaPartySessionRepository";

describe("PrismaPartySessionRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaPartySessionRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-party-repo-"));
    const databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
    await createMinimalSchema(prisma);
    repository = new PrismaPartySessionRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it("creates one live leader session and replays duplicate create", async () => {
    await seedCharacter(prisma, "leader-user", 1001n, "Лідерка");

    const created = await repository.createForTelegramUser(1001n, partyInput("party-token-a"));
    const duplicate = await repository.createForTelegramUser(1001n, partyInput("party-token-b"));

    expect(created.state).toBe("created");
    expect(duplicate.state).toBe("live");
    expect("session" in duplicate ? duplicate.session.inviteToken : null).toBe("party-token-a");
    expect(await prisma.partySession.count()).toBe(1);
    expect(await prisma.partyParticipant.count()).toBe(1);
  });

  it("joins, blocks a second live membership, and reuses left rows on rejoin", async () => {
    await seedCharacter(prisma, "leader-two-user", 2001n, "Провідник");
    await seedCharacter(prisma, "joiner-user", 2002n, "Долученець");
    await seedCharacter(prisma, "other-leader-user", 2003n, "Інша");

    const first = await repository.createForTelegramUser(2001n, partyInput("party-token-c"));
    const other = await repository.createForTelegramUser(2003n, partyInput("party-token-d"));
    expect(first.state).toBe("created");
    expect(other.state).toBe("created");

    const joined = await repository.joinByTokenForTelegramUser(2002n, "party-token-c", joinInput());
    expect(joined.state).toBe("joined");
    const blocked = await repository.joinByTokenForTelegramUser(2002n, "party-token-d", joinInput());
    expect(blocked.state).toBe("live-membership");

    const left = await repository.leaveByTokenForTelegramUser(2002n, "party-token-c", now());
    expect(left.state).toBe("left");
    const rejoined = await repository.joinByTokenForTelegramUser(2002n, "party-token-c", joinInput("dev"));

    expect(rejoined.state).toBe("joined");
    expect(await prisma.partyParticipant.count({
      where: {
        session: {
          inviteToken: "party-token-c"
        },
        character: {
          user: {
            telegramUserId: 2002n
          }
        }
      }
    })).toBe(1);
  });

  it("transfers leadership on leader leave and cancels when the last member leaves", async () => {
    await seedCharacter(prisma, "leader-three-user", 3001n, "Перша");
    await seedCharacter(prisma, "joiner-three-user", 3002n, "Друга");

    await repository.createForTelegramUser(3001n, partyInput("party-token-e"));
    await repository.joinByTokenForTelegramUser(3002n, "party-token-e", joinInput());

    const transferred = await repository.leaveByTokenForTelegramUser(3001n, "party-token-e", now());
    expect(transferred.state).toBe("leader-transferred");
    expect("session" in transferred ? transferred.session.leader.telegramUserId : null).toBe(3002n);

    const cancelled = await repository.leaveByTokenForTelegramUser(3002n, "party-token-e", now());
    expect(cancelled.state).toBe("cancelled");
    expect("session" in cancelled ? cancelled.session.status : null).toBe("cancelled");
    expect(await prisma.partySession.findUnique({
      where: { inviteToken: "party-token-e" },
      select: { activeLeaderKey: true }
    })).toEqual({ activeLeaderKey: null });
  });

  it("expires recruiting sessions and clears live membership keys", async () => {
    await seedCharacter(prisma, "leader-four-user", 4001n, "Годинникар");
    await repository.createForTelegramUser(4001n, {
      ...partyInput("party-token-f"),
      expiresAt: new Date("2026-06-29T14:59:00.000Z"),
      joinUntilAt: new Date("2026-06-29T14:59:00.000Z")
    });

    const expired = await repository.findByToken("party-token-f", now());

    expect(expired?.status).toBe("expired");
    expect(await prisma.partyParticipant.findFirst({
      where: {
        session: {
          inviteToken: "party-token-f"
        }
      },
      select: {
        activeMembershipKey: true
      }
    })).toEqual({ activeMembershipKey: null });
  });

  it("force-expires live recruiting sessions before natural expiry and replays terminal state", async () => {
    await seedCharacter(prisma, "leader-five-user", 5001n, "Девконтролер");
    await seedCharacter(prisma, "joiner-five-user", 5002n, "Тестувальник");
    const created = await repository.createForTelegramUser(5001n, partyInput("party-token-g"));
    await repository.joinByTokenForTelegramUser(5002n, "party-token-g", joinInput());

    const expired = await repository.forceExpireByToken("party-token-g", now());
    const duplicate = await repository.forceExpireByToken("party-token-g", now());
    const row = await prisma.partySession.findUnique({
      where: { inviteToken: "party-token-g" },
      select: { status: true, activeLeaderKey: true, version: true }
    });
    const activeKeys = await prisma.partyParticipant.count({
      where: {
        session: {
          inviteToken: "party-token-g"
        },
        activeMembershipKey: {
          not: null
        }
      }
    });

    expect(created.state).toBe("created");
    expect(expired?.status).toBe("expired");
    expect(duplicate?.status).toBe("expired");
    expect(row).toEqual({ status: "expired", activeLeaderKey: null, version: 2 });
    expect(activeKeys).toBe(0);
  });
});

function now(): Date {
  return new Date("2026-06-29T15:00:00.000Z");
}

function partyInput(inviteToken: string) {
  return {
    inviteToken,
    participantCap: 8,
    minimumParticipants: 1,
    joinUntilAt: new Date("2026-06-29T15:13:00.000Z"),
    expiresAt: new Date("2026-06-29T15:13:00.000Z"),
    now: now(),
    periodId: "12026-06-29",
    originLocationId: "korchma.board",
    chatId: 587n,
    messageId: 13
  };
}

function joinInput(joinSource: "nearby" | "deep-link" | "dev" = "deep-link") {
  return {
    joinSource,
    now: now(),
    chatId: 587n,
    messageId: 23
  };
}

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  telegramUserId: bigint,
  name: string
): Promise<void> {
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      lastSeenLocationId: "korchma.board",
      character: {
        create: {
          id: `${userId}-character`,
          name,
          raceId: "human",
          classId: "warrior",
          statsJson: {}
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
    `CREATE UNIQUE INDEX party_sessions_invite_token_key ON party_sessions(invite_token)`,
    `CREATE UNIQUE INDEX party_sessions_active_leader_key_key ON party_sessions(active_leader_key)`,
    `CREATE INDEX party_sessions_status_expires_at_idx ON party_sessions(status, expires_at)`,
    `CREATE UNIQUE INDEX party_participants_active_membership_key_key ON party_participants(active_membership_key)`,
    `CREATE UNIQUE INDEX party_participants_session_id_character_id_key ON party_participants(session_id, character_id)`,
    `CREATE INDEX party_participants_character_id_status_idx ON party_participants(character_id, status)`,
    `CREATE INDEX party_participants_session_id_status_idx ON party_participants(session_id, status)`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
