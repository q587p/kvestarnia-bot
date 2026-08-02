import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaGuildRepository } from "../../src/db/repositories/prismaGuildRepository";
import { GUILD_CREATION_GOLD } from "../../src/domain/guild";

const MIGRATION = "20260802230000_guild_foundation";
const NOW = new Date("2026-08-02T20:00:00.000Z");

describe("PrismaGuildRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let repository: PrismaGuildRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-guild-repo-"));
    prisma = createPrisma(join(dir, "test.db"));
    await createBaseSchema(prisma);
    await applySqlFile(prisma, `prisma/migrations/${MIGRATION}/migration.sql`);
    repository = new PrismaGuildRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("makes competing normalized-name creates race-safe and charges only the winner once", async () => {
    await seedCharacter(prisma, "create-a", 44_001n, "Коваль А", 1_000);
    await seedCharacter(prisma, "create-b", 44_002n, "Коваль Б", 1_000);
    const first = await createIntent(repository, 44_001n, "create-token-a", "Вареничний Статут", "вареничний статут");
    const second = await createIntent(repository, 44_002n, "create-token-b", "ВАРЕНИЧНИЙ  СТАТУТ", "вареничний статут");
    expect(first.state).toBe("ready");
    expect(second.state).toBe("ready");

    const results = await Promise.all([
      repository.confirmCreateForTelegramUser(44_001n, "create-token-a", NOW),
      repository.confirmCreateForTelegramUser(44_002n, "create-token-b", NOW)
    ]);
    expect(results.filter((result) => result.state === "created")).toHaveLength(1);
    expect(results.filter((result) => result.state === "name-taken")).toHaveLength(1);

    const winnerId = results[0].state === "created" ? 44_001n : 44_002n;
    const loserId = winnerId === 44_001n ? 44_002n : 44_001n;
    await expect(goldFor(prisma, winnerId)).resolves.toBe(1_000 - GUILD_CREATION_GOLD);
    await expect(goldFor(prisma, loserId)).resolves.toBe(1_000);
    const winnerToken = winnerId === 44_001n ? "create-token-a" : "create-token-b";
    const replay = await repository.confirmCreateForTelegramUser(winnerId, winnerToken, NOW);
    expect(replay.state).toBe("replayed");
    await expect(goldFor(prisma, winnerId)).resolves.toBe(1_000 - GUILD_CREATION_GOLD);
    await expect(prisma.guild.count({ where: { status: "active" } })).resolves.toBe(1);
  });

  it("lets only one competing invite acceptance claim the durable user membership", async () => {
    await seedCharacter(prisma, "accept-leader-a", 45_001n, "Провідник А", 1_000);
    await seedCharacter(prisma, "accept-leader-b", 45_002n, "Провідник Б", 1_000);
    await seedCharacter(prisma, "accept-target", 45_003n, "Точна Ціль", 0);
    await createAndConfirm(repository, 45_001n, "accept-guild-a", "Гурт А", "гурт а");
    await createAndConfirm(repository, 45_002n, "accept-guild-b", "Гурт Б", "гурт б");
    const inviteA = await repository.createInviteForTelegramUser(45_001n, {
      token: "accept-invite-a",
      targetName: "Точна Ціль",
      now: NOW,
      expiresAt: plusHours(23)
    });
    const inviteB = await repository.createInviteForTelegramUser(45_002n, {
      token: "accept-invite-b",
      targetName: "Точна Ціль",
      now: NOW,
      expiresAt: plusHours(23)
    });
    expect(inviteA.state).toBe("created");
    expect(inviteB.state).toBe("created");

    const results = await Promise.all([
      repository.acceptInviteForTelegramUser(45_003n, "accept-invite-a", NOW),
      repository.acceptInviteForTelegramUser(45_003n, "accept-invite-b", NOW)
    ]);
    expect(results.filter((result) => result.state === "accepted")).toHaveLength(1);
    expect(results.some((result) =>
      result.state === "already-in-guild" || result.state === "replayed" || result.state === "cancelled"
    )).toBe(true);
    await expect(prisma.guildMember.count({ where: { userId: "accept-target" } })).resolves.toBe(1);
    const acceptedToken = results[0].state === "accepted" ? "accept-invite-a" : "accept-invite-b";
    await expect(repository.acceptInviteForTelegramUser(45_003n, acceptedToken, NOW)).resolves.toMatchObject({
      state: "replayed"
    });
  });

  it("makes decline, reinvite, cancel and expiry terminal and replay-safe", async () => {
    await seedCharacter(prisma, "lifecycle-leader", 45_101n, "Провідник Життєпису", 1_000);
    await seedCharacter(prisma, "lifecycle-target", 45_102n, "Ціль Життєпису", 0);
    await createAndConfirm(repository, 45_101n, "lifecycle-guild", "Статут Життєпису", "статут життєпису");
    await repository.createInviteForTelegramUser(45_101n, {
      token: "lifecycle-decline",
      targetName: "Ціль Життєпису",
      now: NOW,
      expiresAt: plusHours(23)
    });
    await expect(repository.declineInviteForTelegramUser(45_102n, "lifecycle-decline", NOW))
      .resolves.toEqual({ state: "declined" });
    await expect(repository.declineInviteForTelegramUser(45_102n, "lifecycle-decline", NOW))
      .resolves.toEqual({ state: "declined" });

    const later = new Date(NOW.getTime() + 24_000);
    await expect(repository.createInviteForTelegramUser(45_101n, {
      token: "lifecycle-cancel",
      targetName: "Ціль Життєпису",
      now: later,
      expiresAt: new Date(later.getTime() + 23 * 60 * 60 * 1000)
    })).resolves.toMatchObject({ state: "created" });
    await expect(repository.cancelInviteForTelegramUser(45_101n, "lifecycle-cancel", later))
      .resolves.toEqual({ state: "cancelled" });
    await expect(repository.cancelInviteForTelegramUser(45_101n, "lifecycle-cancel", later))
      .resolves.toEqual({ state: "cancelled" });

    const muchLater = new Date(later.getTime() + 24_000);
    await repository.createInviteForTelegramUser(45_101n, {
      token: "lifecycle-expire",
      targetName: "Ціль Життєпису",
      now: muchLater,
      expiresAt: new Date(muchLater.getTime() + 1_000)
    });
    await expect(repository.acceptInviteForTelegramUser(
      45_102n,
      "lifecycle-expire",
      new Date(muchLater.getTime() + 1_001)
    )).resolves.toEqual({ state: "expired" });
    await expect(repository.acceptInviteForTelegramUser(
      45_102n,
      "lifecycle-expire",
      new Date(muchLater.getTime() + 2_000)
    )).resolves.toEqual({ state: "expired" });
  });

  it("preserves membership across remort and deterministically succeeds an officer after leader leave", async () => {
    await seedCharacter(prisma, "succession-leader", 46_001n, "Стара Провідниця", 1_000);
    await seedCharacter(prisma, "succession-member", 46_002n, "Майбутній Провідник", 0);
    await createAndConfirm(repository, 46_001n, "succession-guild", "Печатка Наступности", "печатка наступности");
    await repository.createInviteForTelegramUser(46_001n, {
      token: "succession-invite",
      targetName: "Майбутній Провідник",
      now: NOW,
      expiresAt: plusHours(23)
    });
    await repository.acceptInviteForTelegramUser(46_002n, "succession-invite", NOW);
    const leaderHub = await repository.getHubForTelegramUser(46_001n, NOW);
    if (leaderHub.state !== "ready") {
      throw new Error("Expected leader guild hub.");
    }
    const target = leaderHub.guild.members.find((member) => member.name === "Майбутній Провідник")!;
    const promoted = await repository.setMemberRoleForTelegramUser(
      46_001n,
      target.id,
      "officer",
      leaderHub.guild.version,
      NOW
    );
    expect(promoted.state).toBe("updated");
    const promotedVersion = promoted.state === "updated" ? promoted.guild.version : -1;
    await expect(repository.setMemberRoleForTelegramUser(
      46_001n,
      target.id,
      "member",
      leaderHub.guild.version,
      NOW
    )).resolves.toEqual({ state: "stale" });

    await prisma.characterRemort.create({
      data: {
        id: "succession-member-remort",
        characterId: "succession-member-character",
        token: "succession-member-remort-token",
        remortNumber: 1,
        previousLevel: 13,
        previousXp: 587,
        previousGold: 42,
        displayNameSnapshot: "Майбутній Провідник",
        preservedPayloadJson: {}
      }
    });
    const restartedRepository = new PrismaGuildRepository(prisma);
    const afterRestart = await restartedRepository.getHubForTelegramUser(46_002n, NOW);
    expect(afterRestart.state).toBe("ready");
    expect(afterRestart.state === "ready"
      ? afterRestart.guild.members.some((member) => member.name === "Майбутній Провідник")
      : false).toBe(true);
    await expect(prisma.characterRemort.count({
      where: { characterId: "succession-member-character" }
    })).resolves.toBe(1);

    const left = await restartedRepository.leaveForTelegramUser(46_001n, promotedVersion, NOW);
    expect(left).toMatchObject({ state: "left", successorName: "Майбутній Провідник" });
    const successorHub = await restartedRepository.getHubForTelegramUser(46_002n, NOW);
    expect(successorHub.state === "ready" ? successorHub.guild.viewerRole : null).toBe("leader");
    await expect(prisma.guildMember.count({ where: { userId: "succession-leader" } })).resolves.toBe(0);
  });

  it("keeps party and group-combat rows isolated from kick, leave and soft guild deletion", async () => {
    await seedCharacter(prisma, "isolation-leader", 47_001n, "Ізоляційний Провідник", 1_000);
    await seedCharacter(prisma, "isolation-member", 47_002n, "Ізоляційна Учасниця", 0);
    await createAndConfirm(repository, 47_001n, "isolation-guild", "Окрема Печатка", "окрема печатка");
    await repository.createInviteForTelegramUser(47_001n, {
      token: "isolation-invite",
      targetName: "Ізоляційна Учасниця",
      now: NOW,
      expiresAt: plusHours(23)
    });
    await repository.acceptInviteForTelegramUser(47_002n, "isolation-invite", NOW);
    await prisma.$executeRawUnsafe("INSERT INTO party_sessions (id) VALUES ('guild-isolation-party')");
    await prisma.$executeRawUnsafe("INSERT INTO group_combat_sessions (id, party_session_id) VALUES ('guild-isolation-combat', 'guild-isolation-party')");

    const hub = await repository.getHubForTelegramUser(47_001n, NOW);
    if (hub.state !== "ready") {
      throw new Error("Expected isolation guild hub.");
    }
    const member = hub.guild.members.find((row) => row.name === "Ізоляційна Учасниця")!;
    const kicked = await repository.kickMemberForTelegramUser(47_001n, member.id, hub.guild.version, NOW);
    expect(kicked.state).toBe("updated");
    const version = kicked.state === "updated" ? kicked.guild.version : -1;
    await expect(tableCount(prisma, "party_sessions")).resolves.toBe(1);
    await expect(tableCount(prisma, "group_combat_sessions")).resolves.toBe(1);

    await expect(repository.deleteForTelegramUser(47_001n, version, NOW)).resolves.toMatchObject({ state: "deleted" });
    await expect(tableCount(prisma, "party_sessions")).resolves.toBe(1);
    await expect(tableCount(prisma, "group_combat_sessions")).resolves.toBe(1);
    await expect(prisma.guild.count({ where: { status: "deleted" } })).resolves.toBeGreaterThanOrEqual(1);
  });

  it("keeps moderation audit free of invitation tokens and Telegram identities while exposing privacy-safe counters", async () => {
    await seedCharacter(prisma, "privacy-leader", 48_001n, "Приватний Провідник", 1_000);
    await seedCharacter(prisma, "privacy-member", 48_002n, "Приватна Учасниця", 0);
    const created = await createAndConfirm(repository, 48_001n, "privacy-create-token", "Тихий Аудит", "тихий аудит");
    if (created.state !== "created") {
      throw new Error("Expected privacy guild creation.");
    }
    await repository.createInviteForTelegramUser(48_001n, {
      token: "privacy-private-invite-token",
      targetName: "Приватна Учасниця",
      now: NOW,
      expiresAt: plusHours(23)
    });
    await repository.acceptInviteForTelegramUser(48_002n, "privacy-private-invite-token", NOW);
    const leaderHub = await repository.getHubForTelegramUser(48_001n, NOW);
    if (leaderHub.state !== "ready") {
      throw new Error("Expected privacy guild hub.");
    }
    const member = leaderHub.guild.members.find((row) => row.name === "Приватна Учасниця")!;
    const transferred = await repository.transferLeadershipForTelegramUser(
      48_001n,
      member.id,
      leaderHub.guild.version,
      NOW
    );
    if (transferred.state !== "updated") {
      throw new Error("Expected privacy leadership transfer.");
    }
    const oldLeader = transferred.guild.members.find((row) => row.name === "Приватний Провідник")!;
    await repository.kickMemberForTelegramUser(48_002n, oldLeader.id, transferred.guild.version, NOW);

    const audits = await prisma.guildAudit.findMany({
      where: { guildId: created.guild.id },
      select: { eventType: true, dedupeKey: true, payloadJson: true }
    });
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain("privacy-private-invite-token");
    expect(serialized).not.toMatch(/48_00[12]/u);
    const counters = await repository.getFunnelCounters();
    expect(counters.guildsCreated).toBeGreaterThanOrEqual(1);
    expect(counters.invitesCreated).toBeGreaterThanOrEqual(1);
    expect(counters.invitesAccepted).toBeGreaterThanOrEqual(1);
    expect(counters.memberKicks).toBeGreaterThanOrEqual(1);
    expect(counters.leadershipTransfers).toBeGreaterThanOrEqual(1);
  });

  it("applies and reverses the standalone guild migration without touching party tables", async () => {
    const rollbackDir = await mkdtemp(join(tmpdir(), "kvestarnia-guild-rollback-"));
    const rollbackPrisma = createPrisma(join(rollbackDir, "rollback.db"));
    try {
      await createBaseSchema(rollbackPrisma);
      await applySqlFile(rollbackPrisma, `prisma/migrations/${MIGRATION}/migration.sql`);
      expect(await tableNames(rollbackPrisma)).toContain("guilds");
      await applySqlFile(rollbackPrisma, `prisma/migrations/${MIGRATION}/rollback.sql`);
      const names = await tableNames(rollbackPrisma);
      expect(names).not.toContain("guilds");
      expect(names).not.toContain("guild_members");
      expect(names).toContain("party_sessions");
      expect(names).toContain("group_combat_sessions");
    } finally {
      await rollbackPrisma.$disconnect();
      await rm(rollbackDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});

async function createIntent(
  repository: PrismaGuildRepository,
  telegramUserId: bigint,
  token: string,
  displayName: string,
  normalizedName: string
) {
  return repository.createIntentForTelegramUser(telegramUserId, {
    token,
    displayName,
    normalizedName,
    crest: "🛡️",
    description: "Короткий статут без зайвого босса.",
    goldCost: GUILD_CREATION_GOLD,
    now: NOW,
    expiresAt: new Date(NOW.getTime() + 13 * 60_000)
  });
}

async function createAndConfirm(
  repository: PrismaGuildRepository,
  telegramUserId: bigint,
  token: string,
  displayName: string,
  normalizedName: string
) {
  await createIntent(repository, telegramUserId, token, displayName, normalizedName);
  const result = await repository.confirmCreateForTelegramUser(telegramUserId, token, NOW);
  expect(result.state).toBe("created");
  return result;
}

async function seedCharacter(
  prisma: PrismaClient,
  userId: string,
  telegramUserId: bigint,
  name: string,
  gold: number
): Promise<void> {
  await prisma.user.create({
    data: {
      id: userId,
      telegramUserId,
      character: {
        create: {
          id: `${userId}-character`,
          name,
          raceId: "human",
          classId: "warrior",
          gold,
          statsJson: {}
        }
      }
    }
  });
}

async function goldFor(prisma: PrismaClient, telegramUserId: bigint): Promise<number> {
  return (await prisma.character.findFirstOrThrow({
    where: { user: { telegramUserId } },
    select: { gold: true }
  })).gold;
}

function plusHours(hours: number): Date {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000);
}

function createPrisma(path: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: `file:${path.replace(/\\/g, "/")}` } } });
}

async function applySqlFile(prisma: PrismaClient, path: string): Promise<void> {
  const sql = await readFile(resolve(path), "utf8");
  for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function tableCount(prisma: PrismaClient, table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(rows[0]?.count ?? 0);
}

async function tableNames(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
  );
  return rows.map((row) => row.name);
}

async function createBaseSchema(prisma: PrismaClient): Promise<void> {
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
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
    `CREATE TABLE party_sessions (id TEXT PRIMARY KEY)`,
    `CREATE TABLE party_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'joined',
      active_membership_key TEXT
    )`,
    `CREATE TABLE group_combat_sessions (
      id TEXT PRIMARY KEY,
      party_session_id TEXT NOT NULL,
      FOREIGN KEY (party_session_id) REFERENCES party_sessions(id) ON DELETE CASCADE
    )`
  ]) {
    await prisma.$executeRawUnsafe(statement);
  }
}
