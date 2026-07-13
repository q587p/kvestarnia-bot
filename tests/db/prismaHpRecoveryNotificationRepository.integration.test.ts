import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HpRecoveryNotificationProducer } from "../../src/db/repositories/hpRecoveryNotificationProducer";
import { buildHpRecoveryStateFingerprint } from "../../src/db/repositories/hpRecoveryNotificationRepository";
import { PrismaHpRecoveryNotificationRepository } from "../../src/db/repositories/prismaHpRecoveryNotificationRepository";
import { HealthRecoveryNotificationService } from "../../src/services/healthRecoveryNotificationService";
import { buildEquipmentAttunementPayload } from "../../src/domain/equipment/equipmentAttunement";

describe("PrismaHpRecoveryNotificationRepository integration", () => {
  let dir: string;
  let prisma: PrismaClient;
  let producer: HpRecoveryNotificationProducer;
  let repository: PrismaHpRecoveryNotificationRepository;
  let databaseUrl: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "kvestarnia-hp-recovery-repo-"));
    databaseUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
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

  it("fences every stale checking transition after another Prisma client reclaims the row", async () => {
    const workerAAt = new Date("2026-07-13T12:30:00.000Z");
    const workerBAt = new Date(workerAAt.getTime() + 6 * 60_000);
    await seedCharacter(prisma, "fence", 3002n);
    await prisma.$transaction((tx) => producer.record(tx, "character-fence", workerAAt, "recovering"));
    const workerA = (await repository.claimDue(workerAAt, { checkingLeaseMs: 5 * 60_000 }))[0];
    expect(workerA?.claim).toBe("checking");

    const secondClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const workerBRepository = new PrismaHpRecoveryNotificationRepository(secondClient, producer);
    try {
      const workerB = (await workerBRepository.claimDue(workerBAt, { checkingLeaseMs: 5 * 60_000 }))[0];
      expect(workerB?.claim).toBe("checking");
      if (!workerA || workerA.claim !== "checking" || !workerB || workerB.claim !== "checking") {
        throw new Error("Expected both checking claims.");
      }
      const [snapshot] = await repository.loadSnapshots([workerA.characterId], workerBAt);
      if (!snapshot) {
        throw new Error("Missing recovery snapshot.");
      }
      const transition = {
        characterId: workerA.characterId,
        generation: workerA.generation,
        remortCount: workerA.remortCount,
        sourceHpCurrent: snapshot.hpCurrent,
        sourceHpMax: snapshot.hpMax,
        sourceHpRegenAt: snapshot.hpRegenAt,
        sourceFingerprint: buildHpRecoveryStateFingerprint(snapshot, workerBAt),
        nextAttemptAt: workerBAt,
        claimStartedAt: workerA.claimStartedAt
      };

      expect(await repository.rebase(transition)).toBe(false);
      expect(await repository.suppressChecking({
        characterId: workerA.characterId,
        generation: workerA.generation,
        remortCount: workerA.remortCount,
        claimStartedAt: workerA.claimStartedAt,
        now: workerBAt,
        errorCode: "stale-a"
      })).toBe(false);
      expect(await repository.markReady({
        ...transition,
        readyAt: workerBAt,
        effectiveHpMax: 25
      })).toBe(false);

      expect(await prisma.hpRecoveryNotification.findUnique({
        where: { characterId: workerB.characterId }
      })).toMatchObject({
        generation: workerB.generation,
        status: "checking",
        processingStartedAt: workerB.claimStartedAt
      });
    } finally {
      await secondClient.$disconnect();
    }
  });

  it("runs producer through canonical HP CAS and at-most-once delivery end to end", async () => {
    const dueAt = new Date("2026-07-13T13:00:00.000Z");
    await seedCharacter(prisma, "e2e", 3003n);
    await prisma.character.update({
      where: { id: "character-e2e" },
      data: { hpCurrent: 24, hpRegenAt: new Date(dueAt.getTime() - 60 * 60_000) }
    });
    await prisma.$transaction((tx) => producer.record(tx, "character-e2e", dueAt, "recovering", {
      nextAttemptAt: dueAt
    }));
    const sendMessage = vi.fn().mockResolvedValue(true);

    const metrics = await new HealthRecoveryNotificationService(repository, true, false)
      .runBatch({ sendMessage }, dueAt);

    expect(metrics).toMatchObject({ due: 1, claimed: 1, sent: 1, errors: 0 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(await prisma.character.findUnique({ where: { id: "character-e2e" } })).toMatchObject({
      hpCurrent: 25,
      hpRegenAt: dueAt
    });
    expect(await prisma.hpRecoveryNotification.findUnique({
      where: { characterId: "character-e2e" }
    })).toMatchObject({ status: "sent", sentAt: dueAt });
  });

  it("bounds historical attunement loading while retaining every current equipped pending row", async () => {
    const checkAt = new Date("2026-07-13T14:00:00.000Z");
    await seedCharacter(prisma, "attunement", 3004n);
    const equipmentUpdatedAt = new Date(checkAt.getTime() - 60_000);
    await prisma.characterEquipment.create({
      data: {
        id: "equipment-attunement",
        characterId: "character-attunement",
        slot: "chest",
        itemId: "item.apron-of-foam-resistance",
        createdAt: equipmentUpdatedAt,
        updatedAt: equipmentUpdatedAt
      }
    });
    await prisma.dailyAction.createMany({
      data: Array.from({ length: 587 }, (_, index) => ({
        id: `old-attunement-${index}`,
        characterId: "character-attunement",
        key: "equipment.attunement",
        localDate: `old-${index}`,
        rewardXp: 0,
        rewardGold: 0,
        resultJson: { version: 1, status: "cancelled" },
        createdAt: new Date(checkAt.getTime() - 24 * 60 * 60_000 - index)
      }))
    });
    await prisma.dailyAction.create({
      data: {
        id: "current-attunement",
        characterId: "character-attunement",
        key: "equipment.attunement",
        localDate: "current",
        rewardXp: 0,
        rewardGold: 0,
        createdAt: equipmentUpdatedAt,
        resultJson: buildEquipmentAttunementPayload({
          slot: "chest",
          itemId: "item.apron-of-foam-resistance",
          itemName: "apron",
          equipmentUpdatedAt,
          strength: "strong",
          startedAt: equipmentUpdatedAt,
          readyAt: new Date(checkAt.getTime() + 41 * 60_000)
        })
      }
    });

    const [snapshot] = await repository.loadSnapshots(["character-attunement"], checkAt);

    expect(snapshot?.attunementActions).toHaveLength(1);
    expect(snapshot?.attunementActions[0]?.resultJson).toMatchObject({ itemId: "item.apron-of-foam-resistance" });
  });

  it("keeps actual SQLite snapshot SELECT count constant from one to thirteen candidates", async () => {
    const checkAt = new Date("2026-07-13T15:00:00.000Z");
    for (let index = 0; index < 13; index += 1) {
      await seedCharacter(prisma, `shape-${index}`, BigInt(4000 + index));
    }
    const queries: string[] = [];
    const queryClient = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: [{ emit: "event", level: "query" }]
    });
    queryClient.$on("query", (event) => queries.push(event.query));
    const queryRepository = new PrismaHpRecoveryNotificationRepository(queryClient, producer);
    try {
      queries.length = 0;
      expect(await queryRepository.claimDue(checkAt)).toEqual([]);
      expect(queries.filter((query) => /^SELECT/i.test(query.trim()))).toHaveLength(1);

      queries.length = 0;
      await queryRepository.loadSnapshots(["character-shape-0"], checkAt);
      const oneCandidateSelects = queries.filter((query) => /^SELECT/i.test(query.trim())).length;

      queries.length = 0;
      await queryRepository.loadSnapshots(
        Array.from({ length: 13 }, (_, index) => `character-shape-${index}`),
        checkAt
      );
      const thirteenCandidateSelects = queries.filter((query) => /^SELECT/i.test(query.trim())).length;

      expect(oneCandidateSelects).toBeGreaterThan(0);
      expect(thirteenCandidateSelects).toBe(oneCandidateSelects);
    } finally {
      await queryClient.$disconnect();
    }
  });

  it.each(["resource", "effective", "activity", "generation", "life"] as const)(
    "rejects a final %s race before the ready row can enter sending",
    async (race) => {
      const readyAt = new Date("2026-07-13T16:00:00.000Z");
      const deliveryAt = new Date(readyAt.getTime() + 60_000);
      await seedCharacter(prisma, `race-${race}`, BigInt(5000 + race.length));
      const characterId = `character-race-${race}`;
      await prisma.character.update({
        where: { id: characterId },
        data: { hpCurrent: 25, hpRegenAt: readyAt }
      });
      await prisma.$transaction((tx) => producer.record(tx, characterId, readyAt, "recovering"));
      const [snapshot] = await repository.loadSnapshots([characterId], readyAt);
      if (!snapshot) {
        throw new Error("Missing ready-race snapshot.");
      }
      const fingerprint = buildHpRecoveryStateFingerprint(snapshot, readyAt);
      const queue = await prisma.hpRecoveryNotification.update({
        where: { characterId },
        data: {
          status: "ready",
          readyAt,
          nextAttemptAt: readyAt,
          sourceHpCurrent: 25,
          sourceHpRegenAt: readyAt,
          sourceFingerprint: fingerprint
        }
      });

      if (race === "resource") {
        await prisma.character.update({ where: { id: characterId }, data: { hpCurrent: 24 } });
      } else if (race === "effective") {
        await prisma.character.update({ where: { id: characterId }, data: { level: 2 } });
      } else if (race === "activity") {
        await prisma.user.update({
          where: { id: `user-race-${race}` },
          data: { lastActionAt: new Date(readyAt.getTime() + 1) }
        });
      } else if (race === "generation") {
        await prisma.$transaction((tx) => producer.record(tx, characterId, deliveryAt, "recovering"));
      } else {
        await prisma.characterRemort.create({
          data: {
            id: `remort-${race}`,
            characterId,
            token: `remort-token-${race}`,
            remortNumber: 1,
            previousLevel: 1,
            previousXp: 0,
            previousGold: 0,
            displayNameSnapshot: "old life",
            preservedPayloadJson: {}
          }
        });
      }

      expect(await repository.claimReadyForSending({
        characterId,
        generation: queue.generation,
        remortCount: 0,
        expectedHpCurrent: 25,
        expectedHpRegenAt: readyAt,
        expectedStateFingerprint: fingerprint,
        expectedEffectiveHpMax: 25,
        readyAt,
        now: deliveryAt
      })).toBe(false);
      expect((await prisma.hpRecoveryNotification.findUnique({ where: { characterId } }))?.status).not.toBe("sending");
    }
  );
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
  await prisma.$executeRawUnsafe(`CREATE TABLE active_combat_leases (
    id TEXT NOT NULL PRIMARY KEY,
    character_id TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    reference_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE character_equipment (
    id TEXT NOT NULL PRIMARY KEY,
    character_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    item_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL,
    UNIQUE(character_id, slot),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE daily_actions (
    id TEXT NOT NULL PRIMARY KEY,
    character_id TEXT NOT NULL,
    key TEXT NOT NULL,
    local_date TEXT NOT NULL,
    reward_xp INTEGER NOT NULL,
    reward_gold INTEGER NOT NULL,
    spent_gold INTEGER NOT NULL DEFAULT 0,
    result_json JSONB,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(character_id, key, local_date),
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE character_drink_states (
    id TEXT NOT NULL PRIMARY KEY,
    activation_id TEXT NOT NULL UNIQUE,
    character_id TEXT NOT NULL UNIQUE,
    remort_count INTEGER NOT NULL DEFAULT 0,
    drink_key TEXT NOT NULL,
    phase TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    metadata_json JSONB,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL,
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
