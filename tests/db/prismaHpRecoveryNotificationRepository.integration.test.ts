import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HpRecoveryNotificationProducer } from "../../src/db/repositories/hpRecoveryNotificationProducer";
import { PrismaHpRecoveryNotificationRepository } from "../../src/db/repositories/prismaHpRecoveryNotificationRepository";

describe("PrismaHpRecoveryNotificationRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let producer: HpRecoveryNotificationProducer;
  let repository: PrismaHpRecoveryNotificationRepository;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-hp-recovery-repo-"));
    prisma = new PrismaClient({
      datasources: { db: { url: `file:${join(dir, "test.db").replace(/\\/g, "/")}` } }
    });
    await createBaseSchema(prisma);
    await applyMigration(prisma);
    producer = new HpRecoveryNotificationProducer(true);
    repository = new PrismaHpRecoveryNotificationRepository(prisma, producer);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await prisma.hpRecoveryNotification.deleteMany();
    await prisma.character.deleteMany();
    await prisma.user.deleteMany();
  });

  it("creates the unique character row, advances generation, and installs worker indexes", async () => {
    await seedCharacter(prisma, "generation", 1001n);
    const now = new Date("2026-07-13T10:00:00.000Z");

    await prisma.$transaction((tx) => producer.record(tx, "character-generation", now, "recovering"));
    await prisma.$transaction((tx) => producer.record(tx, "character-generation", now, "recovering"));

    const rows = await prisma.hpRecoveryNotification.findMany({
      where: { characterId: "character-generation" }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.generation).toBe(2);

    const indexes = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      "PRAGMA index_list('hp_recovery_notifications')"
    );
    expect(indexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      "hp_recovery_notifications_character_id_key",
      "hp_recovery_notifications_status_next_attempt_at_idx",
      "hp_recovery_notifications_status_processing_started_at_idx"
    ]));
  });

  it("does not create rows for healing-only suppression and invalidates an existing generation", async () => {
    await seedCharacter(prisma, "suppression", 1002n);
    const now = new Date("2026-07-13T10:05:00.000Z");

    await prisma.$transaction((tx) => producer.record(tx, "character-suppression", now, "suppress"));
    expect(await prisma.hpRecoveryNotification.count()).toBe(0);

    await prisma.$transaction((tx) => producer.record(tx, "character-suppression", now, "recovering"));
    await prisma.$transaction((tx) => producer.record(tx, "character-suppression", now, "suppress", {
      errorCode: "direct-heal-full"
    }));

    expect(await prisma.hpRecoveryNotification.findUnique({
      where: { characterId: "character-suppression" }
    })).toMatchObject({
      generation: 2,
      status: "suppressed",
      lastErrorCode: "direct-heal-full"
    });
  });

  it("claims in bounded due order and two workers cannot claim one generation", async () => {
    const now = new Date("2026-07-13T11:00:00.000Z");
    for (let index = 0; index < 15; index += 1) {
      const suffix = `due-${index}`;
      await seedCharacter(prisma, suffix, BigInt(2000 + index));
      await prisma.hpRecoveryNotification.create({
        data: {
          characterId: `character-${suffix}`,
          sourceHpCurrent: 1,
          sourceHpMax: 25,
          nextAttemptAt: new Date(now.getTime() - (15 - index) * 1000)
        }
      });
    }

    const first = await repository.claimDue(now, { limit: 13 });
    expect(first).toHaveLength(13);
    expect(first[0]?.characterId).toBe("character-due-0");
    expect(first[12]?.characterId).toBe("character-due-12");

    await prisma.hpRecoveryNotification.updateMany({ data: { status: "suppressed" } });
    await prisma.hpRecoveryNotification.update({
      where: { characterId: "character-due-14" },
      data: { status: "waiting", nextAttemptAt: now, processingStartedAt: null }
    });
    const [left, right] = await Promise.all([
      repository.claimDue(now, { limit: 1 }),
      repository.claimDue(now, { limit: 1 })
    ]);
    expect(left.length + right.length).toBe(1);
  });

  it("preserves fresh checking leases, resumes stale checks, and never resumes terminal rows", async () => {
    const now = new Date("2026-07-13T12:00:00.000Z");
    await seedCharacter(prisma, "leases", 3001n);
    await prisma.hpRecoveryNotification.create({
      data: {
        characterId: "character-leases",
        sourceHpCurrent: 1,
        sourceHpMax: 25,
        status: "checking",
        processingStartedAt: new Date(now.getTime() - 60_000),
        nextAttemptAt: new Date(now.getTime() - 60_000)
      }
    });

    expect(await repository.claimDue(now, { checkingLeaseMs: 5 * 60_000 })).toEqual([]);
    await prisma.hpRecoveryNotification.update({
      where: { characterId: "character-leases" },
      data: { processingStartedAt: new Date(now.getTime() - 6 * 60_000) }
    });
    expect(await repository.claimDue(now, { checkingLeaseMs: 5 * 60_000 })).toHaveLength(1);

    for (const status of ["sent", "suppressed"] as const) {
      await prisma.hpRecoveryNotification.update({
        where: { characterId: "character-leases" },
        data: { status, nextAttemptAt: new Date(0), processingStartedAt: null }
      });
      expect(await repository.claimDue(now)).toEqual([]);
    }

    await prisma.hpRecoveryNotification.update({
      where: { characterId: "character-leases" },
      data: {
        status: "sending",
        processingStartedAt: new Date(now.getTime() - 14 * 60_000),
        nextAttemptAt: new Date(0)
      }
    });
    const staleSend = await repository.claimDue(now, { sendingLeaseMs: 13 * 60_000 });
    expect(staleSend[0]?.claim).toBe("suppressed-stale-send");
    expect((await prisma.hpRecoveryNotification.findUnique({
      where: { characterId: "character-leases" }
    }))?.status).toBe("suppressed");
  });
});

async function createBaseSchema(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE users (
    id TEXT NOT NULL PRIMARY KEY,
    telegram_user_id BIGINT NOT NULL UNIQUE,
    username TEXT,
    display_name TEXT,
    language_code TEXT,
    last_action_at DATETIME,
    last_seen_location_id TEXT,
    current_raid_id TEXT,
    current_adventure_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE characters (
    id TEXT NOT NULL PRIMARY KEY,
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
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE character_remorts (
    id TEXT NOT NULL PRIMARY KEY,
    character_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    remort_number INTEGER NOT NULL,
    previous_level INTEGER NOT NULL,
    previous_xp INTEGER NOT NULL,
    previous_gold INTEGER NOT NULL,
    display_name_snapshot TEXT NOT NULL,
    preserved_payload_json JSONB NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, remort_number),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);
}

async function applyMigration(prisma: PrismaClient): Promise<void> {
  const sql = await readFile(resolve(
    "prisma/migrations/20260713130000_hp_recovery_notifications/migration.sql"
  ), "utf8");
  for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function seedCharacter(prisma: PrismaClient, suffix: string, telegramUserId: bigint): Promise<void> {
  const now = new Date("2026-07-13T09:00:00.000Z");
  await prisma.user.create({
    data: { id: `user-${suffix}`, telegramUserId, updatedAt: now }
  });
  await prisma.character.create({
    data: {
      id: `character-${suffix}`,
      userId: `user-${suffix}`,
      name: suffix,
      raceId: "race.human",
      classId: "class.warrior",
      hpCurrent: 1,
      hpMax: 25,
      hpRegenAt: now,
      statsJson: { strength: 6, dexterity: 6, intelligence: 6, charisma: 6, luck: 6 },
      updatedAt: now
    }
  });
}
